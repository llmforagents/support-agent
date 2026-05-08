import { createHash } from 'node:crypto'
import type { Hono } from 'hono'
import pino from 'pino'
import { createApp } from '../../src/infrastructure/http/createApp'
import type { Container } from '../../src/composition/composeContainer'
import { MemoryAdminStore } from '../../src/infrastructure/adapters/memory/memoryAdminStore'
import { MemoryAdminSessionStore } from '../../src/infrastructure/adapters/memory/memoryAdminSessionStore'

const silentLogger = pino({ level: 'silent' })
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export function buildTestApp(): { app: Hono; container: Container } {
  const adminStore = new MemoryAdminStore()
  const adminSessionStore = new MemoryAdminSessionStore()

  const env = {
    NODE_ENV: 'development',
    PORT: 3001,
    PUBLIC_API_URL: 'http://localhost:3001',
    ADMIN_ORIGIN: 'http://localhost:3000',
    LLM4AGENTS_API_BASE: 'https://api.llm4agents.com',
    STORAGE_DRIVER: 'postgres',
    POSTGRES_URL: 'postgres://u:p@localhost:5432/db',
    FILE_STORE_PATH: './data/files',
    ENCRYPTION_KEY: 'a'.repeat(64),
    STREAM_TOKEN_SECRET: 'c'.repeat(64),
    COOKIE_SECRET: 'b'.repeat(32),
    COOKIE_SECURE: false,
    LOG_LEVEL: 'silent',
    METRICS_ENABLED: false,
    MAX_BODY_BYTES: 64 * 1024,
    SSE_MAX_CONNECTIONS: 2_000,
    SSE_MAX_LIFETIME_MS: 4 * 60 * 60 * 1000,
  } as never

  const container: Container = {
    env,
    adminStore,
    adminSessionStore,
    siteConfigStore: null as never,
    sessionStore: null as never,
    broadcast: null as never,
    llm: null as never,
    logger: silentLogger,
    sha256,
    encrypt: (s) => s,
    decrypt: (s) => s,
    healthChecks: { db: () => Promise.resolve(true), llm: () => Promise.resolve(true) },
    shutdown: () => Promise.resolve(),
  }
  return { app: createApp(container), container }
}
