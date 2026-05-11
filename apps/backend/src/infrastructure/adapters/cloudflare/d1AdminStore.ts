// D1 implementation of AdminStorePort. Mirrors PgAdminStore semantics:
//   • emails are normalized to lowercase on insert (the schema uses
//     COLLATE NOCASE so equality is case-insensitive on read too)
//   • insertFirstAdmin uses `INSERT … SELECT … WHERE NOT EXISTS` and inspects
//     RunResult.meta.changes to detect a lost race (returns Ok(null))
//   • all errors map to `infra_db_error` to match the Pg adapter's surface —
//     no new error kinds are introduced
//
// D1 returns column values as JS strings/numbers/null; date columns come back
// as ISO-8601-ish strings produced by SQLite's `datetime('now')`, which we
// parse into JS Date for the domain row.
import { randomUUID } from 'node:crypto'
import { Ok, Err, type Result, AdminId, type AppError } from '@support/shared'
import type { AdminRow, AdminStorePort } from '../../../application/ports'

type Row = Readonly<{
  id: string
  email: string
  password_hash: string
  created_at: string
  last_login_at: string | null
}>

function rowToAdmin(r: Row): AdminRow {
  return {
    id: AdminId(r.id),
    email: r.email,
    passwordHash: r.password_hash,
    createdAt: new Date(r.created_at),
    ...(r.last_login_at !== null ? { lastLoginAt: new Date(r.last_login_at) } : {}),
  }
}

export class D1AdminStore implements AdminStorePort {
  constructor(private readonly db: D1Database) {}

  async countAdmins(): Promise<Result<number, AppError>> {
    try {
      const row = await this.db.prepare('SELECT COUNT(*) AS c FROM admins').first<{ c: number }>()
      return Ok(Number(row?.c ?? 0))
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async insertAdmin(input: { email: string; passwordHash: string }): Promise<Result<AdminRow, AppError>> {
    const id = randomUUID()
    try {
      const r = await this.db
        .prepare(
          `INSERT INTO admins (id, email, password_hash) VALUES (?, ?, ?)
           RETURNING id, email, password_hash, created_at, last_login_at`,
        )
        .bind(id, input.email.toLowerCase(), input.passwordHash)
        .first<Row>()
      if (!r) return Err({ kind: 'infra_db_error', cause: 'no row returned' })
      return Ok(rowToAdmin(r))
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async insertFirstAdmin(input: { email: string; passwordHash: string }): Promise<Result<AdminRow | null, AppError>> {
    const id = randomUUID()
    try {
      const result = await this.db
        .prepare(
          `INSERT INTO admins (id, email, password_hash)
           SELECT ?, ?, ?
           WHERE NOT EXISTS (SELECT 1 FROM admins LIMIT 1)`,
        )
        .bind(id, input.email.toLowerCase(), input.passwordHash)
        .run()
      if (!result.success) {
        return Err({ kind: 'infra_db_error', cause: result.error ?? 'd1 insert failed' })
      }
      const changes = result.meta?.changes ?? 0
      if (changes === 0) return Ok(null)
      const row = await this.db
        .prepare(
          `SELECT id, email, password_hash, created_at, last_login_at FROM admins WHERE id = ?`,
        )
        .bind(id)
        .first<Row>()
      if (!row) return Err({ kind: 'infra_db_error', cause: 'admin row missing after insert' })
      return Ok(rowToAdmin(row))
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async findByEmail(email: string): Promise<Result<AdminRow | null, AppError>> {
    try {
      const row = await this.db
        .prepare(
          `SELECT id, email, password_hash, created_at, last_login_at FROM admins WHERE email = ?`,
        )
        .bind(email.toLowerCase())
        .first<Row>()
      return Ok(row ? rowToAdmin(row) : null)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async findById(id: AdminId): Promise<Result<AdminRow | null, AppError>> {
    try {
      const row = await this.db
        .prepare(
          `SELECT id, email, password_hash, created_at, last_login_at FROM admins WHERE id = ?`,
        )
        .bind(id)
        .first<Row>()
      return Ok(row ? rowToAdmin(row) : null)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async touchLastLogin(id: AdminId): Promise<Result<void, AppError>> {
    try {
      await this.db
        .prepare(`UPDATE admins SET last_login_at = datetime('now') WHERE id = ?`)
        .bind(id)
        .run()
      return Ok(undefined)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }
}
