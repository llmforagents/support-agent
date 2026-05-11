// D1 implementation of AdminSessionStorePort.
//
// Date-format choice for `expires_at` / `created_at`:
//   Both columns are stored in SQLite's native `datetime()` format —
//   `YYYY-MM-DD HH:MM:SS` (UTC, space separator, no milliseconds, no Z).
//   `created_at` defaults to `datetime('now')`; `expires_at` is written via
//   `toSqliteDatetime(date)`. Reads parse back to JS `Date` with
//   `parseSqliteDatetime` (both helpers live in `./dateUtils.ts` so every
//   D1 adapter shares one format).
//
// Errors map to `infra_db_error` to mirror PgAdminSessionStore — no new
// error kinds are introduced.
import { randomUUID } from 'node:crypto'
import { Ok, Err, type Result, AdminId, type AppError } from '@support/shared'
import type { AdminSessionRow, AdminSessionStorePort } from '../../../application/ports'
import { toSqliteDatetime, parseSqliteDatetime } from './dateUtils'

type Row = Readonly<{
  id: string
  admin_id: string
  expires_at: string
  created_at: string
}>

function rowToAdminSession(r: Row): AdminSessionRow {
  return {
    id: r.id,
    adminId: AdminId(r.admin_id),
    expiresAt: parseSqliteDatetime(r.expires_at),
    createdAt: parseSqliteDatetime(r.created_at),
  }
}

export class D1AdminSessionStore implements AdminSessionStorePort {
  constructor(private readonly db: D1Database) {}

  async insert(input: {
    adminId: AdminId
    tokenHash: string
    expiresAt: Date
  }): Promise<Result<AdminSessionRow, AppError>> {
    const id = randomUUID()
    try {
      const row = await this.db
        .prepare(
          `INSERT INTO admin_sessions (id, admin_id, token_hash, expires_at)
           VALUES (?, ?, ?, ?)
           RETURNING id, admin_id, expires_at, created_at`,
        )
        .bind(id, input.adminId, input.tokenHash, toSqliteDatetime(input.expiresAt))
        .first<Row>()
      if (!row) return Err({ kind: 'infra_db_error', cause: 'no row' })
      return Ok(rowToAdminSession(row))
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async findByTokenHash(tokenHash: string): Promise<Result<AdminSessionRow | null, AppError>> {
    // Mirrors PgAdminSessionStore: lookup is by token_hash only. Expiry is
    // enforced by callers (verifySession) and by the deleteExpired sweep,
    // not by this query. Keeping that contract in lockstep prevents the
    // D1 adapter from silently disagreeing with its Pg twin.
    try {
      const row = await this.db
        .prepare(
          `SELECT id, admin_id, expires_at, created_at FROM admin_sessions WHERE token_hash = ?`,
        )
        .bind(tokenHash)
        .first<Row>()
      return Ok(row ? rowToAdminSession(row) : null)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async delete(tokenHash: string): Promise<Result<void, AppError>> {
    try {
      await this.db.prepare(`DELETE FROM admin_sessions WHERE token_hash = ?`).bind(tokenHash).run()
      return Ok(undefined)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async deleteExpired(): Promise<Result<number, AppError>> {
    try {
      const r = await this.db
        .prepare(`DELETE FROM admin_sessions WHERE expires_at <= datetime('now')`)
        .run()
      if (!r.success) {
        return Err({ kind: 'infra_db_error', cause: r.error ?? 'd1 delete failed' })
      }
      return Ok(r.meta?.changes ?? 0)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }
}
