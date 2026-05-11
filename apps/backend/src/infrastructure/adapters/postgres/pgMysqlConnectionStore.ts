import { randomUUID } from 'node:crypto'
import { Ok, Err, type Result, type AppError } from '@support/shared'
import type { MysqlConnectionRow, MysqlConnectionStorePort } from '../../../application/ports'
import type { PgPool } from './pool'

type DbRow = {
  id: string
  name: string
  host_encrypted: string
  port: number
  database_encrypted: string
  user_encrypted: string
  password_encrypted: string
  ssl: boolean
  created_at: Date
  updated_at: Date
}

export class PgMysqlConnectionStore implements MysqlConnectionStorePort {
  constructor(
    private readonly pool: PgPool,
    private readonly encrypt: (plaintext: string) => Promise<string>,
    private readonly decrypt: (envelope: string) => Promise<string>,
  ) {}

  async createConnection(
    input: { name: string; host: string; port: number; database: string; user: string; password: string; ssl: boolean },
  ): Promise<Result<MysqlConnectionRow, AppError>> {
    const id = randomUUID()
    try {
      const [hostEnc, dbEnc, userEnc, passEnc] = await Promise.all([
        this.encrypt(input.host),
        this.encrypt(input.database),
        this.encrypt(input.user),
        this.encrypt(input.password),
      ])
      const r = await this.pool.query<DbRow>(
        `INSERT INTO mysql_connections
           (id, name, host_encrypted, port, database_encrypted, user_encrypted, password_encrypted, ssl)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          id,
          input.name,
          hostEnc,
          input.port,
          dbEnc,
          userEnc,
          passEnc,
          input.ssl,
        ],
      )
      const row = r.rows[0]
      if (!row) return Err({ kind: 'infra_db_error', cause: 'no row returned' })
      return Ok(await this.toPublicRow(row))
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async listConnections(): Promise<Result<readonly MysqlConnectionRow[], AppError>> {
    try {
      const r = await this.pool.query<DbRow>(
        `SELECT * FROM mysql_connections ORDER BY created_at DESC`,
      )
      const rows = await Promise.all(r.rows.map((row) => this.toPublicRow(row)))
      return Ok(rows)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async getConnection(id: string): Promise<Result<MysqlConnectionRow, AppError>> {
    try {
      const r = await this.pool.query<DbRow>(
        `SELECT * FROM mysql_connections WHERE id = $1`,
        [id],
      )
      const row = r.rows[0]
      if (!row) return Err({ kind: 'infra_db_error', cause: 'mysql connection not found' })
      return Ok(await this.toPublicRow(row))
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async getCredentials(
    id: string,
  ): Promise<Result<{ host: string; port: number; database: string; user: string; password: string; ssl: boolean }, AppError>> {
    try {
      const r = await this.pool.query<DbRow>(
        `SELECT * FROM mysql_connections WHERE id = $1`,
        [id],
      )
      const row = r.rows[0]
      if (!row) return Err({ kind: 'infra_db_error', cause: 'mysql connection not found' })
      const [host, database, user, password] = await Promise.all([
        this.decrypt(row.host_encrypted),
        this.decrypt(row.database_encrypted),
        this.decrypt(row.user_encrypted),
        this.decrypt(row.password_encrypted),
      ])
      return Ok({
        host,
        port: row.port,
        database,
        user,
        password,
        ssl: row.ssl,
      })
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async deleteConnection(id: string): Promise<Result<void, AppError>> {
    try {
      await this.pool.query(`DELETE FROM mysql_connections WHERE id = $1`, [id])
      return Ok(undefined)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  private async toPublicRow(row: DbRow): Promise<MysqlConnectionRow> {
    const [host, database, user] = await Promise.all([
      this.decrypt(row.host_encrypted),
      this.decrypt(row.database_encrypted),
      this.decrypt(row.user_encrypted),
    ])
    return {
      id: row.id,
      name: row.name,
      host,
      port: row.port,
      database,
      user,
      ssl: row.ssl,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}
