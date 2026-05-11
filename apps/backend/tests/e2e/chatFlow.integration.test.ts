import { describe, it, expect } from 'vitest'
import { randomUUID, createHash } from 'node:crypto'
import { usePostgres } from '../helpers/pgFixture'
import { createApp } from '../../src/infrastructure/http/createApp'
import { PgAdminStore } from '../../src/infrastructure/adapters/postgres/pgAdminStore'
import { PgAdminSessionStore } from '../../src/infrastructure/adapters/postgres/pgAdminSessionStore'
import { PgSiteConfigStore } from '../../src/infrastructure/adapters/postgres/pgSiteConfigStore'
import { PgSessionStore } from '../../src/infrastructure/adapters/postgres/pgSessionStore'
import { PgKnowledgeStore } from '../../src/infrastructure/adapters/postgres/pgKnowledgeStore'
import { PgvectorStore } from '../../src/infrastructure/adapters/postgres/pgvectorStore'
import { InProcessSseHub } from '../../src/infrastructure/sse/inProcessSseHub'
import { HandoffTimeoutScheduler } from '../../src/infrastructure/sse/handoffTimeoutScheduler'
import { encrypt, decrypt } from '../../src/infrastructure/crypto/encryption'
import { hashPassword, verifyPassword } from '../../src/infrastructure/crypto/passwordHash'
import { MemoryFileStore } from '../../src/infrastructure/adapters/memory/memoryFileStore'
import { MemoryEmbedder } from '../../src/infrastructure/adapters/memory/memoryEmbedder'
import { MemoryMysqlConnectionStore } from '../../src/infrastructure/adapters/memory/memoryMysqlConnectionStore'
import type { Container } from '../../src/composition/container'
import { noopMetrics } from '../../src/infrastructure/observability/metrics'
import pino from 'pino'
import { SessionId } from '@support/shared'

const ENC = 'a'.repeat(64)
const STREAM_SEC = 'b'.repeat(64)
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

describe('chat flow @integration', () => {
  const pg = usePostgres()
  it('end-to-end: onboarding → create session → send message → assistant reply persisted', async () => {
    await pg.pool.query('TRUNCATE admins, sessions, messages, site_config CASCADE')
    const stubLlm = {
      async *chatStream() {
        await Promise.resolve()
        yield { type: 'text' as const, delta: 'hi from AI' }
        yield { type: 'done' as const, usage: { promptTokens: 4, completionTokens: 5 }, costCents: 1 as never }
      },
    }
    const env = {
      NODE_ENV: 'development', PORT: 3001,
      ADMIN_ORIGIN: 'http://localhost:3000', PUBLIC_API_URL: 'http://localhost:3001',
      LLM4AGENTS_API_BASE: 'https://api.llm4agents.com',
      STORAGE_DRIVER: 'postgres', POSTGRES_URL: 'postgres://',
      FILE_STORE_PATH: './data/files',
      ENCRYPTION_KEY: ENC, STREAM_TOKEN_SECRET: STREAM_SEC, COOKIE_SECRET: 'c'.repeat(32),
      COOKIE_SECURE: false, LOG_LEVEL: 'silent', METRICS_ENABLED: false,
      MAX_BODY_BYTES: 64 * 1024, SSE_MAX_CONNECTIONS: 2_000, SSE_MAX_LIFETIME_MS: 4 * 60 * 60 * 1000,
    } as never
    const sessionStore = new PgSessionStore(pg.pool)
    const broadcast = new InProcessSseHub()
    const container: Container = {
      driver: 'postgres' as const,
      env,
      adminStore: new PgAdminStore(pg.pool),
      adminSessionStore: new PgAdminSessionStore(pg.pool),
      siteConfigStore: new PgSiteConfigStore(pg.pool),
      sessionStore,
      broadcast,
      llm: stubLlm,
      knowledgeStore: new PgKnowledgeStore(pg.pool),
      vectorStore: new PgvectorStore(pg.pool),
      fileStore: new MemoryFileStore(),
      embedder: new MemoryEmbedder(1536),
      mysqlConnectionStore: new MemoryMysqlConnectionStore(),
      // Instantiate but do NOT call .start() in tests
      handoffTimeoutScheduler: new HandoffTimeoutScheduler(sessionStore, broadcast, pino({ level: 'silent' })),
      logger: pino({ level: 'silent' }),
      sha256,
      encrypt: (s) => encrypt(s, ENC),
      // `encrypt`/`decrypt` are async (Web Crypto). Pass through directly —
      // the returned Promise satisfies Container's `(s) => Promise<string>`.
      decrypt: (s) => decrypt(s, ENC),
      hashPassword,
      verifyPassword,
      metrics: noopMetrics,
      healthChecks: { db: () => Promise.resolve(true), llm: () => Promise.resolve(true) },
      shutdown: () => Promise.resolve(),
    }
    const app = createApp(container)

    await container.adminStore.insertAdmin({ email: 'a@b.com', passwordHash: await hashPassword('correct horse battery') })
    const login = await app.request('/v1/admin/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@b.com', password: 'correct horse battery' }) })
    const sessionCookie = login.headers.get('Set-Cookie')?.split(';')[0] ?? ''

    // Get csrf cookie via GET to /v1/admin/onboarding/complete
    const csrfRes = await app.request('/v1/admin/onboarding/complete', { headers: { cookie: sessionCookie } })
    const csrfSet = csrfRes.headers.get('Set-Cookie') ?? ''
    const csrfMatch = /csrf=([0-9a-f]+)/.exec(csrfSet)
    const csrfToken = csrfMatch?.[1] ?? ''
    const cookies = `${sessionCookie}; csrf=${csrfToken}`

    const onb = await app.request('/v1/admin/onboarding/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: cookies, 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ siteName: 'Acme', primaryColor: '#000000', llm4agentsApiKey: 'sk-proxy-xxxxxxxxxx', agentModel: 'm', systemPrompt: 'help help help' }),
    })
    expect(onb.status).toBe(200)

    const visitorId = randomUUID()
    const sess = await app.request('/v1/widget/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Visitor-Id': visitorId }, body: '{}' })
    const { sessionId } = await sess.json() as { sessionId: string }
    const send = await app.request(`/v1/widget/sessions/${sessionId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Visitor-Id': visitorId }, body: JSON.stringify({ content: 'hello' }) })
    expect(send.status).toBe(200)

    const messages = await container.sessionStore.listMessages(SessionId(sessionId), { limit: 10 })
    expect(messages.ok).toBe(true)
    if (messages.ok) {
      expect(messages.value.length).toBe(2)
      expect(messages.value[1]?.content).toBe('hi from AI')
    }
  })
})
