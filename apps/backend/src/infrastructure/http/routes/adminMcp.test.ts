import { describe, it, expect } from 'vitest'
import { buildTestApp } from '../../../../tests/helpers/testApp'
import { hashPassword } from '../../crypto/passwordHash'

async function loggedIn() {
  const { app, container } = buildTestApp()
  await container.adminStore.insertAdmin({
    email: 'a@b.com', passwordHash: await hashPassword('correct horse battery'),
  })
  // Seed site config so setMcpEnabled has a row to UPDATE.
  await container.siteConfigStore.upsertOnboarding({
    siteKey: 'X', siteName: 'A', primaryColor: '#000',
    llm4agentsApiKeyEncrypted: 'enc::sk-proxy-x', agentModel: 'm', embeddingModel: 'e', embeddingDim: 1536,
    systemPrompt: 'p', mcpEnabled: false,
    handoffPolicy: { autoOnLowConfidence: false, autoOnFrustrationKeywords: [], timeoutBeforeRevertMs: 90000, toolEnabled: false },
    adminOnline: false, onboardingStep: 9, onboardingCompleted: true,
  })
  // Login to get a session cookie.
  const login = await app.request('/v1/admin/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.com', password: 'correct horse battery' }),
  })
  const sessionCookie = login.headers.get('Set-Cookie')?.split(';')[0] ?? ''
  // GET a CSRF-protected admin route with the session cookie to receive the csrf cookie.
  const csrfRes = await app.request('/v1/admin/sources', { headers: { cookie: sessionCookie } })
  const csrfMatch = /csrf=([0-9a-f]+)/.exec(csrfRes.headers.get('Set-Cookie') ?? '')
  const csrfToken = csrfMatch?.[1] ?? ''
  return { app, container, cookie: `${sessionCookie}; csrf=${csrfToken}`, csrfToken }
}

describe('PUT /v1/admin/mcp', () => {
  it('rejects unauthenticated (CSRF fires first → 403; auth returns 401 with valid CSRF)', async () => {
    const { app } = buildTestApp()
    // GET a CSRF-protected admin route first to receive the csrf cookie.
    const getRes = await app.request('/v1/admin/sources')
    const csrfMatch = /csrf=([0-9a-f]+)/.exec(getRes.headers.get('Set-Cookie') ?? '')
    const csrfToken = csrfMatch?.[1] ?? ''
    // PUT with valid CSRF pair but no session cookie → 401 from requireAdmin.
    const r = await app.request('/v1/admin/mcp', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: `csrf=${csrfToken}`,
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({ enabled: true }),
    })
    expect(r.status).toBe(401)
  })

  it('toggles mcp_enabled and persists', async () => {
    const { app, container, cookie, csrfToken } = await loggedIn()
    const r = await app.request('/v1/admin/mcp', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json', cookie, 'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({ enabled: true }),
    })
    expect(r.status).toBe(200)
    const body = await r.json() as { mcpEnabled: boolean }
    expect(body.mcpEnabled).toBe(true)
    // Round-trip via the store directly (the read endpoint is /v1/admin/config).
    const persisted = await container.siteConfigStore.get()
    expect(persisted.ok && persisted.value?.mcpEnabled).toBe(true)

    // And flipping back to false works too.
    const r2 = await app.request('/v1/admin/mcp', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json', cookie, 'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({ enabled: false }),
    })
    expect(r2.status).toBe(200)
    const body2 = await r2.json() as { mcpEnabled: boolean }
    expect(body2.mcpEnabled).toBe(false)
  })

  it('rejects non-boolean enabled', async () => {
    const { app, cookie, csrfToken } = await loggedIn()
    const r = await app.request('/v1/admin/mcp', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json', cookie, 'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({ enabled: 'yes' }),
    })
    expect(r.status).toBe(400)
    const body = await r.json() as { error: string }
    expect(body.error).toBe('invalid_body')
  })
})
