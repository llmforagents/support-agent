import { randomUUID } from 'node:crypto'
import { Ok, type Result, type AppError, type AdminId } from '@support/shared'
import type { AdminSessionRow, AdminSessionStorePort } from '../../../application/ports'

export class MemoryAdminSessionStore implements AdminSessionStorePort {
  private byHash = new Map<string, AdminSessionRow & { tokenHash: string }>()

  insert(input: { adminId: AdminId; tokenHash: string; expiresAt: Date }): Promise<Result<AdminSessionRow, AppError>> {
    const row = {
      id: randomUUID(),
      adminId: input.adminId,
      expiresAt: input.expiresAt,
      createdAt: new Date(),
      tokenHash: input.tokenHash,
    }
    this.byHash.set(input.tokenHash, row)
    const { tokenHash: _omit, ...visible } = row
    return Promise.resolve(Ok(visible))
  }

  findByTokenHash(tokenHash: string): Promise<Result<AdminSessionRow | null, AppError>> {
    const r = this.byHash.get(tokenHash)
    if (!r) return Promise.resolve(Ok(null))
    const { tokenHash: _omit, ...visible } = r
    return Promise.resolve(Ok(visible))
  }

  delete(tokenHash: string): Promise<Result<void, AppError>> {
    this.byHash.delete(tokenHash)
    return Promise.resolve(Ok(undefined))
  }

  deleteExpired(): Promise<Result<number, AppError>> {
    const now = new Date()
    let n = 0
    for (const [k, v] of this.byHash) {
      if (v.expiresAt <= now) {
        this.byHash.delete(k)
        n++
      }
    }
    return Promise.resolve(Ok(n))
  }
}
