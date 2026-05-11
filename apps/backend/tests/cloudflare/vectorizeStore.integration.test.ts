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
})
