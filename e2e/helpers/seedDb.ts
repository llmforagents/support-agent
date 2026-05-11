// Programmatic seed for the E2E suite. Hits the live backend (Postgres
// deploy) over HTTP to bootstrap an admin and complete onboarding so each
// spec starts from a known state. Idempotent: the helper treats "already
// exists" responses (409 / 200 on subsequent runs) as success.
//
// We avoid touching the database directly — going through the public API
// surface keeps the seed honest about the same code paths the admin uses.
import { request, type APIRequestContext } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const BACKEND_URL: string = process.env['BACKEND_URL'] ?? 'http://localhost:3001'

export type SeedFixture = Readonly<{
  admin: Readonly<{ email: string; password: string }>
  onboarding: Readonly<{
    siteName: string
    primaryColor: string
    llm4agentsApiKey: string
    agentModel: string
    systemPrompt: string
  }>
}>

export type SeedResult = Readonly<{
  ctx: APIRequestContext
  siteKey: string
  embedSnippet: string
}>

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = join(HERE, '..', 'fixtures', 'seed.json')

let cachedFixture: SeedFixture | null = null

export async function loadFixture(): Promise<SeedFixture> {
  if (cachedFixture !== null) return cachedFixture
  const raw = await readFile(FIXTURE_PATH, 'utf8')
  // The fixture is committed alongside the helper and validated by hand —
  // we don't pull Zod into the e2e workspace just for this single read.
  const parsed = JSON.parse(raw) as SeedFixture
  cachedFixture = parsed
  return parsed
}

/**
 * Synchronous accessor for the default committed fixture, useful for specs
 * that need the email/password in a `test()` body without awaiting. The
 * shape mirrors `e2e/fixtures/seed.json` and must stay in sync with it.
 */
export const DEFAULT_FIXTURE: SeedFixture = {
  admin: { email: 'admin@e2e.test', password: 'e2e-test-pw-1234' },
  onboarding: {
    siteName: 'E2E Acme',
    primaryColor: '#0066ff',
    llm4agentsApiKey: 'sk-proxy-e2e-test-0000000000',
    agentModel: 'gpt-4o-mini',
    systemPrompt: 'Sos un agente de soporte amable y conciso. Respondé en castellano.',
  },
} as const

function findCookie(setCookieHeaders: readonly string[], name: string): string | null {
  for (const header of setCookieHeaders) {
    const parts = header.split(';')[0]
    if (parts === undefined) continue
    const [k, ...rest] = parts.split('=')
    if (k?.trim() === name) return rest.join('=').trim()
  }
  return null
}

async function getCsrfToken(ctx: APIRequestContext): Promise<string> {
  // Any request under a CSRF-mounted prefix seeds the cookie. We hit a
  // GET on /v1/admin/onboarding/anything — the route doesn't exist (Hono
  // returns 404) but the CSRF middleware fires first and sets the cookie.
  const res = await ctx.get('/v1/admin/onboarding/csrf-seed', { failOnStatusCode: false })
  const headers = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value)
  const token = findCookie(headers, 'csrf')
  if (token === null) {
    // If we already seeded earlier the cookie persists on the context — try
    // reading it from storage state as a fallback.
    const state = await ctx.storageState()
    const stored = state.cookies.find((c) => c.name === 'csrf')
    if (stored !== undefined) return stored.value
    throw new Error('failed to seed csrf cookie')
  }
  return token
}

/**
 * Idempotent seed. Bootstraps the first admin (no-op if one already exists),
 * logs in, and completes onboarding (no-op if already done). Returns the
 * authenticated request context plus the resulting siteKey + embedSnippet.
 */
export async function seedAdminAndOnboarding(
  fixture?: SeedFixture,
): Promise<SeedResult> {
  const f = fixture ?? (await loadFixture())
  const ctx = await request.newContext({ baseURL: BACKEND_URL })

  // Step 1: bootstrap admin. 200 on first call, 409 on subsequent.
  const status = await ctx.get('/v1/admin/auth/status')
  if (!status.ok()) throw new Error(`/auth/status failed: ${status.status()}`)
  const statusBody = (await status.json()) as { adminExists: boolean }
  if (!statusBody.adminExists) {
    const bootstrapRes = await ctx.post('/v1/admin/auth/onboarding', {
      data: { email: f.admin.email, password: f.admin.password },
    })
    if (!bootstrapRes.ok()) {
      throw new Error(`bootstrap failed: ${bootstrapRes.status()} ${await bootstrapRes.text()}`)
    }
  }

  // Step 2: log in to obtain the session cookie on the context.
  const loginRes = await ctx.post('/v1/admin/auth/login', {
    data: { email: f.admin.email, password: f.admin.password },
  })
  if (!loginRes.ok()) {
    throw new Error(`login failed: ${loginRes.status()} ${await loginRes.text()}`)
  }

  // Step 3: seed the CSRF cookie, then complete onboarding.
  const csrf = await getCsrfToken(ctx)
  const onboardingRes = await ctx.post('/v1/admin/onboarding/complete', {
    data: {
      siteName: f.onboarding.siteName,
      primaryColor: f.onboarding.primaryColor,
      llm4agentsApiKey: f.onboarding.llm4agentsApiKey,
      agentModel: f.onboarding.agentModel,
      systemPrompt: f.onboarding.systemPrompt,
    },
    headers: { 'x-csrf-token': csrf },
  })
  if (!onboardingRes.ok()) {
    throw new Error(`onboarding failed: ${onboardingRes.status()} ${await onboardingRes.text()}`)
  }
  const body = (await onboardingRes.json()) as { siteKey: string; embedSnippet: string }
  return { ctx, siteKey: body.siteKey, embedSnippet: body.embedSnippet }
}

/**
 * Placeholder. There's intentionally no /test/reset endpoint on the backend
 * (would be a footgun in prod). For a fresh slate between suites, restart
 * Postgres: `docker compose down -v && docker compose up postgres -d`. See
 * e2e/README.md.
 */
export function resetDb(): never {
  throw new Error(
    'resetDb is not supported by the backend. Restart Postgres between suites: ' +
      '`cd docker && docker compose down -v && docker compose up postgres -d`',
  )
}
