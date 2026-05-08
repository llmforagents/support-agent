import { Ok, type Result, type AppError } from '@support/shared'
import type { AdminSessionStorePort } from '../ports'

export type LogoutDeps = Readonly<{ sessionStore: AdminSessionStorePort; sha256: (s: string) => string }>

export async function logout(deps: LogoutDeps, token: string): Promise<Result<void, AppError>> {
  await deps.sessionStore.delete(deps.sha256(token))
  return Ok(undefined)
}
