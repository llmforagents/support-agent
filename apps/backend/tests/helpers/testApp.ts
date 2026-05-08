import type { Hono } from 'hono'
import pino from 'pino'
import { createApp } from '../../src/infrastructure/http/createApp'
import type { Container } from '../../src/composition/composeContainer'

const silentLogger = pino({ level: 'silent' })

export function buildTestApp(): { app: Hono; container: Container } {
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
  } as never  // P1: stub; full env shape evolves as we add fields

  const container: Container = {
    env,
    adminStore: null as never,
    adminSessionStore: null as never,
    siteConfigStore: null as never,
    sessionStore: null as never,
    broadcast: null as never,
    llm: null as never,
    logger: silentLogger,
    sha256: (s: string) => s,
    encrypt: (s: string) => s,
    decrypt: (s: string) => s,
    healthChecks: {
      db: () => Promise.resolve(true),
      llm: () => Promise.resolve(true),
    },
    shutdown: () => Promise.resolve(),
  }
  return { app: createApp(container), container }
}
