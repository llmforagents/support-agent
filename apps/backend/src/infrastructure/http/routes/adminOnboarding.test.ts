import { describe, it, expect } from 'vitest'
import { buildTestApp } from '../../../../tests/helpers/testApp'
import { hashPassword } from '../../crypto/passwordHash'

async function loggedIn() {
  const { app, container } = buildTestApp()
  await container.adminStore.insertAdmin({ email: 'a@b.com', passwordHash: await hashPassword('correct horse battery') })
  const login = await app.request('/v1/admin/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.com', password: 'correct horse battery' }),
  })
  const sessionCookie = login.headers.get('Set-Cookie')?.split(';')[0] ?? ''
  // GET to an admin/onboarding route to receive the csrf cookie via Set-Cookie
  const csrfRes = await app.request('/v1/admin/onboarding/complete', { headers: { cookie: sessionCookie } })
  const csrfSetCookie = csrfRes.headers.get('Set-Cookie') ?? ''
  const csrfMatch = /csrf=([0-9a-f]+)/.exec(csrfSetCookie)
  const csrfToken = csrfMatch?.[1] ?? ''
  const allCookies = `${sessionCookie}; csrf=${csrfToken}`
  return { app, container, cookie: allCookies, csrfToken }
}

describe('admin onboarding routes', () => {
  it('POST /v1/admin/onboarding/complete saves config + returns siteKey + embedSnippet', async () => {
    const { app, cookie, csrfToken } = await loggedIn()
    const res = await app.request('/v1/admin/onboarding/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie, 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({
        siteName: 'Acme', primaryColor: '#4f46e5',
        llm4agentsApiKey: 'sk-proxy-abcdefghij',
        agentModel: 'anthropic/claude-sonnet-4',
        systemPrompt: 'You help customers.',
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { siteKey: string; embedSnippet: string }
    expect(body.siteKey).toMatch(/^[A-Za-z0-9_-]{20}$/)
    expect(body.embedSnippet).toContain(`data-site-key="${body.siteKey}"`)
  })

  it('GET /v1/admin/config returns config without encrypted key', async () => {
    const { app, cookie, csrfToken } = await loggedIn()
    await app.request('/v1/admin/onboarding/complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie, 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ siteName: 'A', primaryColor: '#000000', llm4agentsApiKey: 'sk-proxy-abcdefghij', agentModel: 'm', systemPrompt: 'p p p p p p' }),
    })
    const res = await app.request('/v1/admin/config', { headers: { cookie } })
    expect(res.status).toBe(200)
    const body = await res.json() as { siteName: string; primaryColor: string; llm4agentsApiKeyEncrypted?: undefined }
    expect(body.siteName).toBe('A')
    expect((body as Record<string, unknown>)['llm4agentsApiKeyEncrypted']).toBeUndefined()
  })

  it('rejects without cookie', async () => {
    const { app } = buildTestApp()
    const res = await app.request('/v1/admin/onboarding/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect([401, 403]).toContain(res.status)
  })
})
