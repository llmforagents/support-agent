import { randomUUID } from 'node:crypto'
import { Ok, Err, type Result, type AppError, ChunkId, type SourceId } from '@support/shared'
import type { ChunkInsert, RawChunk, SourceConfig } from '../../domain/source'
import type {
  KnowledgeStorePort, VectorStorePort, FileStorePort, EmbedderPort, BroadcastPort, SiteConfigStorePort,
} from '../ports'

export type ExtractFn = (cfg: SourceConfig, fs: FileStorePort) => Promise<Result<readonly RawChunk[], AppError>>

export type IngestDeps = Readonly<{
  knowledgeStore: KnowledgeStorePort
  vectorStore: VectorStorePort
  fileStore: FileStorePort
  embedder: EmbedderPort
  broadcast: BroadcastPort
  siteConfigStore: SiteConfigStorePort
  decrypt: (envelope: string) => string
  extractChunks: ExtractFn
}>

const BATCH_SIZE = 50

export async function ingestSource(deps: IngestDeps, sourceId: SourceId): Promise<Result<void, AppError>> {
  const sourceRes = await deps.knowledgeStore.getSource(sourceId)
  if (!sourceRes.ok) return sourceRes
  const src = sourceRes.value

  const allowed = ['idle', 'ready', 'error', 'paused']
  if (!allowed.includes(src.state.status)) {
    return Err({ kind: 'source_invalid_state', current: src.state.status, required: allowed as readonly string[] })
  }

  const cfg = await deps.siteConfigStore.get()
  if (!cfg.ok || !cfg.value) {
    return Err({ kind: 'infra_unexpected', cause: 'site_config missing' })
  }
  const apiKey = deps.decrypt(cfg.value.llm4agentsApiKeyEncrypted)

  const currentGeneration = src.state.currentGeneration
  const nextGen = currentGeneration + 1
  const startedAt = new Date()

  // Transition to ingesting (progress=0/0 because total is unknown until extract finishes)
  await deps.knowledgeStore.updateSourceState(sourceId, {
    status: 'ingesting',
    startedAt,
    progress: { processed: 0, total: 0 },
    currentGeneration,
    pendingGeneration: nextGen,
  })
  // T87 will add source_state / source_progress to BroadcastEvent — cast until then
  deps.broadcast.publish('admin_inbox', { type: 'source_state', sourceId, status: 'ingesting' } as never)

  const extractRes = await deps.extractChunks(src.config, deps.fileStore)
  if (!extractRes.ok) {
    await deps.knowledgeStore.updateSourceState(sourceId, {
      status: 'error',
      error: extractRes.error as never,  // AppError narrowed to IngestError-shaped at runtime
      failedAt: new Date(),
      currentGeneration,
    })
    deps.broadcast.publish('admin_inbox', { type: 'source_state', sourceId, status: 'error' } as never)
    return extractRes
  }

  const total = extractRes.value.length

  // Update with known total
  await deps.knowledgeStore.updateSourceState(sourceId, {
    status: 'ingesting',
    startedAt,
    progress: { processed: 0, total },
    currentGeneration,
    pendingGeneration: nextGen,
  })

  let processed = 0
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = extractRes.value.slice(i, i + BATCH_SIZE)
    const embedRes = await deps.embedder.embed(batch.map((c) => c.text), apiKey)
    if (!embedRes.ok) {
      const cause = JSON.stringify(embedRes.error)
      await deps.knowledgeStore.updateSourceState(sourceId, {
        status: 'error',
        error: { kind: 'embedding_provider_failed', cause } as never,
        failedAt: new Date(),
        currentGeneration,
      })
      deps.broadcast.publish('admin_inbox', { type: 'source_state', sourceId, status: 'error' } as never)
      return Err({ kind: 'embedding_provider_failed', cause })
    }
    const inserts: ChunkInsert[] = batch.map((c, j) => {
      const embedding = embedRes.value[j]
      if (!embedding) {
        // Should never happen — embedder returns one vector per input text
        throw new Error(`embedder returned no vector for batch index ${j}`)
      }
      return {
        ...c,
        id: ChunkId(randomUUID()),
        sourceId,
        chunkIndex: i + j,
        embedding,
        ingestGeneration: nextGen,
      }
    })
    const upsertRes = await deps.vectorStore.upsertChunks(inserts)
    if (!upsertRes.ok) {
      await deps.knowledgeStore.updateSourceState(sourceId, {
        status: 'error',
        error: { kind: 'embedding_provider_failed', cause: `vector store: ${JSON.stringify(upsertRes.error)}` } as never,
        failedAt: new Date(),
        currentGeneration,
      })
      return upsertRes
    }
    processed += batch.length
    await deps.knowledgeStore.updateSourceState(sourceId, {
      status: 'ingesting',
      startedAt,
      progress: { processed, total },
      currentGeneration,
      pendingGeneration: nextGen,
    })
    deps.broadcast.publish('admin_inbox', { type: 'source_progress', sourceId, processed, total } as never)
  }

  await deps.knowledgeStore.updateSourceState(sourceId, {
    status: 'ready',
    ingestedAt: new Date(),
    chunkCount: total,
    currentGeneration: nextGen,
  })
  deps.broadcast.publish('admin_inbox', { type: 'source_state', sourceId, status: 'ready' } as never)

  // Cleanup stale chunks from previous generations (fire-and-forget)
  void deps.vectorStore.deleteBySourceBelowGeneration(sourceId, nextGen)
  return Ok(undefined)
}
