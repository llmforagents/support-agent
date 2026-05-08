import { randomBytes } from 'node:crypto'
import { Ok, Err, type Result, type AppError, ADMIN_SESSION_TTL_MS } from '@support/shared'
import type { AdminStorePort, AdminSessionStorePort } from '../ports'

export type LoginDeps = Readonly<{
  adminStore: AdminStorePort
  sessionStore: AdminSessionStorePort
  verifyPassword: (plain: string, hash: string) => Promise<boolean>
  sha256: (s: string) => string
}>

export type LoginResult = Readonly<{ token: string; expiresAt: Date }>

export async function login(
  deps: LoginDeps,
  input: { email: string; password: string },
): Promise<Result<LoginResult, AppError>> {
  const found = await deps.adminStore.findByEmail(input.email)
  if (!found.ok) return found
  if (!found.value) return Err({ kind: 'auth_invalid_credentials' })
  const ok = await deps.verifyPassword(input.password, found.value.passwordHash)
  if (!ok) return Err({ kind: 'auth_invalid_credentials' })

  const token = randomBytes(32).toString('hex')
  const tokenHash = deps.sha256(token)
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS)
  const ins = await deps.sessionStore.insert({ adminId: found.value.id, tokenHash, expiresAt })
  if (!ins.ok) return ins
  await deps.adminStore.touchLastLogin(found.value.id)
  return Ok({ token, expiresAt })
}
