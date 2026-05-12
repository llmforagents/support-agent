import { Err, type Result, type AppError, type AdminId } from '@support/shared'
import type { AdminStorePort } from '../ports'

export type ChangePasswordDeps = Readonly<{
  adminStore: AdminStorePort
  hashPassword: (raw: string) => Promise<string>
  verifyPassword: (raw: string, hash: string) => Promise<boolean>
}>

export async function changePassword(
  deps: ChangePasswordDeps,
  input: { adminId: AdminId; currentPassword: string; newPassword: string },
): Promise<Result<void, AppError>> {
  const adminRes = await deps.adminStore.findById(input.adminId)
  if (!adminRes.ok) return adminRes
  if (!adminRes.value) return Err({ kind: 'auth_invalid_credentials' })

  const valid = await deps.verifyPassword(input.currentPassword, adminRes.value.passwordHash)
  if (!valid) return Err({ kind: 'auth_invalid_credentials' })

  const newHash = await deps.hashPassword(input.newPassword)
  return deps.adminStore.updatePasswordHash(input.adminId, newHash)
}
