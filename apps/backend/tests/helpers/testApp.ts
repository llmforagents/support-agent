import { createHash } from 'node:crypto'
import type { Hono } from 'hono'
import pino from 'pino'
import { createApp } from '../../src/infrastructure/http/createApp'
import type { Container } from '../../src/composition/container'
import { MemoryAdminStore } from '../../src/infrastructure/adapters/memory/memoryAdminStore'
import { MemoryAdminSessionStore } from '../../src/infrastructure/adapters/memory/memoryAdminSessionStore'
import { MemorySiteConfigStore } from '../../src/infrastructure/adapters/memory/memorySiteConfigStore'
import { MemorySessionStore } from '../../src/infrastructure/adapters/memory/memorySessionStore'
import { MemoryKnowledgeStore } from '../../src/infrastructure/adapters/memory/memoryKnowledgeStore'
import { MemoryVectorStore } from '../../src/infrastructure/adapters/memory/memoryVectorStore'
import { MemoryFileStore } from '../../src/infrastructure/adapters/memory/memoryFileStore'
import { MemoryEmbedder } from '../../src/infrastructure/adapters/memory/memoryEmbedder'
import { MemoryMysqlConnectionStore } from '../../src/infrastructure/adapters/memory/memoryMysqlConnectionStore'
import { HandoffTimeoutScheduler } from '../../src/infrastructure/sse/handoffTimeoutScheduler'
import { InProcessSseHub } from '../../src/infrastructure/sse/inProcessSseHub'
// Use bcryptjs (pure JS) for the test helper so the same helper works in
// both the Node pool (test:ci) and the Workers pool (test:cf). bcryptjs and
// the native bcrypt module emit interchangeable `$2b$` hash strings, so
// tests that pre-insert a hash with `hashPassword` and then login through
// the route (which verifies with `c.verifyPassword`) stay correct.
import {
  hashPasswordCloudflare as hashPassword,
  verifyPasswordCloudflare as verifyPassword,
} from '../../src/infrastructure/adapters/cloudflare/cloudflarePasswordHash'

const silentLogger = pino({ level: 'silent' })
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export type BuildTestAppOptions = Readonly<{
  /** Override the container's `driver` field. Defaults to `'postgres'`. */
  driver?: 'postgres' | 'cloudflare'
  /** Override the password hasher (cf tests use bcryptjs since native bcrypt
   * cannot load `node:os` inside the Workers isolate). */
  hashPassword?: (plain: string) => Promise<string>
  verifyPassword?: (plain: string, hash: string) => Promise<boolean>
}>

export function buildTestApp(opts: BuildTestAppOptions = {}): { app: Hono; container: Container } {
  const adminStore = new MemoryAdminStore()
  const adminSessionStore = new MemoryAdminSessionStore()
  const siteConfigStore = new MemorySiteConfigStore()
  const sessionStore = new MemorySessionStore()
  const broadcast = new InProcessSseHub()
  const knowledgeStore = new MemoryKnowledgeStore()
  const vectorStore = new MemoryVectorStore(knowledgeStore)
  const fileStore = new MemoryFileStore()
  const embedder = new MemoryEmbedder(1536)
  // Instantiate but do NOT call .start() — tests drive ticks manually or use fake timers
  const handoffTimeoutScheduler = new HandoffTimeoutScheduler(sessionStore, broadcast, silentLogger)

  const env = {
    NODE_ENV: 'development', PORT: 3001,
    PUBLIC_API_URL: 'http://localhost:3001', ADMIN_ORIGIN: 'http://localhost:3000',
    LLM4AGENTS_API_BASE: 'https://api.llm4agents.com',
    STORAGE_DRIVER: 'postgres', POSTGRES_URL: 'postgres://u:p@localhost:5432/db',
    FILE_STORE_PATH: './data/files',
    ENCRYPTION_KEY: 'a'.repeat(64), STREAM_TOKEN_SECRET: 'c'.repeat(64), COOKIE_SECRET: 'b'.repeat(32),
    COOKIE_SECURE: false, LOG_LEVEL: 'silent', METRICS_ENABLED: false,
    MAX_BODY_BYTES: 64 * 1024, SSE_MAX_CONNECTIONS: 2_000, SSE_MAX_LIFETIME_MS: 4 * 60 * 60 * 1000,
  } as never

  const container: Container = {
    driver: opts.driver ?? 'postgres',
    env, adminStore, adminSessionStore, siteConfigStore, broadcast,
    sessionStore, llm: null as never, logger: silentLogger, sha256,
    knowledgeStore, vectorStore, fileStore, embedder,
    mysqlConnectionStore: new MemoryMysqlConnectionStore(),
    handoffTimeoutScheduler,
    encrypt: (s) => Promise.resolve(`enc::${s}`),
    decrypt: (s) => Promise.resolve(s.startsWith('enc::') ? s.slice(5) : s),
    hashPassword: opts.hashPassword ?? hashPassword,
    verifyPassword: opts.verifyPassword ?? verifyPassword,
    healthChecks: { db: () => Promise.resolve(true), llm: () => Promise.resolve(true) },
    shutdown: () => Promise.resolve(),
  }
  return { app: createApp(container), container }
}
