import type { Env } from '@support/shared'
import type { Logger } from '../infrastructure/observability/logger'
import type {
  AdminStorePort, AdminSessionStorePort, SiteConfigStorePort, SessionStorePort,
  BroadcastPort, LlmPort,
} from '../application/ports'

export type Container = Readonly<{
  env: Env
  adminStore: AdminStorePort
  adminSessionStore: AdminSessionStorePort
  siteConfigStore: SiteConfigStorePort
  sessionStore: SessionStorePort
  broadcast: BroadcastPort
  llm: LlmPort
  logger: Logger
  sha256: (s: string) => string
  encrypt: (plaintext: string) => string
  decrypt: (envelope: string) => string
  healthChecks: Readonly<{ db: () => Promise<boolean>; llm: () => Promise<boolean> }>
  shutdown: () => Promise<void>
}>

export function composeContainer(_env: Env): Promise<Container> {
  return Promise.reject(new Error('composeContainer not yet implemented — wired in Task 35'))
}
