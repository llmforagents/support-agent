// D1 implementation of MysqlConnectionStorePort. Parity-only — the
// Cloudflare driver rejects `mysql_query` sources at the route layer
// (see future driverGuard), so this store never actually opens MySQL
// connections. Tests cover basic CRUD.
//
// Schema drift vs Pg (intentional, see migration 0003_handoff_mysql.sql):
//   • Pg encrypts host/database/user/password. D1 stores host, port,
//     database_name, user as plaintext and only encrypts the password.
//   • Pg has an `ssl` BOOLEAN column and an `updated_at` TIMESTAMP. D1's
//     table omits both — the row mapper synthesises `ssl: false` (the
//     input ssl flag is silently dropped) and `updatedAt = createdAt`.
//
// The port contract still asks for `ssl` and `updatedAt`, so we satisfy it
// by synthesising — callers in the Cloudflare driver never read these
// fields meaningfully because mysql_query is gated off entirely.
//
// All errors map to `infra_db_error` to mirror PgMysqlConnectionStore —
// no new error kinds are introduced. Datetime columns use SQLite's
// native `datetime('now')` format via the shared helpers in `./dateUtils.ts`.
import { randomUUID } from 'node:crypto'
import { Ok, Err, type Result, type AppError } from '@support/shared'
import type {
  MysqlConnectionRow,
  MysqlConnectionStorePort,
} from '../../../application/ports'
import { parseSqliteDatetime } from './dateUtils'

type DbRow = Readonly<{
  id: string
  name: string
  host: string
  port: number
  database_name: string
  user: string
  password_encrypted: string
  created_at: string
}>

const SELECT_COLS = `id, name, host, port, database_name, user, password_encrypted, created_at`

export class D1MysqlConnectionStore implements MysqlConnectionStorePort {
  constructor(
    private readonly db: D1Database,
    private readonly encrypt: (plaintext: string) => string,
    private readonly decrypt: (envelope: string) => string,
  ) {}

  async createConnection(input: {
    name: string
    host: string
    port: number
    database: string
    user: string
    password: string
    ssl: boolean
  }): Promise<Result<MysqlConnectionRow, AppError>> {
    const id = randomUUID()
    try {
      const insertRes = await this.db
        .prepare(
          `INSERT INTO mysql_connections
             (id, name, host, port, database_name, user, password_encrypted)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          input.name,
          input.host,
          input.port,
          input.database,
          input.user,
          this.encrypt(input.password),
        )
        .run()
      if (!insertRes.success) {
        return Err({ kind: 'infra_db_error', cause: insertRes.error ?? 'd1 insert failed' })
      }
      const row = await this.db
        .prepare(`SELECT ${SELECT_COLS} FROM mysql_connections WHERE id = ?`)
        .bind(id)
        .first<DbRow>()
      if (!row) {
        return Err({ kind: 'infra_db_error', cause: 'mysql connection row missing after insert' })
      }
      return Ok(this.toPublicRow(row))
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async listConnections(): Promise<Result<readonly MysqlConnectionRow[], AppError>> {
    try {
      const result = await this.db
        .prepare(`SELECT ${SELECT_COLS} FROM mysql_connections ORDER BY created_at DESC`)
        .all<DbRow>()
      return Ok(result.results.map((row) => this.toPublicRow(row)))
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async getConnection(id: string): Promise<Result<MysqlConnectionRow, AppError>> {
    try {
      const row = await this.db
        .prepare(`SELECT ${SELECT_COLS} FROM mysql_connections WHERE id = ?`)
        .bind(id)
        .first<DbRow>()
      if (!row) return Err({ kind: 'infra_db_error', cause: 'mysql connection not found' })
      return Ok(this.toPublicRow(row))
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async getCredentials(id: string): Promise<
    Result<
      { host: string; port: number; database: string; user: string; password: string; ssl: boolean },
      AppError
    >
  > {
    try {
      const row = await this.db
        .prepare(`SELECT ${SELECT_COLS} FROM mysql_connections WHERE id = ?`)
        .bind(id)
        .first<DbRow>()
      if (!row) return Err({ kind: 'infra_db_error', cause: 'mysql connection not found' })
      return Ok({
        host: row.host,
        port: row.port,
        database: row.database_name,
        user: row.user,
        password: this.decrypt(row.password_encrypted),
        ssl: false,
      })
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async deleteConnection(id: string): Promise<Result<void, AppError>> {
    try {
      const r = await this.db
        .prepare(`DELETE FROM mysql_connections WHERE id = ?`)
        .bind(id)
        .run()
      if (!r.success) {
        return Err({ kind: 'infra_db_error', cause: r.error ?? 'd1 delete failed' })
      }
      return Ok(undefined)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  private toPublicRow(row: DbRow): MysqlConnectionRow {
    // D1 schema has no ssl / updated_at columns — synthesize for port parity.
    // The cloudflare driver never opens MySQL connections (mysql_query sources
    // are rejected by driverGuard), so these synthetic values are inert.
    const createdAt = parseSqliteDatetime(row.created_at)
    return {
      id: row.id,
      name: row.name,
      host: row.host,
      port: row.port,
      database: row.database_name,
      user: row.user,
      ssl: false,
      createdAt,
      updatedAt: createdAt,
    }
  }
}
