import { randomUUID } from 'node:crypto'
import { Ok, Err, type Result, AdminId, type AppError } from '@support/shared'
import type { AdminSessionRow, AdminSessionStorePort } from '../../../application/ports'
import type { PgPool } from './pool'

type Row = { id: string; admin_id: string; expires_at: Date; created_at: Date }

export class PgAdminSessionStore implements AdminSessionStorePort {
  constructor(private readonly pool: PgPool) {}

  async insert(input: {
    adminId: AdminId
    tokenHash: string
    expiresAt: Date
  }): Promise<Result<AdminSessionRow, AppError>> {
    const id = randomUUID()
    try {
      const r = await this.pool.query<Row>(
        `INSERT INTO admin_sessions (id, admin_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)
         RETURNING id, admin_id, expires_at, created_at`,
        [id, input.adminId, input.tokenHash, input.expiresAt],
      )
      const row = r.rows[0]
      if (!row) return Err({ kind: 'infra_db_error', cause: 'no row' })
      return Ok({
        id: row.id,
        adminId: AdminId(row.admin_id),
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      })
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async findByTokenHash(tokenHash: string): Promise<Result<AdminSessionRow | null, AppError>> {
    try {
      const r = await this.pool.query<Row>(
        `SELECT id, admin_id, expires_at, created_at FROM admin_sessions WHERE token_hash = $1`,
        [tokenHash],
      )
      const row = r.rows[0]
      return Ok(
        row
          ? { id: row.id, adminId: AdminId(row.admin_id), expiresAt: row.expires_at, createdAt: row.created_at }
          : null,
      )
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async delete(tokenHash: string): Promise<Result<void, AppError>> {
    try {
      await this.pool.query(`DELETE FROM admin_sessions WHERE token_hash = $1`, [tokenHash])
      return Ok(undefined)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async deleteExpired(): Promise<Result<number, AppError>> {
    try {
      const r = await this.pool.query(`DELETE FROM admin_sessions WHERE expires_at <= NOW()`)
      return Ok(r.rowCount ?? 0)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }
}
