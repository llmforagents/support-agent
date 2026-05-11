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
import type { ChunkInsert, SourceConfig } from '../../src/domain/source'

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
})
