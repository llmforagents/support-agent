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
import { Ok, Err, type Result, type AppError, type SourceId, ChunkId, SourceId as SourceIdBrand } from '@support/shared'
import type { ChunkInsert, ChunkHit, SourceState } from '../../../domain/source'
import type { VectorStorePort, SearchOpts } from '../../../application/ports'

// Pull `topK` candidates from Vectorize and join in D1. We deliberately
// over-fetch from Vectorize (topK * 4, capped at 100) because the
// active/ready/generation filter happens in D1 — if all topK matches happen
// to be stale, the user would get fewer hits than asked for. The over-fetch
// is bounded to keep the IN(...) SQL fragment small.
const VECTORIZE_OVERFETCH_MULTIPLIER = 4
const VECTORIZE_OVERFETCH_MAX = 100

function safeJsonParse<T>(raw: string, label: string): Result<T, AppError> {
  try {
    return Ok(JSON.parse(raw) as T)
  } catch (err) {
    return Err({ kind: 'infra_db_error', cause: `${label} json malformed: ${String(err)}` })
  }
}

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

  async deleteBySourceBelowGeneration(
    sourceId: SourceId,
    generation: number,
  ): Promise<Result<void, AppError>> {
    // Vectorize has no "delete by metadata filter" — enumerate the ids in D1
    // first so we can call deleteByIds, then DELETE from D1. Order matters:
    // if Vectorize fails we leave D1 intact so a retry can drive the index
    // back to consistency.
    let stale: { results: Array<{ id: string }> }
    try {
      stale = await this.db
        .prepare(`SELECT id FROM chunks WHERE source_id = ? AND ingest_generation < ?`)
        .bind(sourceId, generation)
        .all<{ id: string }>()
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
    if (stale.results.length === 0) return Ok(undefined)

    const ids = stale.results.map((r) => r.id)
    // Vectorize.deleteByIds accepts up to 1000 ids per call; chunk to be safe.
    for (let i = 0; i < ids.length; i += 1000) {
      try {
        await this.index.deleteByIds(ids.slice(i, i + 1000))
      } catch (err) {
        return Err({ kind: 'infra_db_error', cause: String(err) })
      }
    }

    try {
      const r = await this.db
        .prepare(`DELETE FROM chunks WHERE source_id = ? AND ingest_generation < ?`)
        .bind(sourceId, generation)
        .run()
      if (!r.success) {
        return Err({ kind: 'infra_db_error', cause: r.error ?? 'd1 delete failed' })
      }
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
    return Ok(undefined)
  }

  async search(
    query: readonly number[],
    opts: SearchOpts,
  ): Promise<Result<readonly ChunkHit[], AppError>> {
    // 1) Ask Vectorize for candidates. Over-fetch so D1's active/ready/gen
    //    filter doesn't starve the result set.
    const fetchK = Math.min(
      VECTORIZE_OVERFETCH_MAX,
      Math.max(opts.topK, opts.topK * VECTORIZE_OVERFETCH_MULTIPLIER),
    )
    let vecRes: VectorizeMatches
    try {
      vecRes = await this.index.query([...query], { topK: fetchK, returnMetadata: true })
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
    if (vecRes.matches.length === 0) return Ok([])

    // 2) Apply minScore early — saves a D1 round-trip if everything is
    //    below threshold.
    const aboveThreshold = vecRes.matches.filter((m) => m.score >= opts.minScore)
    if (aboveThreshold.length === 0) return Ok([])

    // 3) Join in D1 to recover text + metadata + source name + active flag +
    //    current generation. The join filters: source.active = 1, state JSON
    //    holds status='ready', and the chunk's ingest_generation matches the
    //    source's current generation. activeSourceIds (if provided) further
    //    restricts the result set.
    const ids = aboveThreshold.map((m) => m.id)
    const idPlaceholders = ids.map(() => '?').join(',')
    const params: unknown[] = [...ids]
    let sourceFilter = ''
    if (opts.activeSourceIds && opts.activeSourceIds.length > 0) {
      const srcPlaceholders = opts.activeSourceIds.map(() => '?').join(',')
      sourceFilter = ` AND s.id IN (${srcPlaceholders})`
      params.push(...opts.activeSourceIds)
    }
    type Row = {
      id: string
      source_id: string
      source_name: string
      text: string
      metadata: string
      ingest_generation: number
      state: string
      active: number
    }
    let rows: { results: Row[] }
    try {
      rows = await this.db
        .prepare(
          `SELECT c.id, c.source_id, c.text, c.metadata, c.ingest_generation,
                  s.name AS source_name, s.state, s.active
           FROM chunks c
           JOIN sources s ON s.id = c.source_id
           WHERE c.id IN (${idPlaceholders})
             AND s.active = 1
             ${sourceFilter}`,
        )
        .bind(...params)
        .all<Row>()
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }

    const rowById = new Map<string, Row>(rows.results.map((r) => [r.id, r]))

    // 4) Re-build hits in the score order Vectorize returned, dropping any
    //    that failed the D1-side filters. Limit to opts.topK at the end.
    const hits: ChunkHit[] = []
    for (const m of aboveThreshold) {
      if (hits.length >= opts.topK) break
      const row = rowById.get(m.id)
      if (!row) continue
      const stateRes = safeJsonParse<SourceState>(row.state, 'sources.state')
      if (!stateRes.ok) return stateRes
      if (stateRes.value.status !== 'ready') continue
      if (row.ingest_generation !== stateRes.value.currentGeneration) continue
      const metaRes = safeJsonParse<Record<string, unknown>>(row.metadata, 'chunks.metadata')
      if (!metaRes.ok) return metaRes
      hits.push({
        id: ChunkId(row.id),
        sourceId: SourceIdBrand(row.source_id),
        sourceName: row.source_name,
        text: row.text,
        score: m.score,
        metadata: metaRes.value,
      })
    }
    return Ok(hits)
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
