import type { Env } from '@support/shared'
import type {
  AdminStorePort, AdminSessionStorePort, SiteConfigStorePort, SessionStorePort,
  BroadcastPort, LlmPort, KnowledgeStorePort, VectorStorePort, FileStorePort, EmbedderPort,
  MysqlConnectionStorePort,
} from '../application/ports'
import type { HandoffTimeoutSchedulerHandle } from '../infrastructure/sse/handoffTimeoutScheduler'
import type { Logger } from '../infrastructure/observability/logger'

export type Container = Readonly<{
  driver: 'postgres' | 'cloudflare'
  env: Env
  adminStore: AdminStorePort
  adminSessionStore: AdminSessionStorePort
  siteConfigStore: SiteConfigStorePort
  sessionStore: SessionStorePort
  broadcast: BroadcastPort
  llm: LlmPort
  knowledgeStore: KnowledgeStorePort
  vectorStore: VectorStorePort
  fileStore: FileStorePort
  embedder: EmbedderPort
  mysqlConnectionStore: MysqlConnectionStorePort
  handoffTimeoutScheduler: HandoffTimeoutSchedulerHandle
  sha256: (s: string) => string
  encrypt: (plaintext: string) => string
  decrypt: (envelope: string) => string
  hashPassword: (plaintext: string) => Promise<string>
  verifyPassword: (plaintext: string, hash: string) => Promise<boolean>
  logger: Logger
  healthChecks: Readonly<{ db: () => Promise<boolean>; llm: () => Promise<boolean> }>
  shutdown: () => Promise<void>
}>
