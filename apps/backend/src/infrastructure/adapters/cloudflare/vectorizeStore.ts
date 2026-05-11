// Cloudflare VectorStorePort adapter. Mirrors PgvectorStore semantics with one
// structural difference: vectors live in a Cloudflare Vectorize index keyed by
// chunks.id (see migrations-d1/0002_kb.sql — there is no `embedding` column in
// D1). Every method must keep the two stores in lockstep:
//
//   * `chunks` rows in D1: text, token_count, metadata, ingest_generation, …
//   * Vectorize entries: id, values, { sourceId, generation } metadata.
//
// All errors map to existing `infra_db_error` (no new error kinds added — per
// the P4 plan). Vectorize-side failures are caught and reported the same way
// as D1 failures so callers don't have to branch on which side blew up.
import { Ok, Err, type Result, type AppError, type SourceId } from '@support/shared'
import type { ChunkInsert, ChunkHit } from '../../../domain/source'
import type { VectorStorePort, SearchOpts } from '../../../application/ports'

export class VectorizeStore implements VectorStorePort {
  constructor(
    private readonly index: VectorizeIndex,
    private readonly db: D1Database,
  ) {}

  async upsertChunks(chunks: readonly ChunkInsert[]): Promise<Result<void, AppError>> {
    if (chunks.length === 0) return Ok(undefined)

    // 1) Write/replace D1 rows in a single batch. INSERT OR REPLACE matches
    //    PgvectorStore's idempotent-on-reingest semantics (the pg side
    //    overwrites in a separate UPDATE; here a single statement suffices
    //    because the PK is the chunk id).
    const rowStmts = chunks.map((c) =>
      this.db
        .prepare(
          `INSERT OR REPLACE INTO chunks
             (id, source_id, chunk_index, text, token_count, ingest_generation, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          c.id,
          c.sourceId,
          c.chunkIndex,
          c.text,
          c.tokenCount,
          c.ingestGeneration,
          JSON.stringify(c.metadata ?? {}),
        ),
    )
    try {
      const dbRes = await this.db.batch(rowStmts)
      if (dbRes.some((r) => !r.success)) {
        return Err({ kind: 'infra_db_error', cause: 'd1 batch insert failed' })
      }
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }

    // 2) Upsert vectors. We pass `sourceId` + `generation` as metadata so
    //    `search` can filter stale generations without a D1 round-trip.
    try {
      await this.index.upsert(
        chunks.map((c) => ({
          id: c.id,
          values: [...c.embedding],
          metadata: { sourceId: c.sourceId, generation: c.ingestGeneration },
        })),
      )
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
    return Ok(undefined)
  }

  deleteBySourceBelowGeneration(
    _sourceId: SourceId,
    _generation: number,
  ): Promise<Result<void, AppError>> {
    // Implemented in D3.
    return Promise.resolve(
      Err({ kind: 'infra_db_error', cause: 'deleteBySourceBelowGeneration not implemented' }),
    )
  }

  search(
    _query: readonly number[],
    _opts: SearchOpts,
  ): Promise<Result<readonly ChunkHit[], AppError>> {
    // Implemented in D2.
    return Promise.resolve(Err({ kind: 'infra_db_error', cause: 'search not implemented' }))
  }

  previewBySource(
    _sourceId: SourceId,
    _limit: number,
  ): Promise<Result<readonly ChunkHit[], AppError>> {
    // Implemented in D4.
    return Promise.resolve(
      Err({ kind: 'infra_db_error', cause: 'previewBySource not implemented' }),
    )
  }
}
