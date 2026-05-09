import { randomUUID } from 'node:crypto'
import { Ok, Err, type Result, type AppError } from '@support/shared'
import type { MysqlConnectionRow, MysqlConnectionStorePort } from '../../../application/ports'

type FullCreds = { host: string; port: number; database: string; user: string; password: string; ssl: boolean }
type FullRow = MysqlConnectionRow & { _credentials: FullCreds }

export class MemoryMysqlConnectionStore implements MysqlConnectionStorePort {
  private readonly rows = new Map<string, FullRow>()

  createConnection(
    input: { name: string; host: string; port: number; database: string; user: string; password: string; ssl: boolean },
  ): Promise<Result<MysqlConnectionRow, AppError>> {
    const id = randomUUID()
    const now = new Date()
    const row: FullRow = {
      id,
      name: input.name,
      host: input.host,
      port: input.port,
      database: input.database,
      user: input.user,
      ssl: input.ssl,
      createdAt: now,
      updatedAt: now,
      _credentials: { host: input.host, port: input.port, database: input.database, user: input.user, password: input.password, ssl: input.ssl },
    }
    this.rows.set(id, row)
    const { _credentials: _creds, ...publicRow } = row
    return Promise.resolve(Ok(publicRow))
  }

  listConnections(): Promise<Result<readonly MysqlConnectionRow[], AppError>> {
    const list = [...this.rows.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(({ _credentials: _creds, ...row }) => row)
    return Promise.resolve(Ok(list))
  }

  getConnection(id: string): Promise<Result<MysqlConnectionRow, AppError>> {
    const r = this.rows.get(id)
    if (!r) return Promise.resolve(Err({ kind: 'infra_db_error', cause: 'mysql connection not found' }))
    const { _credentials: _creds, ...row } = r
    return Promise.resolve(Ok(row))
  }

  getCredentials(id: string): Promise<Result<FullCreds, AppError>> {
    const r = this.rows.get(id)
    if (!r) return Promise.resolve(Err({ kind: 'infra_db_error', cause: 'mysql connection not found' }))
    return Promise.resolve(Ok(r._credentials))
  }

  deleteConnection(id: string): Promise<Result<void, AppError>> {
    this.rows.delete(id)
    return Promise.resolve(Ok(undefined))
  }
}
