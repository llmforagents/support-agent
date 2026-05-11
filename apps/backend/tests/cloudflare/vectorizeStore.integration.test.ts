// Integration tests for VectorizeStore.
//
// Vectorize-side: an in-memory mock (tests/cloudflare/mocks/inMemoryVectorize.ts)
// stands in because the miniflare bundled with vitest-pool-workers 0.5.41 has
// no Vectorize. The single `as unknown as VectorizeIndex` cast at the binding
// site is the sanctioned test-fixture escape hatch.
//
// D1-side: the real miniflare D1 binding (`env.DB`) is used so chunk row
// inserts, joins, and cascade behavior are exercised end-to-end.
import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { randomUUID } from 'node:crypto'
import { VectorizeStore } from '../../src/infrastructure/adapters/cloudflare/vectorizeStore'
import { D1KnowledgeStore } from '../../src/infrastructure/adapters/cloudflare/d1KnowledgeStore'
import { runD1Migrations } from '../../src/infrastructure/adapters/cloudflare/d1Migrations'
import { InMemoryVectorize } from './mocks/inMemoryVectorize'
import { ChunkId, SourceId } from '@support/shared'
import type { ChunkInsert, SourceConfig, SourceState } from '../../src/domain/source'

const DIM = 1536

function axisVector(axis: number, dim = DIM): readonly number[] {
  const v = new Array<number>(dim).fill(0)
  v[axis] = 1
  return v
}

function makeChunk(
  sourceId: string,
  chunkIndex: number,
  embedding: readonly number[],
  gen = 1,
  metadata: Record<string, unknown> = {},
): ChunkInsert {
  return {
    id: ChunkId(randomUUID()),
    sourceId: SourceId(sourceId),
    chunkIndex,
    text: `chunk text for index ${chunkIndex}`,
    tokenCount: 10,
    embedding,
    ingestGeneration: gen,
    metadata,
  }
}

describe('VectorizeStore @integration', () => {
  let mock: InMemoryVectorize
  let knowledge: D1KnowledgeStore
  let store: VectorizeStore

  beforeEach(async () => {
    await runD1Migrations(env.DB)
    await env.DB.prepare('DELETE FROM sources').run()
    mock = new InMemoryVectorize()
    knowledge = new D1KnowledgeStore(env.DB)
    // Test-only cast: the mock is structurally compatible but VectorizeIndex
    // is an `abstract class` declaration, so a structural assignment trips
    // TS. Sanctioned by the project rules as a test fixture escape hatch.
    const index = mock as unknown as VectorizeIndex
    store = new VectorizeStore(index, env.DB)
  })

  it('upsertChunks writes the D1 row + Vectorize entry; both retrievable by chunk id', async () => {
    const config: SourceConfig = { sourceType: 'txt', fileRef: 'r' }
    const src = await knowledge.createSource({ name: 't', sourceType: 'txt', config })
    expect(src.ok).toBe(true)
    if (!src.ok) return

    const chunk = makeChunk(src.value.id, 0, axisVector(0), 1)
    const r = await store.upsertChunks([chunk])
    expect(r.ok).toBe(true)

    // D1 row present with expected text + generation.
    const row = await env.DB
      .prepare('SELECT id, text, ingest_generation FROM chunks WHERE id = ?')
      .bind(chunk.id)
      .first<{ id: string; text: string; ingest_generation: number }>()
    expect(row?.text).toBe(chunk.text)
    expect(row?.ingest_generation).toBe(1)

    // Vectorize side received the entry.
    expect(mock.size()).toBe(1)
    expect(mock.ids()).toContain(chunk.id)
  })

  it('upsertChunks is idempotent: re-running with the same ids replaces the rows', async () => {
    const config: SourceConfig = { sourceType: 'txt', fileRef: 'r' }
    const src = await knowledge.createSource({ name: 'idem', sourceType: 'txt', config })
    if (!src.ok) return

    const chunk = makeChunk(src.value.id, 0, axisVector(0), 1)
    const first = await store.upsertChunks([chunk])
    expect(first.ok).toBe(true)

    // Re-upsert the same id with different text — should replace, not error.
    const replaced: ChunkInsert = { ...chunk, text: 'replaced text' }
    const second = await store.upsertChunks([replaced])
    expect(second.ok).toBe(true)

    const row = await env.DB
      .prepare('SELECT text FROM chunks WHERE id = ?')
      .bind(chunk.id)
      .first<{ text: string }>()
    expect(row?.text).toBe('replaced text')
    expect(mock.size()).toBe(1)
  })

  it('upsertChunks with empty array is a no-op', async () => {
    const r = await store.upsertChunks([])
    expect(r.ok).toBe(true)
    expect(mock.size()).toBe(0)
  })

  // ── D2: search ──────────────────────────────────────────────────────────

  async function createReadySource(name: string, gen = 1): Promise<string> {
    const config: SourceConfig = { sourceType: 'txt', fileRef: `${name}.txt` }
    const created = await knowledge.createSource({ name, sourceType: 'txt', config })
    if (!created.ok) throw new Error('createSource failed')
    const ready: SourceState = {
      status: 'ready',
      currentGeneration: gen,
      ingestedAt: new Date(),
      chunkCount: 0,
    }
    const upd = await knowledge.updateSourceState(created.value.id, ready)
    if (!upd.ok) throw new Error('updateSourceState failed')
    return created.value.id
  }

  it('search returns hits ordered by cosine score, with source name + text', async () => {
    const sourceId = await createReadySource('Source A')
    const chunk0 = makeChunk(sourceId, 0, axisVector(0))
    const chunk1 = makeChunk(sourceId, 1, axisVector(1))
    const ins = await store.upsertChunks([chunk0, chunk1])
    expect(ins.ok).toBe(true)

    const r = await store.search(axisVector(0), { topK: 10, minScore: 0 })
    expect(r.ok).toBe(true)
    if (!r.ok) return

    expect(r.value.length).toBeGreaterThanOrEqual(1)
    const top = r.value[0]
    expect(top).toBeDefined()
    if (!top) return
    expect(top.score).toBeGreaterThan(0.99)
    expect(top.text).toBe(chunk0.text)
    expect(top.sourceName).toBe('Source A')
    expect(top.sourceId).toBe(sourceId)
  })

  it('search filters out stale-generation chunks', async () => {
    // Source advances to generation 2; gen-1 chunks must not surface.
    const sourceId = await createReadySource('Stale Source', 2)
    const stale = makeChunk(sourceId, 0, axisVector(0), 1)
    const current = makeChunk(sourceId, 1, axisVector(1), 2)
    await store.upsertChunks([stale, current])

    const r = await store.search(axisVector(0), { topK: 10, minScore: 0 })
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const ids = r.value.map((h) => h.id)
    expect(ids).not.toContain(stale.id)
    expect(ids).toContain(current.id)
  })

  it('search excludes inactive sources', async () => {
    const sourceId = await createReadySource('Inactive')
    await store.upsertChunks([makeChunk(sourceId, 0, axisVector(0))])
    const deact = await knowledge.setActive(SourceId(sourceId), false)
    expect(deact.ok).toBe(true)

    const r = await store.search(axisVector(0), { topK: 10, minScore: 0 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toHaveLength(0)
  })

  it('search excludes non-ready sources', async () => {
    const config: SourceConfig = { sourceType: 'txt', fileRef: 'idle.txt' }
    const created = await knowledge.createSource({ name: 'Idle', sourceType: 'txt', config })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const sourceId = created.value.id

    // Leave state as { status: 'idle', currentGeneration: 0 } and upsert a chunk
    // at generation 0 so a generation match alone would otherwise pass.
    await store.upsertChunks([makeChunk(sourceId, 0, axisVector(0), 0)])

    const r = await store.search(axisVector(0), { topK: 10, minScore: 0 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toHaveLength(0)
  })

  it('search respects minScore', async () => {
    const sourceId = await createReadySource('Score Source')
    const high = makeChunk(sourceId, 0, axisVector(0))
    const low = makeChunk(sourceId, 1, axisVector(1))
    await store.upsertChunks([high, low])

    const r = await store.search(axisVector(0), { topK: 10, minScore: 0.5 })
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const texts = r.value.map((h) => h.text)
    expect(texts).toContain(high.text)
    expect(texts).not.toContain(low.text)
  })

  it('search restricts results when activeSourceIds is set', async () => {
    const a = await createReadySource('Source A')
    const b = await createReadySource('Source B')
    await store.upsertChunks([makeChunk(a, 0, axisVector(0)), makeChunk(b, 0, axisVector(0))])

    const r = await store.search(axisVector(0), {
      topK: 10,
      minScore: 0,
      activeSourceIds: [SourceId(a)],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return

    expect(r.value).toHaveLength(1)
    const hit = r.value[0]
    expect(hit?.sourceId).toBe(a)
    expect(hit?.sourceName).toBe('Source A')
  })

  it('search returns metadata stored on the chunk', async () => {
    const sourceId = await createReadySource('Meta Source')
    const meta = { page: 3, section: 'intro' }
    await store.upsertChunks([makeChunk(sourceId, 0, axisVector(0), 1, meta)])

    const r = await store.search(axisVector(0), { topK: 1, minScore: 0 })
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const hit = r.value[0]
    expect(hit?.metadata).toEqual(meta)
  })

  // ── D3: deleteBySourceBelowGeneration ──────────────────────────────────

  it('deleteBySourceBelowGeneration drops stale chunks from D1 AND Vectorize', async () => {
    const sourceA = await createReadySource('A', 2)
    const sourceB = await createReadySource('B', 1)

    // sourceA: two gen-1 (stale) + two gen-2 (current)
    const a1Stale1 = makeChunk(sourceA, 0, axisVector(0), 1)
    const a1Stale2 = makeChunk(sourceA, 1, axisVector(1), 1)
    const a2Cur1 = makeChunk(sourceA, 2, axisVector(2), 2)
    const a2Cur2 = makeChunk(sourceA, 3, axisVector(3), 2)
    // sourceB: untouched
    const b1 = makeChunk(sourceB, 0, axisVector(4), 1)
    await store.upsertChunks([a1Stale1, a1Stale2, a2Cur1, a2Cur2, b1])

    expect(mock.size()).toBe(5)

    const del = await store.deleteBySourceBelowGeneration(SourceId(sourceA), 2)
    expect(del.ok).toBe(true)

    // D1: only sourceA gen-2 (2 rows) and sourceB gen-1 (1 row) remain.
    const remaining = await env.DB
      .prepare('SELECT id FROM chunks ORDER BY chunk_index')
      .all<{ id: string }>()
    const ids = new Set(remaining.results.map((r) => r.id))
    expect(ids.has(a1Stale1.id)).toBe(false)
    expect(ids.has(a1Stale2.id)).toBe(false)
    expect(ids.has(a2Cur1.id)).toBe(true)
    expect(ids.has(a2Cur2.id)).toBe(true)
    expect(ids.has(b1.id)).toBe(true)

    // Vectorize: same 3 ids remain.
    const vecIds = new Set(mock.ids())
    expect(vecIds.has(a1Stale1.id)).toBe(false)
    expect(vecIds.has(a1Stale2.id)).toBe(false)
    expect(vecIds.has(a2Cur1.id)).toBe(true)
    expect(vecIds.has(a2Cur2.id)).toBe(true)
    expect(vecIds.has(b1.id)).toBe(true)
    expect(mock.size()).toBe(3)
  })

  it('deleteBySourceBelowGeneration on a source with no stale chunks is a no-op', async () => {
    const sourceId = await createReadySource('NoStale', 1)
    await store.upsertChunks([makeChunk(sourceId, 0, axisVector(0), 1)])

    const del = await store.deleteBySourceBelowGeneration(SourceId(sourceId), 1)
    expect(del.ok).toBe(true)
    expect(mock.size()).toBe(1)

    const remaining = await env.DB
      .prepare('SELECT COUNT(*) AS c FROM chunks')
      .first<{ c: number }>()
    expect(remaining?.c).toBe(1)
  })

  // ── D4: previewBySource ────────────────────────────────────────────────

  it('previewBySource returns current-generation chunks ordered by chunkIndex', async () => {
    const sourceId = await createReadySource('Preview', 1)
    // Out-of-order insert to confirm sort is by chunk_index, not insert order.
    await store.upsertChunks([
      makeChunk(sourceId, 2, axisVector(2), 1),
      makeChunk(sourceId, 0, axisVector(0), 1),
      makeChunk(sourceId, 1, axisVector(1), 1),
    ])

    const r = await store.previewBySource(SourceId(sourceId), 10)
    expect(r.ok).toBe(true)
    if (!r.ok) return

    expect(r.value).toHaveLength(3)
    expect(r.value[0]?.text).toBe('chunk text for index 0')
    expect(r.value[1]?.text).toBe('chunk text for index 1')
    expect(r.value[2]?.text).toBe('chunk text for index 2')
    // ChunkHit shape: source name + score=1.0 + metadata defaulted.
    expect(r.value[0]?.sourceId).toBe(sourceId)
    expect(r.value[0]?.sourceName).toBe('Preview')
    expect(r.value[0]?.score).toBe(1.0)
  })

  it('previewBySource respects the limit', async () => {
    const sourceId = await createReadySource('Limited', 1)
    await store.upsertChunks([
      makeChunk(sourceId, 0, axisVector(0), 1),
      makeChunk(sourceId, 1, axisVector(1), 1),
      makeChunk(sourceId, 2, axisVector(2), 1),
    ])

    const r = await store.previewBySource(SourceId(sourceId), 2)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toHaveLength(2)
  })

  it('previewBySource filters out stale-generation chunks', async () => {
    const sourceId = await createReadySource('GenFilter', 2)
    // 2 stale (gen 0) + 3 current (gen 2)
    await store.upsertChunks([
      makeChunk(sourceId, 0, axisVector(0), 0),
      makeChunk(sourceId, 1, axisVector(1), 0),
      makeChunk(sourceId, 2, axisVector(2), 2),
      makeChunk(sourceId, 3, axisVector(3), 2),
      makeChunk(sourceId, 4, axisVector(4), 2),
    ])

    const r = await store.previewBySource(SourceId(sourceId), 10)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toHaveLength(3)
    expect(r.value.map((h) => h.text)).toEqual([
      'chunk text for index 2',
      'chunk text for index 3',
      'chunk text for index 4',
    ])
  })

  it('previewBySource returns empty for an unknown source id', async () => {
    const r = await store.previewBySource(SourceId('00000000-0000-4000-8000-000000000000'), 5)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toHaveLength(0)
  })
})
