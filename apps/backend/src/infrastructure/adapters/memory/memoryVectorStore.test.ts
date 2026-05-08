import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { ChunkId } from '@support/shared'
import type { SourceId } from '@support/shared'
import { MemoryKnowledgeStore } from './memoryKnowledgeStore'
import { MemoryVectorStore } from './memoryVectorStore'
import type { ChunkInsert } from '../../../domain/source'

function unitVec(...components: number[]): readonly number[] {
  const mag = Math.sqrt(components.reduce((s, c) => s + c * c, 0))
  return components.map((c) => c / mag)
}

// Three orthogonal-ish vectors for deterministic cosine results
const V_A = unitVec(1, 0, 0, 0)   // points along axis 0
const V_B = unitVec(0, 1, 0, 0)   // points along axis 1
const V_C = unitVec(1, 1, 0, 0)   // 45° between A and B → cosine(V_A,V_C)=~0.707

function makeChunk(sourceId: SourceId, index: number, embedding: readonly number[], generation = 1): ChunkInsert {
  return {
    id: ChunkId(randomUUID()),
    sourceId,
    chunkIndex: index,
    text: `chunk text ${index}`,
    tokenCount: 10,
    embedding,
    ingestGeneration: generation,
    metadata: {},
  }
}

async function makeSource(store: MemoryKnowledgeStore, name: string) {
  const r = await store.createSource({ name, sourceType: 'txt', config: { sourceType: 'txt', fileRef: 'r' } })
  if (!r.ok) throw new Error('createSource failed')
  return r.value
}

describe('MemoryVectorStore', () => {
  it('upsertChunks and search returns top-K sorted by cosine score', async () => {
    const ks = new MemoryKnowledgeStore()
    const vs = new MemoryVectorStore(ks)

    const src = await makeSource(ks, 'Source1')
    const chunks: ChunkInsert[] = [
      makeChunk(src.id, 0, V_A),
      makeChunk(src.id, 1, V_B),
      makeChunk(src.id, 2, V_C),
    ]
    await vs.upsertChunks(chunks)

    // Query close to V_A → score order: A (1.0) > C (~0.707) > B (0.0)
    const r = await vs.search(V_A, { topK: 3, minScore: 0 })
    expect(r.ok).toBe(true)
    if (!r.ok) return

    expect(r.value).toHaveLength(3)
    // First hit should be V_A (score ~1.0)
    expect(r.value[0]?.text).toBe('chunk text 0')
    // Scores should be descending
    const [s0, s1, s2] = r.value.map((h) => h.score)
    expect(s0).toBeGreaterThan(s1 ?? -Infinity)
    expect(s1).toBeGreaterThan(s2 ?? -Infinity)
  })

  it('topK limits results', async () => {
    const ks = new MemoryKnowledgeStore()
    const vs = new MemoryVectorStore(ks)
    const src = await makeSource(ks, 'Src')
    await vs.upsertChunks([
      makeChunk(src.id, 0, V_A),
      makeChunk(src.id, 1, V_B),
      makeChunk(src.id, 2, V_C),
    ])
    const r = await vs.search(V_A, { topK: 2, minScore: 0 })
    expect(r.ok && r.value.length === 2).toBe(true)
  })

  it('minScore filters out low-scoring chunks', async () => {
    const ks = new MemoryKnowledgeStore()
    const vs = new MemoryVectorStore(ks)
    const src = await makeSource(ks, 'Src')
    await vs.upsertChunks([
      makeChunk(src.id, 0, V_A),
      makeChunk(src.id, 1, V_B), // cosine with V_A = 0
    ])
    // Only V_A should pass a minScore of 0.5 when querying along V_A
    const r = await vs.search(V_A, { topK: 10, minScore: 0.5 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toHaveLength(1)
    expect(r.value[0]?.text).toBe('chunk text 0')
  })

  it('deleteBySourceBelowGeneration removes only stale chunks', async () => {
    const ks = new MemoryKnowledgeStore()
    const vs = new MemoryVectorStore(ks)
    const src = await makeSource(ks, 'Src')

    // generation 1 = old, generation 2 = new
    const oldChunk = makeChunk(src.id, 0, V_A, 1)
    const newChunk = makeChunk(src.id, 1, V_B, 2)
    await vs.upsertChunks([oldChunk, newChunk])

    // Delete chunks for src.id below generation 2 → removes generation 1 chunk
    const del = await vs.deleteBySourceBelowGeneration(src.id, 2)
    expect(del.ok).toBe(true)

    const r = await vs.search(V_A, { topK: 10, minScore: -1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // Only newChunk remains
    expect(r.value).toHaveLength(1)
    expect(r.value[0]?.text).toBe('chunk text 1')
  })

  it('deleteBySourceBelowGeneration only affects the specified sourceId', async () => {
    const ks = new MemoryKnowledgeStore()
    const vs = new MemoryVectorStore(ks)
    const src1 = await makeSource(ks, 'Src1')
    const src2 = await makeSource(ks, 'Src2')

    await vs.upsertChunks([
      makeChunk(src1.id, 0, V_A, 1),
      makeChunk(src2.id, 0, V_B, 1),
    ])

    // Delete only src1's generation < 2
    await vs.deleteBySourceBelowGeneration(src1.id, 2)

    const r = await vs.search(V_B, { topK: 10, minScore: -1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // src2's chunk still present
    expect(r.value).toHaveLength(1)
    expect(r.value[0]?.sourceId).toBe(src2.id)
  })

  it('activeSourceIds filter restricts search to specified sources', async () => {
    const ks = new MemoryKnowledgeStore()
    const vs = new MemoryVectorStore(ks)
    const src1 = await makeSource(ks, 'Src1')
    const src2 = await makeSource(ks, 'Src2')

    await vs.upsertChunks([
      makeChunk(src1.id, 0, V_A, 1),
      makeChunk(src2.id, 0, V_A, 1),
    ])

    const r = await vs.search(V_A, { topK: 10, minScore: -1, activeSourceIds: [src1.id] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toHaveLength(1)
    expect(r.value[0]?.sourceId).toBe(src1.id)
  })

  it('inactive sources are excluded from search', async () => {
    const ks = new MemoryKnowledgeStore()
    const vs = new MemoryVectorStore(ks)
    const src1 = await makeSource(ks, 'Active')
    const src2 = await makeSource(ks, 'Inactive')

    await vs.upsertChunks([
      makeChunk(src1.id, 0, V_A, 1),
      makeChunk(src2.id, 0, V_A, 1),
    ])

    // Mark src2 as inactive
    await ks.setActive(src2.id, false)

    const r = await vs.search(V_A, { topK: 10, minScore: -1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toHaveLength(1)
    expect(r.value[0]?.sourceId).toBe(src1.id)
  })

  it('upsertChunks overwrites existing chunk on same id', async () => {
    const ks = new MemoryKnowledgeStore()
    const vs = new MemoryVectorStore(ks)
    const src = await makeSource(ks, 'Src')
    const chunkId = ChunkId(randomUUID())

    const chunk1: ChunkInsert = {
      id: chunkId, sourceId: src.id, chunkIndex: 0,
      text: 'original', tokenCount: 5, embedding: V_A, ingestGeneration: 1, metadata: {},
    }
    await vs.upsertChunks([chunk1])

    const chunk2: ChunkInsert = {
      id: chunkId, sourceId: src.id, chunkIndex: 0,
      text: 'updated', tokenCount: 5, embedding: V_A, ingestGeneration: 2, metadata: {},
    }
    await vs.upsertChunks([chunk2])

    const r = await vs.search(V_A, { topK: 10, minScore: -1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toHaveLength(1)
    expect(r.value[0]?.text).toBe('updated')
  })

  it('search returns sourceName from knowledgeStore', async () => {
    const ks = new MemoryKnowledgeStore()
    const vs = new MemoryVectorStore(ks)
    const src = await makeSource(ks, 'My Knowledge Base')
    await vs.upsertChunks([makeChunk(src.id, 0, V_A, 1)])

    const r = await vs.search(V_A, { topK: 1, minScore: -1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value[0]?.sourceName).toBe('My Knowledge Base')
  })

  it('previewBySource returns chunks ordered by chunkIndex', async () => {
    const ks = new MemoryKnowledgeStore()
    const vs = new MemoryVectorStore(ks)
    const src = await makeSource(ks, 'Preview')
    // Set source to ready at generation 1
    await ks.updateSourceState(src.id, { status: 'ready', currentGeneration: 1, ingestedAt: new Date(), chunkCount: 3 })
    await vs.upsertChunks([
      makeChunk(src.id, 2, V_C, 1),
      makeChunk(src.id, 0, V_A, 1),
      makeChunk(src.id, 1, V_B, 1),
    ])
    const r = await vs.previewBySource(src.id, 10)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toHaveLength(3)
    expect(r.value[0]?.text).toBe('chunk text 0')
    expect(r.value[1]?.text).toBe('chunk text 1')
    expect(r.value[2]?.text).toBe('chunk text 2')
  })

  it('previewBySource respects limit', async () => {
    const ks = new MemoryKnowledgeStore()
    const vs = new MemoryVectorStore(ks)
    const src = await makeSource(ks, 'Limit')
    await ks.updateSourceState(src.id, { status: 'ready', currentGeneration: 1, ingestedAt: new Date(), chunkCount: 3 })
    await vs.upsertChunks([
      makeChunk(src.id, 0, V_A, 1),
      makeChunk(src.id, 1, V_B, 1),
      makeChunk(src.id, 2, V_C, 1),
    ])
    const r = await vs.previewBySource(src.id, 2)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toHaveLength(2)
  })

  it('previewBySource only returns chunks at currentGeneration', async () => {
    const ks = new MemoryKnowledgeStore()
    const vs = new MemoryVectorStore(ks)
    const src = await makeSource(ks, 'GenFilter')
    // Source is at generation 2; old gen-1 chunks should be excluded
    await ks.updateSourceState(src.id, { status: 'ready', currentGeneration: 2, ingestedAt: new Date(), chunkCount: 1 })
    await vs.upsertChunks([
      makeChunk(src.id, 0, V_A, 1), // stale
      makeChunk(src.id, 1, V_B, 2), // current
    ])
    const r = await vs.previewBySource(src.id, 10)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toHaveLength(1)
    expect(r.value[0]?.text).toBe('chunk text 1')
  })

  it('previewBySource returns score=1.0 for all hits', async () => {
    const ks = new MemoryKnowledgeStore()
    const vs = new MemoryVectorStore(ks)
    const src = await makeSource(ks, 'Score1')
    await ks.updateSourceState(src.id, { status: 'ready', currentGeneration: 1, ingestedAt: new Date(), chunkCount: 2 })
    await vs.upsertChunks([
      makeChunk(src.id, 0, V_A, 1),
      makeChunk(src.id, 1, V_B, 1),
    ])
    const r = await vs.previewBySource(src.id, 10)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    for (const hit of r.value) {
      expect(hit.score).toBe(1.0)
    }
  })

  it('search across 2 sources with 5 chunks respects topK', async () => {
    const ks = new MemoryKnowledgeStore()
    const vs = new MemoryVectorStore(ks)
    const src1 = await makeSource(ks, 'S1')
    const src2 = await makeSource(ks, 'S2')

    // 3 from src1, 2 from src2
    await vs.upsertChunks([
      makeChunk(src1.id, 0, V_A, 1),
      makeChunk(src1.id, 1, V_C, 1),
      makeChunk(src1.id, 2, V_B, 1),
      makeChunk(src2.id, 0, V_A, 1),
      makeChunk(src2.id, 1, V_B, 1),
    ])

    const r = await vs.search(V_A, { topK: 3, minScore: -1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toHaveLength(3)
    // Top hits should be the ones with V_A embedding (score 1.0)
    const topTwo = r.value.slice(0, 2)
    for (const h of topTwo) {
      expect(h.score).toBeCloseTo(1.0, 5)
    }
  })
})
