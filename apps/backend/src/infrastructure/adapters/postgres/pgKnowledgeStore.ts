import { randomUUID } from 'node:crypto'
import { Ok, Err, type Result, type AppError, SourceId } from '@support/shared'
import type { Source, SourceConfig, SourceState, SourceType } from '../../../domain/source'
import type { KnowledgeStorePort } from '../../../application/ports'
import type { PgPool } from './pool'

type Row = {
  id: string
  name: string
  source_type: string
  config: SourceConfig
  state: SourceState
  active: boolean
  created_at: Date
  updated_at: Date
}

function rowToSource(r: Row): Source {
  return {
    id: SourceId(r.id),
    name: r.name,
    sourceType: r.source_type as SourceType,
    config: r.config,
    state: r.state,
    active: r.active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export class PgKnowledgeStore implements KnowledgeStorePort {
  constructor(private readonly pool: PgPool) {}

  async createSource(input: {
    name: string
    sourceType: SourceType
    config: SourceConfig
  }): Promise<Result<Source, AppError>> {
    const id = randomUUID()
    const initialState: SourceState = { status: 'idle', currentGeneration: 0 }
    try {
      const r = await this.pool.query<Row>(
        `INSERT INTO sources (id, name, source_type, config, state, active)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, TRUE)
         RETURNING id, name, source_type, config, state, active, created_at, updated_at`,
        [id, input.name, input.sourceType, JSON.stringify(input.config), JSON.stringify(initialState)],
      )
      const row = r.rows[0]
      if (!row) return Err({ kind: 'infra_db_error', cause: 'no row returned' })
      return Ok(rowToSource(row))
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async getSource(id: string): Promise<Result<Source, AppError>> {
    try {
      const r = await this.pool.query<Row>(
        `SELECT id, name, source_type, config, state, active, created_at, updated_at
         FROM sources WHERE id = $1`,
        [id],
      )
      const row = r.rows[0]
      if (!row) return Err({ kind: 'source_not_found' })
      return Ok(rowToSource(row))
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async listSources(): Promise<Result<readonly Source[], AppError>> {
    try {
      const r = await this.pool.query<Row>(
        `SELECT id, name, source_type, config, state, active, created_at, updated_at
         FROM sources ORDER BY created_at DESC`,
      )
      return Ok(r.rows.map(rowToSource))
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async updateSourceState(id: string, state: SourceState): Promise<Result<void, AppError>> {
    try {
      await this.pool.query(
        `UPDATE sources SET state = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(state), id],
      )
      return Ok(undefined)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async setActive(id: string, active: boolean): Promise<Result<void, AppError>> {
    try {
      await this.pool.query(
        `UPDATE sources SET active = $1, updated_at = NOW() WHERE id = $2`,
        [active, id],
      )
      return Ok(undefined)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async deleteSource(id: string): Promise<Result<void, AppError>> {
    try {
      await this.pool.query(`DELETE FROM sources WHERE id = $1`, [id])
      return Ok(undefined)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }
}
