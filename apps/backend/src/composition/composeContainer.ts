import { createHash } from 'node:crypto'
import type { Env } from '@support/shared'
import type {
  AdminStorePort, AdminSessionStorePort, SiteConfigStorePort, SessionStorePort,
  BroadcastPort, LlmPort, KnowledgeStorePort, VectorStorePort, FileStorePort, EmbedderPort,
  MysqlConnectionStorePort,
} from '../application/ports'
import { createPool, pingPool } from '../infrastructure/adapters/postgres/pool'
import { runMigrations } from '../infrastructure/adapters/postgres/runMigrations'
import { PgAdminStore } from '../infrastructure/adapters/postgres/pgAdminStore'
import { PgAdminSessionStore } from '../infrastructure/adapters/postgres/pgAdminSessionStore'
import { PgSiteConfigStore } from '../infrastructure/adapters/postgres/pgSiteConfigStore'
import { PgSessionStore } from '../infrastructure/adapters/postgres/pgSessionStore'
import { PgKnowledgeStore } from '../infrastructure/adapters/postgres/pgKnowledgeStore'
import { PgvectorStore } from '../infrastructure/adapters/postgres/pgvectorStore'
import { LocalFileStore } from '../infrastructure/adapters/filesystem/localFileStore'
import { Llm4AgentsEmbedderAdapter } from '../infrastructure/adapters/llm4agents/embedderAdapter'
import { InProcessSseHub } from '../infrastructure/sse/inProcessSseHub'
import { HandoffTimeoutScheduler } from '../infrastructure/sse/handoffTimeoutScheduler'
import { Llm4AgentsLlmAdapter } from '../infrastructure/adapters/llm4agents/llmAdapter'
import { PgMysqlConnectionStore } from '../infrastructure/adapters/postgres/pgMysqlConnectionStore'
import { encrypt as rawEncrypt, decrypt as rawDecrypt } from '../infrastructure/crypto/encryption'
import { createLogger, type Logger } from '../infrastructure/observability/logger'

export type Container = Readonly<{
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
  handoffTimeoutScheduler: HandoffTimeoutScheduler
  sha256: (s: string) => string
  encrypt: (plaintext: string) => string
  decrypt: (envelope: string) => string
  logger: Logger
  healthChecks: Readonly<{ db: () => Promise<boolean>; llm: () => Promise<boolean> }>
  shutdown: () => Promise<void>
}>

async function pingLlm(apiBase: string): Promise<boolean> {
  try {
    const r = await fetch(`${apiBase}/healthz`, { signal: AbortSignal.timeout(3_000) })
    return r.ok
  } catch { return false }
}

export async function composeContainer(env: Env): Promise<Container> {
  if (env.STORAGE_DRIVER !== 'postgres') {
    throw new Error(`STORAGE_DRIVER=${env.STORAGE_DRIVER} not supported in P1 — postgres only`)
  }
  if (!env.POSTGRES_URL) throw new Error('POSTGRES_URL required for postgres driver')

  const logger = createLogger(env)
  const pool = createPool(env.POSTGRES_URL)
  await runMigrations(pool, logger)

  const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
  const encrypt = (plaintext: string) => rawEncrypt(plaintext, env.ENCRYPTION_KEY)
  const decrypt = (envelope: string) => rawDecrypt(envelope, env.ENCRYPTION_KEY)

  const sessionStore = new PgSessionStore(pool)
  const broadcast = new InProcessSseHub(logger)
  const handoffTimeoutScheduler = new HandoffTimeoutScheduler(sessionStore, broadcast, logger)
  handoffTimeoutScheduler.start()

  return {
    env,
    adminStore: new PgAdminStore(pool),
    adminSessionStore: new PgAdminSessionStore(pool),
    siteConfigStore: new PgSiteConfigStore(pool),
    sessionStore,
    broadcast,
    llm: new Llm4AgentsLlmAdapter(undefined, env.LLM4AGENTS_API_BASE),
    knowledgeStore: new PgKnowledgeStore(pool),
    vectorStore: new PgvectorStore(pool),
    fileStore: new LocalFileStore(env.FILE_STORE_PATH),
    embedder: new Llm4AgentsEmbedderAdapter('openai/text-embedding-3-small', 1536, env.LLM4AGENTS_API_BASE),
    mysqlConnectionStore: new PgMysqlConnectionStore(pool, encrypt, decrypt),
    handoffTimeoutScheduler,
    sha256,
    encrypt,
    decrypt,
    logger,
    healthChecks: {
      db: () => pingPool(pool),
      llm: () => pingLlm(env.LLM4AGENTS_API_BASE),
    },
    shutdown: async () => {
      handoffTimeoutScheduler.stop()
      await pool.end()
    },
  }
}
