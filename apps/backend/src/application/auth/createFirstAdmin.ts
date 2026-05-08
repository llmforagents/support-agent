import { Ok, Err, type Result, type AppError } from '@support/shared'
import type { AdminRow, AdminStorePort } from '../ports'

export type CreateFirstAdminDeps = Readonly<{
  adminStore: AdminStorePort
  hashPassword: (plaintext: string) => Promise<string>
}>

export async function createFirstAdmin(
  deps: CreateFirstAdminDeps,
  input: { email: string; password: string },
): Promise<Result<AdminRow, AppError>> {
  const passwordHash = await deps.hashPassword(input.password)
  const r = await deps.adminStore.insertFirstAdmin({ email: input.email, passwordHash })
  if (!r.ok) return r
  if (r.value === null) return Err({ kind: 'auth_already_onboarded' })
  return Ok(r.value)
}
