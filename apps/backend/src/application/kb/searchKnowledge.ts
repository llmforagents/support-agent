import { Ok, type Result, type AppError } from '@support/shared'
import type { ChunkHit } from '../../domain/source'
import type { EmbedderPort, VectorStorePort, SiteConfigStorePort } from '../ports'

export type SearchDeps = Readonly<{
  embedder: EmbedderPort
  vectorStore: VectorStorePort
  siteConfigStore: SiteConfigStorePort
  decrypt: (envelope: string) => string
}>

export async function searchKnowledge(
  deps: SearchDeps,
  query: string,
  opts: { topK: number; minScore: number },
): Promise<Result<readonly ChunkHit[], AppError>> {
  const cfg = await deps.siteConfigStore.get()
  if (!cfg.ok) return cfg
  if (!cfg.value || !cfg.value.onboardingCompleted) return Ok([])

  const apiKey = deps.decrypt(cfg.value.llm4agentsApiKeyEncrypted)
  const embedRes = await deps.embedder.embed([query], apiKey)
  if (!embedRes.ok) return embedRes

  const vec = embedRes.value[0]
  if (!vec) return Ok([])

  const results = await deps.vectorStore.search(vec, opts)
  if (!results.ok) return results
  return Ok(mergeAdjacent(results.value))
}

// Light dedup: keep top-2 hits per source, sorted by score desc.
function mergeAdjacent(hits: readonly ChunkHit[]): readonly ChunkHit[] {
  const bySource = new Map<string, ChunkHit[]>()
  for (const h of hits) {
    const arr = bySource.get(h.sourceId) ?? []
    if (arr.length < 2) arr.push(h)
    bySource.set(h.sourceId, arr)
  }
  return [...bySource.values()].flat().sort((a, b) => b.score - a.score)
}
