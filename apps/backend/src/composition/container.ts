import type { Env } from '@support/shared'
import type {
  AdminStorePort, AdminSessionStorePort, SiteConfigStorePort, SessionStorePort,
  BroadcastPort, LlmPort, KnowledgeStorePort, VectorStorePort, FileStorePort, EmbedderPort,
  MysqlConnectionStorePort,
} from '../application/ports'
import type { HandoffTimeoutSchedulerHandle } from '../infrastructure/sse/handoffTimeoutScheduler'
import type { Logger } from '../infrastructure/observability/logger'
import type { MetricsPort } from '../infrastructure/observability/metrics'

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
  // Async because the implementation uses the Web Crypto SubtleCrypto API
  // (`crypto.subtle.encrypt`/`decrypt`), which is the portable surface that
  // works on both Node 20+ and Cloudflare Workers. Sync Node `createCipheriv`
  // isn't exposed by the workerd build bundled with vitest-pool-workers 0.5.41.
  encrypt: (plaintext: string) => Promise<string>
  decrypt: (envelope: string) => Promise<string>
  hashPassword: (plaintext: string) => Promise<string>
  verifyPassword: (plaintext: string, hash: string) => Promise<boolean>
  logger: Logger
  // Required. Both compositions wire a real adapter (PromClientMetrics on
  // Postgres, AnalyticsEngineMetrics on Cloudflare) or `noopMetrics` when
  // the CF Analytics Engine binding is absent. Tests should use
  // `RecordingMetrics` from `tests/helpers/recordingMetrics.ts` or
  // `noopMetrics` from the port module.
  metrics: MetricsPort
  healthChecks: Readonly<{ db: () => Promise<boolean>; llm: () => Promise<boolean> }>
  shutdown: () => Promise<void>
}>
