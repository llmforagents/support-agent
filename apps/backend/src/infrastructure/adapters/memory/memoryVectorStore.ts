import { Ok, type Result, type AppError } from '@support/shared'
import type { SourceId } from '@support/shared'
import type { ChunkHit, ChunkInsert } from '../../../domain/source'
import type { KnowledgeStorePort, SearchOpts, VectorStorePort } from '../../../application/ports'

function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0
    const bi = b[i] ?? 0
    dot += ai * bi
    na += ai * ai
    nb += bi * bi
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

export class MemoryVectorStore implements VectorStorePort {
  private chunks = new Map<string, ChunkInsert>()

  constructor(private readonly knowledgeStore: KnowledgeStorePort) {}

  upsertChunks(chunks: readonly ChunkInsert[]): Promise<Result<void, AppError>> {
    for (const chunk of chunks) {
      this.chunks.set(chunk.id, chunk)
    }
    return Promise.resolve(Ok(undefined))
  }

  deleteBySourceBelowGeneration(sourceId: SourceId, generation: number): Promise<Result<void, AppError>> {
    for (const [id, chunk] of this.chunks) {
      if (chunk.sourceId === sourceId && chunk.ingestGeneration < generation) {
        this.chunks.delete(id)
      }
    }
    return Promise.resolve(Ok(undefined))
  }

  async search(query: readonly number[], opts: SearchOpts): Promise<Result<readonly ChunkHit[], AppError>> {
    // Determine which source IDs to consider
    const allowedSourceIds: Set<string> | null = opts.activeSourceIds
      ? new Set(opts.activeSourceIds)
      : null

    const hits: Array<ChunkHit & { _score: number }> = []

    for (const chunk of this.chunks.values()) {
      // Filter by activeSourceIds if provided
      if (allowedSourceIds !== null && !allowedSourceIds.has(chunk.sourceId)) {
        continue
      }

      // Verify source exists and is active via knowledgeStore
      const sourceResult = await this.knowledgeStore.getSource(chunk.sourceId)
      if (!sourceResult.ok || !sourceResult.value.active) {
        continue
      }

      const score = cosine(query, chunk.embedding)
      if (score < opts.minScore) continue

      hits.push({
        id: chunk.id,
        sourceId: chunk.sourceId,
        sourceName: sourceResult.value.name,
        text: chunk.text,
        score,
        metadata: chunk.metadata,
        _score: score,
      })
    }

    hits.sort((a, b) => b._score - a._score)
    const topK = hits.slice(0, opts.topK).map(({ _score: _s, ...rest }) => rest)
    return Promise.resolve(Ok(topK))
  }
}
