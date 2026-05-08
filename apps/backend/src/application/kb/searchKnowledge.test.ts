import { describe, it, expect, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { searchKnowledge } from './searchKnowledge'
import { MemoryKnowledgeStore } from '../../infrastructure/adapters/memory/memoryKnowledgeStore'
import { MemoryVectorStore } from '../../infrastructure/adapters/memory/memoryVectorStore'
import { MemorySiteConfigStore } from '../../infrastructure/adapters/memory/memorySiteConfigStore'
import { MemoryEmbedder } from '../../infrastructure/adapters/memory/memoryEmbedder'
import { ChunkId, Ok, Err } from '@support/shared'
import type { EmbedderPort } from '../ports'

const DIM = 8

async function setup() {
  const knowledgeStore = new MemoryKnowledgeStore()
  const vectorStore = new MemoryVectorStore(knowledgeStore)
  const siteConfigStore = new MemorySiteConfigStore()
  const embedder = new MemoryEmbedder(DIM)
  await siteConfigStore.upsertOnboarding({
    siteKey: 'X', siteName: 'A', primaryColor: '#000',
    llm4agentsApiKeyEncrypted: 'enc::sk-proxy-x',
    agentModel: 'm', embeddingModel: 'e', embeddingDim: DIM,
    systemPrompt: 'p', mcpEnabled: false,
    handoffPolicy: { autoOnLowConfidence: false, autoOnFrustrationKeywords: [], timeoutBeforeRevertMs: 90000, toolEnabled: false },
    adminOnline: false, onboardingStep: 9, onboardingCompleted: true,
  })
  const decrypt = (s: string) => s.startsWith('enc::') ? s.slice(5) : s
  return { knowledgeStore, vectorStore, siteConfigStore, embedder, decrypt }
}

// Helper: normalizes a vector for unit-norm cosine tests
function norm(v: readonly number[]): readonly number[] {
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  return v.map((x) => x / mag)
}

describe('searchKnowledge', () => {
  it('empty corpus returns Ok([])', async () => {
    const env = await setup()
    const r = await searchKnowledge(env, 'query', { topK: 5, minScore: 0.5 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toHaveLength(0)
  })

  it('single chunk in corpus returns it when score >= minScore', async () => {
    const env = await setup()
    const srcRes = await env.knowledgeStore.createSource({ name: 'doc1', sourceType: 'txt', config: { sourceType: 'txt', fileRef: 'r1' } })
    if (!srcRes.ok) throw new Error('seed source')
    await env.knowledgeStore.updateSourceState(srcRes.value.id, { status: 'ready', currentGeneration: 1, ingestedAt: new Date(), chunkCount: 1 })

    // e1 = [1,0,0,...], query will have cosine=1 with this vector
    const e1 = norm([1, 0, 0, 0, 0, 0, 0, 0])
    await env.vectorStore.upsertChunks([{
      id: ChunkId(randomUUID()), sourceId: srcRes.value.id, chunkIndex: 0,
      text: 'chunk A', tokenCount: 2, metadata: {}, embedding: e1, ingestGeneration: 1,
    }])

    // embedder replaced by stub: always returns e1
    const stubEmbedder: EmbedderPort = {
      dimension: DIM,
      embed: (_texts, _key) => Promise.resolve(Ok([e1])),
    }

    const r = await searchKnowledge({ ...env, embedder: stubEmbedder }, 'query', { topK: 5, minScore: 0.5 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.length).toBe(1)
      expect(r.value[0]?.text).toBe('chunk A')
      expect(r.value[0]?.score).toBeCloseTo(1, 5)
    }
  })

  it('multiple chunks across 2 sources: top-K returned, dedup keeps max 2 per source, sorted by score', async () => {
    const env = await setup()

    // Source A — 3 chunks
    const srcA = await env.knowledgeStore.createSource({ name: 'srcA', sourceType: 'txt', config: { sourceType: 'txt', fileRef: 'rA' } })
    if (!srcA.ok) throw new Error('seed A')
    await env.knowledgeStore.updateSourceState(srcA.value.id, { status: 'ready', currentGeneration: 1, ingestedAt: new Date(), chunkCount: 3 })

    // Source B — 2 chunks
    const srcB = await env.knowledgeStore.createSource({ name: 'srcB', sourceType: 'txt', config: { sourceType: 'txt', fileRef: 'rB' } })
    if (!srcB.ok) throw new Error('seed B')
    await env.knowledgeStore.updateSourceState(srcB.value.id, { status: 'ready', currentGeneration: 1, ingestedAt: new Date(), chunkCount: 2 })

    // Embeddings: e1=[1,0,...], e2=[0,1,...], e3=[0.7,0.7,...] (normalised)
    const e1 = norm([1, 0, 0, 0, 0, 0, 0, 0])   // high similarity with query [0.9,0.1,...]
    const e2 = norm([0, 1, 0, 0, 0, 0, 0, 0])   // low similarity with query
    const e3 = norm([0.7, 0.7, 0, 0, 0, 0, 0, 0]) // mid similarity
    const e4 = norm([0.8, 0.2, 0, 0, 0, 0, 0, 0]) // second-highest for srcA

    // Source A: chunks with e1 (high), e4 (mid-high), e2 (low)
    await env.vectorStore.upsertChunks([
      { id: ChunkId(randomUUID()), sourceId: srcA.value.id, chunkIndex: 0, text: 'A-high', tokenCount: 1, metadata: {}, embedding: e1, ingestGeneration: 1 },
      { id: ChunkId(randomUUID()), sourceId: srcA.value.id, chunkIndex: 1, text: 'A-midhigh', tokenCount: 1, metadata: {}, embedding: e4, ingestGeneration: 1 },
      { id: ChunkId(randomUUID()), sourceId: srcA.value.id, chunkIndex: 2, text: 'A-low', tokenCount: 1, metadata: {}, embedding: e2, ingestGeneration: 1 },
    ])
    // Source B: chunks with e3, e2
    await env.vectorStore.upsertChunks([
      { id: ChunkId(randomUUID()), sourceId: srcB.value.id, chunkIndex: 0, text: 'B-mid', tokenCount: 1, metadata: {}, embedding: e3, ingestGeneration: 1 },
      { id: ChunkId(randomUUID()), sourceId: srcB.value.id, chunkIndex: 1, text: 'B-low', tokenCount: 1, metadata: {}, embedding: e2, ingestGeneration: 1 },
    ])

    // Query vector similar to e1: [0.9,0.1,0,...] (normalised)
    const qvec = norm([0.9, 0.1, 0, 0, 0, 0, 0, 0])
    const stubEmbedder: EmbedderPort = {
      dimension: DIM,
      embed: (_texts, _key) => Promise.resolve(Ok([qvec])),
    }

    const r = await searchKnowledge({ ...env, embedder: stubEmbedder }, 'query', { topK: 10, minScore: 0.1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const texts = r.value.map((h) => h.text)
    // dedup: max 2 per source
    const fromA = r.value.filter((h) => h.sourceId === srcA.value.id)
    const fromB = r.value.filter((h) => h.sourceId === srcB.value.id)
    expect(fromA.length).toBeLessThanOrEqual(2)
    expect(fromB.length).toBeLessThanOrEqual(2)

    // 'A-low' (e2) should be excluded from A because only top-2 per source are kept
    expect(texts).not.toContain('A-low')

    // Result is sorted by score descending
    for (let i = 0; i < r.value.length - 1; i++) {
      const curr = r.value[i]
      const next = r.value[i + 1]
      if (curr && next) {
        expect(curr.score).toBeGreaterThanOrEqual(next.score)
      }
    }

    // First result should be 'A-high' (closest to query)
    expect(r.value[0]?.text).toBe('A-high')
  })

  it('onboarding incomplete → returns Ok([]) without calling embedder', async () => {
    const env = await setup()
    await env.siteConfigStore.setOnboardingStep(1, false)
    // Patch onboardingCompleted by upsert
    await env.siteConfigStore.upsertOnboarding({
      siteKey: 'X', siteName: 'A', primaryColor: '#000',
      llm4agentsApiKeyEncrypted: 'enc::sk-proxy-x',
      agentModel: 'm', embeddingModel: 'e', embeddingDim: DIM,
      systemPrompt: 'p', mcpEnabled: false,
      handoffPolicy: { autoOnLowConfidence: false, autoOnFrustrationKeywords: [], timeoutBeforeRevertMs: 90000, toolEnabled: false },
      adminOnline: false, onboardingStep: 1, onboardingCompleted: false,
    })

    const embedSpy = vi.fn().mockResolvedValue(Ok([[1, 0, 0, 0, 0, 0, 0, 0]]))
    const stubEmbedder: EmbedderPort = { dimension: DIM, embed: embedSpy }

    const r = await searchKnowledge({ ...env, embedder: stubEmbedder }, 'query', { topK: 5, minScore: 0.5 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toHaveLength(0)
    expect(embedSpy).not.toHaveBeenCalled()
  })

  it('embedder failure → returns Err', async () => {
    const env = await setup()
    const stubEmbedder: EmbedderPort = {
      dimension: DIM,
      embed: () => Promise.resolve(Err({ kind: 'infra_unexpected', cause: 'embedder down' })),
    }
    const r = await searchKnowledge({ ...env, embedder: stubEmbedder }, 'query', { topK: 5, minScore: 0.5 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('infra_unexpected')
  })
})
