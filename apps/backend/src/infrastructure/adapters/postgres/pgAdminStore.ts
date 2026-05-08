import { randomUUID } from 'node:crypto'
import { Ok, Err, type Result, AdminId, type AppError } from '@support/shared'
import type { AdminRow, AdminStorePort } from '../../../application/ports'
import type { PgPool } from './pool'

type Row = { id: string; email: string; password_hash: string; created_at: Date; last_login_at: Date | null }

function rowToAdmin(r: Row): AdminRow {
  return {
    id: AdminId(r.id),
    email: r.email,
    passwordHash: r.password_hash,
    createdAt: r.created_at,
    ...(r.last_login_at !== null ? { lastLoginAt: r.last_login_at } : {}),
  }
}

export class PgAdminStore implements AdminStorePort {
  constructor(private readonly pool: PgPool) {}

  async countAdmins(): Promise<Result<number, AppError>> {
    try {
      const r = await this.pool.query<{ c: string }>('SELECT COUNT(*)::text AS c FROM admins')
      return Ok(Number(r.rows[0]?.['c'] ?? '0'))
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async insertAdmin(input: { email: string; passwordHash: string }): Promise<Result<AdminRow, AppError>> {
    const id = randomUUID()
    try {
      const r = await this.pool.query<Row>(
        `INSERT INTO admins (id, email, password_hash) VALUES ($1, $2, $3)
         RETURNING id, email, password_hash, created_at, last_login_at`,
        [id, input.email.toLowerCase(), input.passwordHash],
      )
      const row = r.rows[0]
      if (!row) return Err({ kind: 'infra_db_error', cause: 'no row returned' })
      return Ok(rowToAdmin(row))
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async insertFirstAdmin(input: { email: string; passwordHash: string }): Promise<Result<AdminRow | null, AppError>> {
    const id = randomUUID()
    try {
      const r = await this.pool.query<Row>(
        `INSERT INTO admins (id, email, password_hash)
         SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM admins)
         RETURNING id, email, password_hash, created_at, last_login_at`,
        [id, input.email.toLowerCase(), input.passwordHash],
      )
      const row = r.rows[0]
      return Ok(row ? rowToAdmin(row) : null)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async findByEmail(email: string): Promise<Result<AdminRow | null, AppError>> {
    try {
      const r = await this.pool.query<Row>(
        `SELECT id, email, password_hash, created_at, last_login_at FROM admins WHERE email = $1`,
        [email.toLowerCase()],
      )
      const row = r.rows[0]
      return Ok(row ? rowToAdmin(row) : null)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async findById(id: AdminId): Promise<Result<AdminRow | null, AppError>> {
    try {
      const r = await this.pool.query<Row>(
        `SELECT id, email, password_hash, created_at, last_login_at FROM admins WHERE id = $1`,
        [id],
      )
      const row = r.rows[0]
      return Ok(row ? rowToAdmin(row) : null)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async touchLastLogin(id: AdminId): Promise<Result<void, AppError>> {
    try {
      await this.pool.query(`UPDATE admins SET last_login_at = NOW() WHERE id = $1`, [id])
      return Ok(undefined)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }
}
