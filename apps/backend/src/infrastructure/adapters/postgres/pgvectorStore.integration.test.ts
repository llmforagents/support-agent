import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { usePostgres } from '../../../../tests/helpers/pgFixture'
import { PgKnowledgeStore } from './pgKnowledgeStore'
import { PgvectorStore } from './pgvectorStore'
import { ChunkId, SourceId } from '@support/shared'
import type { ChunkInsert, SourceConfig, SourceState } from '../../../domain/source'

const DIM = 1536

/** Create a unit vector along axis `axis` (all zeros except a 1 at `axis`). */
function axisVector(axis: number, dim = DIM): readonly number[] {
  const v = new Array<number>(dim).fill(0)
  v[axis] = 1
  return v
}

/** Build a chunk with a deterministic embedding. */
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

describe('PgvectorStore @integration', () => {
  const pg = usePostgres()

  beforeEach(async () => {
    await pg.pool.query('TRUNCATE sources CASCADE')
  })

  async function createReadySource(
    knowledgeStore: PgKnowledgeStore,
    name: string,
    gen = 1,
  ): Promise<string> {
    const config: SourceConfig = { sourceType: 'txt', fileRef: `${name}.txt` }
    const created = await knowledgeStore.createSource({ name, sourceType: 'txt', config })
    if (!created.ok) throw new Error('createSource failed')
    const id = created.value.id
    const readyState: SourceState = { status: 'ready', currentGeneration: gen, ingestedAt: new Date(), chunkCount: 0 }
    await knowledgeStore.updateSourceState(id, readyState)
    return id
  }

  it('upsertChunks then search returns hits ordered by cosine score', async () => {
    const knowledgeStore = new PgKnowledgeStore(pg.pool)
    const vectorStore = new PgvectorStore(pg.pool)

    const sourceId = await createReadySource(knowledgeStore, 'Source A')

    // chunk 0: embedding along axis 0 (most similar to query)
    // chunk 1: embedding along axis 1 (less similar)
    const chunk0 = makeChunk(sourceId, 0, axisVector(0))
    const chunk1 = makeChunk(sourceId, 1, axisVector(1))

    const ins = await vectorStore.upsertChunks([chunk0, chunk1])
    expect(ins.ok).toBe(true)

    // Query along axis 0 — chunk0 should score 1.0, chunk1 should score 0.0
    const query = axisVector(0)
    const result = await vectorStore.search(query, { topK: 10, minScore: 0 })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.length).toBeGreaterThanOrEqual(1)
    const firstHit = result.value[0]
    expect(firstHit).toBeDefined()
    if (!firstHit) return
    expect(firstHit.score).toBeCloseTo(1.0, 3)
    expect(firstHit.text).toBe(chunk0.text)
    expect(firstHit.sourceName).toBe('Source A')
  })

  it('search excludes inactive sources', async () => {
    const knowledgeStore = new PgKnowledgeStore(pg.pool)
    const vectorStore = new PgvectorStore(pg.pool)

    const sourceId = await createReadySource(knowledgeStore, 'Inactive Source')
    const chunk = makeChunk(sourceId, 0, axisVector(0))
    await vectorStore.upsertChunks([chunk])

    // Mark inactive
    await knowledgeStore.setActive(SourceId(sourceId), false)

    const result = await vectorStore.search(axisVector(0), { topK: 10, minScore: 0 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toHaveLength(0)
  })

  it('search excludes non-ready sources', async () => {
    const knowledgeStore = new PgKnowledgeStore(pg.pool)
    const vectorStore = new PgvectorStore(pg.pool)

    // Create source but leave it as idle (not ready)
    const config: SourceConfig = { sourceType: 'txt', fileRef: 'idle.txt' }
    const created = await knowledgeStore.createSource({
      name: 'Idle Source',
      sourceType: 'txt',
      config,
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const sourceId = created.value.id

    // Insert chunk with generation 1, but state is idle with gen=0
    // We manually set state to ingesting to have a chunk gen mismatch
    const ingestingState: SourceState = { status: 'ingesting', currentGeneration: 0, pendingGeneration: 1, startedAt: new Date(), progress: { processed: 0, total: 0 } }
    await knowledgeStore.updateSourceState(sourceId, ingestingState)

    const chunk = makeChunk(sourceId, 0, axisVector(0), 1)
    await vectorStore.upsertChunks([chunk])

    const result = await vectorStore.search(axisVector(0), { topK: 10, minScore: 0 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toHaveLength(0)
  })

  it('deleteBySourceBelowGeneration removes only stale chunks for that source', async () => {
    const knowledgeStore = new PgKnowledgeStore(pg.pool)
    const vectorStore = new PgvectorStore(pg.pool)

    const sourceA = await createReadySource(knowledgeStore, 'Source A', 2)
    const sourceB = await createReadySource(knowledgeStore, 'Source B', 1)

    // sourceA: gen1 (stale) and gen2 (current)
    const chunkA1 = makeChunk(sourceA, 0, axisVector(0), 1)
    const chunkA2 = makeChunk(sourceA, 1, axisVector(1), 2)
    // sourceB: gen1 (current)
    const chunkB1 = makeChunk(sourceB, 0, axisVector(2), 1)

    await vectorStore.upsertChunks([chunkA1, chunkA2, chunkB1])

    // Verify 3 chunks present
    const count1 = await pg.pool.query<{ c: string }>('SELECT COUNT(*)::text AS c FROM chunks')
    expect(Number(count1.rows[0]?.['c'])).toBe(3)

    // Delete sourceA chunks below gen 2
    const del = await vectorStore.deleteBySourceBelowGeneration(SourceId(sourceA), 2)
    expect(del.ok).toBe(true)

    // Should have 2 chunks: chunkA2 (gen2) and chunkB1 (gen1 — different source)
    const count2 = await pg.pool.query<{ c: string }>('SELECT COUNT(*)::text AS c FROM chunks')
    expect(Number(count2.rows[0]?.['c'])).toBe(2)

    // Verify chunkA1 is gone, chunkA2 and chunkB1 remain
    const remaining = await pg.pool.query<{ id: string }>('SELECT id FROM chunks')
    const ids = remaining.rows.map((r) => r.id)
    expect(ids).not.toContain(chunkA1.id)
    expect(ids).toContain(chunkA2.id)
    expect(ids).toContain(chunkB1.id)
  })

  it('minScore filter excludes low-similarity hits', async () => {
    const knowledgeStore = new PgKnowledgeStore(pg.pool)
    const vectorStore = new PgvectorStore(pg.pool)

    const sourceId = await createReadySource(knowledgeStore, 'Score Source')

    // chunk at axis 0 (score ~1.0 vs axis-0 query)
    // chunk at axis 1 (score ~0.0 vs axis-0 query)
    const chunkHigh = makeChunk(sourceId, 0, axisVector(0))
    const chunkLow = makeChunk(sourceId, 1, axisVector(1))
    await vectorStore.upsertChunks([chunkHigh, chunkLow])

    // High minScore should filter out the low-similarity chunk
    const result = await vectorStore.search(axisVector(0), { topK: 10, minScore: 0.5 })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const texts = result.value.map((h) => h.text)
    expect(texts).toContain(chunkHigh.text)
    expect(texts).not.toContain(chunkLow.text)
  })

  it('activeSourceIds filter restricts results to specified sources', async () => {
    const knowledgeStore = new PgKnowledgeStore(pg.pool)
    const vectorStore = new PgvectorStore(pg.pool)

    const sourceA = await createReadySource(knowledgeStore, 'Source A')
    const sourceB = await createReadySource(knowledgeStore, 'Source B')

    const chunkA = makeChunk(sourceA, 0, axisVector(0))
    const chunkB = makeChunk(sourceB, 0, axisVector(0))
    await vectorStore.upsertChunks([chunkA, chunkB])

    // Only query sourceA
    const result = await vectorStore.search(axisVector(0), {
      topK: 10,
      minScore: 0,
      activeSourceIds: [SourceId(sourceA)],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toHaveLength(1)
    const hit = result.value[0]
    expect(hit).toBeDefined()
    if (!hit) return
    expect(hit.sourceId).toBe(sourceA)
    expect(hit.sourceName).toBe('Source A')
  })

  it('previewBySource returns chunks ordered by chunkIndex', async () => {
    const knowledgeStore = new PgKnowledgeStore(pg.pool)
    const vectorStore = new PgvectorStore(pg.pool)

    const sourceId = await createReadySource(knowledgeStore, 'Preview Source', 1)
    const chunk0 = makeChunk(sourceId, 0, axisVector(0))
    const chunk1 = makeChunk(sourceId, 1, axisVector(1))
    const chunk2 = makeChunk(sourceId, 2, axisVector(2))
    // Insert out-of-order to verify ordering is by chunk_index, not insert order
    await vectorStore.upsertChunks([chunk2, chunk0, chunk1])

    const result = await vectorStore.previewBySource(SourceId(sourceId), 10)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toHaveLength(3)
    expect(result.value[0]?.text).toBe(chunk0.text)
    expect(result.value[1]?.text).toBe(chunk1.text)
    expect(result.value[2]?.text).toBe(chunk2.text)
  })

  it('previewBySource respects limit', async () => {
    const knowledgeStore = new PgKnowledgeStore(pg.pool)
    const vectorStore = new PgvectorStore(pg.pool)

    const sourceId = await createReadySource(knowledgeStore, 'Limit Source', 1)
    await vectorStore.upsertChunks([
      makeChunk(sourceId, 0, axisVector(0)),
      makeChunk(sourceId, 1, axisVector(1)),
      makeChunk(sourceId, 2, axisVector(2)),
    ])

    const result = await vectorStore.previewBySource(SourceId(sourceId), 2)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toHaveLength(2)
  })

  it('previewBySource only returns chunks at currentGeneration', async () => {
    const knowledgeStore = new PgKnowledgeStore(pg.pool)
    const vectorStore = new PgvectorStore(pg.pool)

    // Source is at generation 2
    const sourceId = await createReadySource(knowledgeStore, 'GenFilter Source', 2)

    // Insert stale gen-1 chunk and current gen-2 chunk
    const staleChunk = makeChunk(sourceId, 0, axisVector(0), 1)
    const currentChunk = makeChunk(sourceId, 1, axisVector(1), 2)
    await vectorStore.upsertChunks([staleChunk, currentChunk])

    const result = await vectorStore.previewBySource(SourceId(sourceId), 10)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toHaveLength(1)
    expect(result.value[0]?.text).toBe(currentChunk.text)
  })

  it('previewBySource returns score=1.0', async () => {
    const knowledgeStore = new PgKnowledgeStore(pg.pool)
    const vectorStore = new PgvectorStore(pg.pool)

    const sourceId = await createReadySource(knowledgeStore, 'Score Source', 1)
    await vectorStore.upsertChunks([makeChunk(sourceId, 0, axisVector(0))])

    const result = await vectorStore.previewBySource(SourceId(sourceId), 5)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value[0]?.score).toBe(1.0)
  })

  it('upsertChunks stores and retrieves metadata', async () => {
    const knowledgeStore = new PgKnowledgeStore(pg.pool)
    const vectorStore = new PgvectorStore(pg.pool)

    const sourceId = await createReadySource(knowledgeStore, 'Meta Source')
    const meta = { page: 3, section: 'intro' }
    const chunk = makeChunk(sourceId, 0, axisVector(0), 1, meta)
    await vectorStore.upsertChunks([chunk])

    const result = await vectorStore.search(axisVector(0), { topK: 1, minScore: 0 })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const hit = result.value[0]
    expect(hit).toBeDefined()
    if (!hit) return
    expect(hit.metadata).toEqual(meta)
  })
})
