import { Ok, Err, type Result, type AppError } from '@support/shared'
import type { AdminRow, AdminStorePort, AdminSessionStorePort } from '../ports'

export type VerifyDeps = Readonly<{
  adminStore: AdminStorePort
  sessionStore: AdminSessionStorePort
  sha256: (s: string) => string
}>

export async function verifySession(deps: VerifyDeps, token: string): Promise<Result<AdminRow, AppError>> {
  if (!/^[0-9a-f]{64}$/.test(token)) return Err({ kind: 'auth_no_session' })
  const tokenHash = deps.sha256(token)
  const found = await deps.sessionStore.findByTokenHash(tokenHash)
  if (!found.ok) return found
  if (!found.value) return Err({ kind: 'auth_no_session' })
  if (found.value.expiresAt <= new Date()) return Err({ kind: 'auth_session_expired' })
  const admin = await deps.adminStore.findById(found.value.adminId)
  if (!admin.ok) return admin
  if (!admin.value) return Err({ kind: 'auth_no_session' })
  return Ok(admin.value)
}
