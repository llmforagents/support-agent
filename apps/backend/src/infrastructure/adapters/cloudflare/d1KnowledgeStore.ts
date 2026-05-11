// D1 implementation of KnowledgeStorePort. Mirrors PgKnowledgeStore semantics
// with two D1-specific accommodations:
//
//   1. JSON columns are TEXT. `config` and `state` are stored as JSON strings.
//      Reads go through `safeJsonParse` so a malformed row surfaces as
//      `infra_db_error` rather than throwing.
//
//   2. `active` is INTEGER (0/1). Reads coerce via `Boolean(row.active)`,
//      writes via `active ? 1 : 0`.
//
// Cascade delete on chunks is provided by the FK in migration 0002 plus
// `PRAGMA foreign_keys = ON` set by the migration runner.
//
// All errors map to `infra_db_error` and `source_not_found` to mirror
// PgKnowledgeStore — no new error kinds are introduced.
//
// Datetime columns (`created_at`, `updated_at`) use SQLite's native
// `datetime('now')` format via the shared helpers in `./dateUtils.ts`.
import { randomUUID } from 'node:crypto'
import { Ok, Err, type Result, type AppError, SourceId } from '@support/shared'
import type {
  Source,
  SourceConfig,
  SourceState,
  SourceType,
} from '../../../domain/source'
import type { KnowledgeStorePort } from '../../../application/ports'
import { parseSqliteDatetime } from './dateUtils'

type Row = Readonly<{
  id: string
  name: string
  source_type: string
  config: string
  state: string
  active: number
  created_at: string
  updated_at: string
}>

function safeJsonParse<T>(raw: string, label: string): Result<T, AppError> {
  try {
    return Ok(JSON.parse(raw) as T)
  } catch (err) {
    return Err({ kind: 'infra_db_error', cause: `${label} json malformed: ${String(err)}` })
  }
}

function rowToSource(r: Row): Result<Source, AppError> {
  const configRes = safeJsonParse<SourceConfig>(r.config, 'config')
  if (!configRes.ok) return configRes
  const stateRes = safeJsonParse<SourceState>(r.state, 'state')
  if (!stateRes.ok) return stateRes
  return Ok({
    id: SourceId(r.id),
    name: r.name,
    sourceType: r.source_type as SourceType,
    config: configRes.value,
    state: stateRes.value,
    active: Boolean(r.active),
    createdAt: parseSqliteDatetime(r.created_at),
    updatedAt: parseSqliteDatetime(r.updated_at),
  })
}

const SELECT_COLS = `id, name, source_type, config, state, active, created_at, updated_at`

export class D1KnowledgeStore implements KnowledgeStorePort {
  constructor(private readonly db: D1Database) {}

  async createSource(input: {
    name: string
    sourceType: SourceType
    config: SourceConfig
  }): Promise<Result<Source, AppError>> {
    const id = randomUUID()
    const initialState: SourceState = { status: 'idle', currentGeneration: 0 }
    try {
      const insertRes = await this.db
        .prepare(
          `INSERT INTO sources (id, name, source_type, config, state, active)
           VALUES (?, ?, ?, ?, ?, 1)`,
        )
        .bind(
          id,
          input.name,
          input.sourceType,
          JSON.stringify(input.config),
          JSON.stringify(initialState),
        )
        .run()
      if (!insertRes.success) {
        return Err({ kind: 'infra_db_error', cause: insertRes.error ?? 'd1 insert failed' })
      }
      const row = await this.db
        .prepare(`SELECT ${SELECT_COLS} FROM sources WHERE id = ?`)
        .bind(id)
        .first<Row>()
      if (!row) return Err({ kind: 'infra_db_error', cause: 'source row missing after insert' })
      return rowToSource(row)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async getSource(id: SourceId): Promise<Result<Source, AppError>> {
    try {
      const row = await this.db
        .prepare(`SELECT ${SELECT_COLS} FROM sources WHERE id = ?`)
        .bind(id)
        .first<Row>()
      if (!row) return Err({ kind: 'source_not_found' })
      return rowToSource(row)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async listSources(): Promise<Result<readonly Source[], AppError>> {
    try {
      const result = await this.db
        .prepare(`SELECT ${SELECT_COLS} FROM sources ORDER BY created_at DESC`)
        .all<Row>()
      const sources: Source[] = []
      for (const row of result.results) {
        const r = rowToSource(row)
        if (!r.ok) return r
        sources.push(r.value)
      }
      return Ok(sources)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async updateSourceState(id: SourceId, state: SourceState): Promise<Result<void, AppError>> {
    try {
      const r = await this.db
        .prepare(
          `UPDATE sources SET state = ?, updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(JSON.stringify(state), id)
        .run()
      if (!r.success) {
        return Err({ kind: 'infra_db_error', cause: r.error ?? 'd1 update failed' })
      }
      return Ok(undefined)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async setActive(id: SourceId, active: boolean): Promise<Result<void, AppError>> {
    try {
      const r = await this.db
        .prepare(
          `UPDATE sources SET active = ?, updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(active ? 1 : 0, id)
        .run()
      if (!r.success) {
        return Err({ kind: 'infra_db_error', cause: r.error ?? 'd1 update failed' })
      }
      return Ok(undefined)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async deleteSource(id: SourceId): Promise<Result<void, AppError>> {
    try {
      // FK ON DELETE CASCADE (migration 0002) sweeps chunks. The runner enables
      // PRAGMA foreign_keys = ON, so the cascade actually fires.
      const r = await this.db.prepare(`DELETE FROM sources WHERE id = ?`).bind(id).run()
      if (!r.success) {
        return Err({ kind: 'infra_db_error', cause: r.error ?? 'd1 delete failed' })
      }
      return Ok(undefined)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }
}
