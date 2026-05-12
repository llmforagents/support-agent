import { randomUUID } from 'node:crypto'
import { Ok, Err, type Result, AdminId, type AppError } from '@support/shared'
import type { AdminRow, AdminStorePort } from '../../../application/ports'

export class MemoryAdminStore implements AdminStorePort {
  private rows = new Map<string, AdminRow>() // keyed by email lower

  countAdmins(): Promise<Result<number, AppError>> {
    return Promise.resolve(Ok(this.rows.size))
  }

  async insertAdmin(input: { email: string; passwordHash: string }): Promise<Result<AdminRow, AppError>> {
    const k = input.email.toLowerCase()
    if (this.rows.has(k)) return Promise.resolve(Err({ kind: 'infra_db_error', cause: 'duplicate email' }))
    const row: AdminRow = {
      id: AdminId(randomUUID()),
      email: k,
      passwordHash: input.passwordHash,
      createdAt: new Date(),
    }
    this.rows.set(k, row)
    return Promise.resolve(Ok(row))
  }

  async insertFirstAdmin(input: { email: string; passwordHash: string }): Promise<Result<AdminRow | null, AppError>> {
    if (this.rows.size > 0) return Ok(null)
    const r = await this.insertAdmin(input)
    return r
  }

  findByEmail(email: string): Promise<Result<AdminRow | null, AppError>> {
    return Promise.resolve(Ok(this.rows.get(email.toLowerCase()) ?? null))
  }

  findById(id: AdminId): Promise<Result<AdminRow | null, AppError>> {
    for (const v of this.rows.values()) {
      if (v.id === id) return Promise.resolve(Ok(v))
    }
    return Promise.resolve(Ok(null))
  }

  touchLastLogin(id: AdminId): Promise<Result<void, AppError>> {
    for (const [k, v] of this.rows) {
      if (v.id === id) {
        this.rows.set(k, { ...v, lastLoginAt: new Date() })
        return Promise.resolve(Ok(undefined))
      }
    }
    return Promise.resolve(Err({ kind: 'infra_db_error', cause: 'not found' }))
  }

  updatePasswordHash(id: AdminId, passwordHash: string): Promise<Result<void, AppError>> {
    for (const [k, v] of this.rows) {
      if (v.id === id) {
        this.rows.set(k, { ...v, passwordHash })
        return Promise.resolve(Ok(undefined))
      }
    }
    return Promise.resolve(Err({ kind: 'infra_db_error', cause: 'not found' }))
  }
}
