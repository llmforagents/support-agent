import { Ok, Err, type Result, type AppError, SourceId, ChunkId } from '@support/shared'
import type { ChunkInsert, ChunkHit } from '../../../domain/source'
import type { VectorStorePort, SearchOpts } from '../../../application/ports'
import type { PgPool } from './pool'

function vectorLiteral(v: readonly number[]): string {
  return `[${v.join(',')}]`
}

export class PgvectorStore implements VectorStorePort {
  constructor(private readonly pool: PgPool) {}

  async upsertChunks(chunks: readonly ChunkInsert[]): Promise<Result<void, AppError>> {
    if (chunks.length === 0) return Ok(undefined)
    const client = await this.pool.connect()
    try {
      // Insert in batches of 50 to keep query size manageable
      for (let i = 0; i < chunks.length; i += 50) {
        const batch = chunks.slice(i, i + 50)
        const values: unknown[] = []
        const placeholders = batch
          .map((c, j) => {
            const base = j * 7
            values.push(
              c.id,
              c.sourceId,
              c.chunkIndex,
              c.text,
              c.tokenCount,
              vectorLiteral(c.embedding),
              c.ingestGeneration,
            )
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::vector, $${base + 7})`
          })
          .join(',')
        await client.query(
          `INSERT INTO chunks (id, source_id, chunk_index, text, token_count, embedding, ingest_generation)
           VALUES ${placeholders}`,
          values,
        )
      }
      // Update metadata for chunks that have non-empty metadata
      for (const c of chunks) {
        if (Object.keys(c.metadata).length > 0) {
          await client.query(`UPDATE chunks SET metadata = $1::jsonb WHERE id = $2`, [
            JSON.stringify(c.metadata),
            c.id,
          ])
        }
      }
      return Ok(undefined)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    } finally {
      client.release()
    }
  }

  async deleteBySourceBelowGeneration(
    sourceId: string,
    generation: number,
  ): Promise<Result<void, AppError>> {
    try {
      await this.pool.query(
        `DELETE FROM chunks WHERE source_id = $1 AND ingest_generation < $2`,
        [sourceId, generation],
      )
      return Ok(undefined)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async search(
    query: readonly number[],
    opts: SearchOpts,
  ): Promise<Result<readonly ChunkHit[], AppError>> {
    type SearchRow = {
      id: string
      source_id: string
      source_name: string
      text: string
      metadata: Record<string, unknown>
      score: string
    }
    try {
      const params: unknown[] = [vectorLiteral(query), opts.topK]
      let sourceFilter = ''
      if (opts.activeSourceIds && opts.activeSourceIds.length > 0) {
        params.push(opts.activeSourceIds)
        sourceFilter = `AND s.id = ANY($${params.length}::uuid[])`
      }
      const sql = `
        SELECT c.id, c.source_id, s.name AS source_name, c.text, c.metadata,
               1 - (c.embedding <=> $1::vector) AS score
        FROM chunks c
        JOIN sources s ON s.id = c.source_id
        WHERE s.active = TRUE
          AND s.state->>'status' = 'ready'
          AND c.ingest_generation = (s.state->>'currentGeneration')::bigint
          ${sourceFilter}
        ORDER BY c.embedding <=> $1::vector
        LIMIT $2
      `
      const r = await this.pool.query<SearchRow>(sql, params)
      const hits: ChunkHit[] = r.rows
        .map((row) => ({
          id: ChunkId(row.id),
          sourceId: SourceId(row.source_id),
          sourceName: row.source_name,
          text: row.text,
          score: Number(row.score),
          metadata: row.metadata,
        }))
        .filter((h) => h.score >= opts.minScore)
      return Ok(hits)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }
}
