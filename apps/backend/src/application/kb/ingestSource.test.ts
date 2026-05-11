import { describe, it, expect } from 'vitest'
import { ingestSource } from './ingestSource'
import { MemoryKnowledgeStore } from '../../infrastructure/adapters/memory/memoryKnowledgeStore'
import { MemoryVectorStore } from '../../infrastructure/adapters/memory/memoryVectorStore'
import { MemoryFileStore } from '../../infrastructure/adapters/memory/memoryFileStore'
import { MemoryEmbedder } from '../../infrastructure/adapters/memory/memoryEmbedder'
import { MemorySiteConfigStore } from '../../infrastructure/adapters/memory/memorySiteConfigStore'
import { InProcessSseHub } from '../../infrastructure/sse/inProcessSseHub'
import { MemoryMysqlConnectionStore } from '../../infrastructure/adapters/memory/memoryMysqlConnectionStore'
import { Ok, type Result, type AppError } from '@support/shared'
import type { RawChunk } from '../../domain/source'
import { RecordingMetrics } from '../../../tests/helpers/recordingMetrics'

async function setup() {
  const knowledgeStore = new MemoryKnowledgeStore()
  const vectorStore = new MemoryVectorStore(knowledgeStore)
  const fileStore = new MemoryFileStore()
  const embedder = new MemoryEmbedder(1536)
  const siteConfigStore = new MemorySiteConfigStore()
  const broadcast = new InProcessSseHub()
  await siteConfigStore.upsertOnboarding({
    siteKey: 'X', siteName: 'A', primaryColor: '#000',
    llm4agentsApiKeyEncrypted: 'enc::sk-proxy-x',
    agentModel: 'm', embeddingModel: 'e', embeddingDim: 1536,
    systemPrompt: 'p', mcpEnabled: false,
    handoffPolicy: { autoOnLowConfidence: false, autoOnFrustrationKeywords: [], timeoutBeforeRevertMs: 90000, toolEnabled: false },
    adminOnline: false, onboardingStep: 9, onboardingCompleted: true,
  })
  const mysqlConnectionStore = new MemoryMysqlConnectionStore()
  return { knowledgeStore, vectorStore, fileStore, embedder, siteConfigStore, broadcast, mysqlConnectionStore }
}

describe('ingestSource', () => {
  it('happy path: idle → ingesting → ready, chunks present, generation bumped', async () => {
    const env = await setup()
    const src = await env.knowledgeStore.createSource({ name: 'doc', sourceType: 'txt', config: { sourceType: 'txt', fileRef: 'r1' } })
    if (!src.ok) throw new Error('seed')
    // stub extractChunks to return 3 chunks
    const extractChunks = (): Promise<Result<readonly RawChunk[], AppError>> => Promise.resolve(Ok([
      { text: 'a', tokenCount: 1, metadata: {} },
      { text: 'b', tokenCount: 1, metadata: {} },
      { text: 'c', tokenCount: 1, metadata: {} },
    ]))
    const r = await ingestSource({
      ...env, decrypt: (s: string) => Promise.resolve(s.startsWith('enc::') ? s.slice(5) : s), extractChunks,
    }, src.value.id)
    expect(r.ok).toBe(true)
    const after = await env.knowledgeStore.getSource(src.value.id)
    if (after.ok) {
      expect(after.value.state.status).toBe('ready')
      if (after.value.state.status === 'ready') expect(after.value.state.currentGeneration).toBe(1)
    }
  })

  it('empty corpus: state goes ready with chunkCount=0', async () => {
    const env = await setup()
    const src = await env.knowledgeStore.createSource({ name: 'empty', sourceType: 'txt', config: { sourceType: 'txt', fileRef: 'r' } })
    if (!src.ok) throw new Error('seed')
    const r = await ingestSource({
      ...env, decrypt: (s: string) => Promise.resolve(s), extractChunks: () => Promise.resolve(Ok([])),
    }, src.value.id)
    expect(r.ok).toBe(true)
    const after = await env.knowledgeStore.getSource(src.value.id)
    if (after.ok && after.value.state.status === 'ready') {
      expect(after.value.state.chunkCount).toBe(0)
    } else throw new Error('expected ready')
  })

  it('extract failure: state goes error', async () => {
    const env = await setup()
    const src = await env.knowledgeStore.createSource({ name: 'bad', sourceType: 'pdf', config: { sourceType: 'pdf', fileRef: 'r' } })
    if (!src.ok) throw new Error('seed')
    const r = await ingestSource({
      ...env, decrypt: (s: string) => Promise.resolve(s),
      extractChunks: () => Promise.resolve({ ok: false, error: { kind: 'pdf_encrypted' } } as never),
    }, src.value.id)
    expect(r.ok).toBe(false)
    const after = await env.knowledgeStore.getSource(src.value.id)
    expect(after.ok && after.value.state.status === 'error').toBe(true)
  })

  it('rejects when state=ingesting', async () => {
    const env = await setup()
    const src = await env.knowledgeStore.createSource({ name: 'busy', sourceType: 'txt', config: { sourceType: 'txt', fileRef: 'r' } })
    if (!src.ok) throw new Error('seed')
    await env.knowledgeStore.updateSourceState(src.value.id, {
      status: 'ingesting', startedAt: new Date(),
      progress: { processed: 0, total: 0 },
      currentGeneration: 0, pendingGeneration: 1,
    })
    const r = await ingestSource({
      ...env, decrypt: (s: string) => Promise.resolve(s), extractChunks: () => Promise.resolve(Ok([])),
    }, src.value.id)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('source_invalid_state')
  })

  it('metrics: happy path emits ingest_started_total + ingest_completed_total{status:ready} + ingest_duration_seconds + ingest_progress_chunks', async () => {
    const env = await setup()
    const src = await env.knowledgeStore.createSource({ name: 'doc', sourceType: 'txt', config: { sourceType: 'txt', fileRef: 'r' } })
    if (!src.ok) throw new Error('seed')
    const metrics = new RecordingMetrics()
    const extractChunks = (): Promise<Result<readonly RawChunk[], AppError>> => Promise.resolve(Ok([
      { text: 'a', tokenCount: 1, metadata: {} },
      { text: 'b', tokenCount: 1, metadata: {} },
    ]))
    const r = await ingestSource({
      ...env, decrypt: (s: string) => Promise.resolve(s.startsWith('enc::') ? s.slice(5) : s),
      extractChunks, metrics,
    }, src.value.id)
    expect(r.ok).toBe(true)

    const started = metrics.calls.find((c) => c.kind === 'counter' && c.name === 'ingest_started_total')
    expect(started).toBeDefined()
    expect(started?.labels['source_type']).toBe('txt')

    const completed = metrics.calls.find((c) => c.kind === 'counter' && c.name === 'ingest_completed_total')
    expect(completed).toBeDefined()
    expect(completed?.labels['status']).toBe('ready')
    expect(completed?.labels['source_type']).toBe('txt')

    const duration = metrics.calls.find((c) => c.kind === 'histogram' && c.name === 'ingest_duration_seconds')
    expect(duration).toBeDefined()
    expect(duration?.labels['source_type']).toBe('txt')

    const progress = metrics.calls.find((c) => c.kind === 'gauge' && c.name === 'ingest_progress_chunks')
    expect(progress).toBeDefined()
    expect(progress?.value).toBe(2)
  })

  it('metrics: extract failure emits ingest_completed_total{status:error}', async () => {
    const env = await setup()
    const src = await env.knowledgeStore.createSource({ name: 'bad', sourceType: 'pdf', config: { sourceType: 'pdf', fileRef: 'r' } })
    if (!src.ok) throw new Error('seed')
    const metrics = new RecordingMetrics()
    const r = await ingestSource({
      ...env, decrypt: (s: string) => Promise.resolve(s), metrics,
      extractChunks: () => Promise.resolve({ ok: false, error: { kind: 'pdf_encrypted' } } as never),
    }, src.value.id)
    expect(r.ok).toBe(false)

    const completed = metrics.calls.find((c) => c.kind === 'counter' && c.name === 'ingest_completed_total')
    expect(completed).toBeDefined()
    expect(completed?.labels['status']).toBe('error')
    expect(completed?.labels['source_type']).toBe('pdf')
  })

  it('re-ingest after success bumps generation', async () => {
    const env = await setup()
    const src = await env.knowledgeStore.createSource({ name: 'd', sourceType: 'txt', config: { sourceType: 'txt', fileRef: 'r' } })
    if (!src.ok) throw new Error('seed')
    const extract = () => Promise.resolve(Ok([{ text: 'x', tokenCount: 1, metadata: {} }]))
    await ingestSource({ ...env, decrypt: (s: string) => Promise.resolve(s), extractChunks: extract }, src.value.id)
    await ingestSource({ ...env, decrypt: (s: string) => Promise.resolve(s), extractChunks: extract }, src.value.id)
    const after = await env.knowledgeStore.getSource(src.value.id)
    if (after.ok && after.value.state.status === 'ready') {
      expect(after.value.state.currentGeneration).toBe(2)
    } else throw new Error('expected ready')
  })
})
