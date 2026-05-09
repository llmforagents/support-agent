import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { VisitorId } from '@support/shared'
import { buildTestApp } from '../../../../tests/helpers/testApp'
import { hashPassword } from '../../crypto/passwordHash'

async function loggedIn() {
  const { app, container } = buildTestApp()
  await container.adminStore.insertAdmin({ email: 'op@test.com', passwordHash: await hashPassword('correct horse battery') })
  const login = await app.request('/v1/admin/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'op@test.com', password: 'correct horse battery' }),
  })
  const sessionCookie = login.headers.get('Set-Cookie')?.split(';')[0] ?? ''
  const csrfRes = await app.request('/v1/admin/sources', { headers: { cookie: sessionCookie } })
  const csrfMatch = /csrf=([0-9a-f]+)/.exec(csrfRes.headers.get('Set-Cookie') ?? '')
  const csrfToken = csrfMatch?.[1] ?? ''
  return { app, container, cookie: `${sessionCookie}; csrf=${csrfToken}`, csrfToken }
}

async function seedHandoffSession(container: ReturnType<typeof buildTestApp>['container']) {
  const s = await container.sessionStore.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
  if (!s.ok) throw new Error('seed failed')
  await container.sessionStore.updateState(s.value.id, {
    status: 'handoff_requested',
    reason: { kind: 'visitor_intent', phrase: 'I want a human' },
    requestedAt: new Date(),
  })
  return s.value.id
}

describe('operator routes', () => {
  it('POST /:id/claim returns 200 and session becomes active_operator', async () => {
    const { app, container, cookie, csrfToken } = await loggedIn()
    const sessionId = await seedHandoffSession(container)

    const res = await app.request(`/v1/admin/sessions/${sessionId}/claim`, {
      method: 'POST',
      headers: { cookie, 'X-CSRF-Token': csrfToken },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)

    const reload = await container.sessionStore.getSession(sessionId)
    expect(reload.ok && reload.value.state.status).toBe('active_operator')
  })

  it('POST /:id/messages persists operator message', async () => {
    const { app, container, cookie, csrfToken } = await loggedIn()
    const sessionId = await seedHandoffSession(container)

    await app.request(`/v1/admin/sessions/${sessionId}/claim`, {
      method: 'POST',
      headers: { cookie, 'X-CSRF-Token': csrfToken },
    })

    const res = await app.request(`/v1/admin/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie, 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ content: 'Hello from operator' }),
    })
    expect(res.status).toBe(200)

    const msgs = await container.sessionStore.listMessages(sessionId, { limit: 10 })
    if (msgs.ok) {
      const opMsg = msgs.value.find((m) => m.role === 'operator')
      expect(opMsg?.content).toBe('Hello from operator')
    }
  })

  it('POST /:id/release transitions to released_to_ai', async () => {
    const { app, container, cookie, csrfToken } = await loggedIn()
    const sessionId = await seedHandoffSession(container)

    await app.request(`/v1/admin/sessions/${sessionId}/claim`, {
      method: 'POST',
      headers: { cookie, 'X-CSRF-Token': csrfToken },
    })

    const res = await app.request(`/v1/admin/sessions/${sessionId}/release`, {
      method: 'POST',
      headers: { cookie, 'X-CSRF-Token': csrfToken },
    })
    expect(res.status).toBe(200)

    const reload = await container.sessionStore.getSession(sessionId)
    expect(reload.ok && reload.value.state.status).toBe('released_to_ai')
  })

  it('POST /:id/close transitions to closed', async () => {
    const { app, container, cookie, csrfToken } = await loggedIn()
    const s = await container.sessionStore.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    if (!s.ok) throw new Error('seed failed')

    const res = await app.request(`/v1/admin/sessions/${s.value.id}/close`, {
      method: 'POST',
      headers: { cookie, 'X-CSRF-Token': csrfToken },
    })
    expect(res.status).toBe(200)

    const reload = await container.sessionStore.getSession(s.value.id)
    expect(reload.ok && reload.value.state.status).toBe('closed')
  })

  it('wrong operator sending message gets 409', async () => {
    const { app, container, cookie: cookie1, csrfToken: csrf1 } = await loggedIn()
    const sessionId = await seedHandoffSession(container)

    await app.request(`/v1/admin/sessions/${sessionId}/claim`, {
      method: 'POST',
      headers: { cookie: cookie1, 'X-CSRF-Token': csrf1 },
    })

    await container.adminStore.insertAdmin({ email: 'op2@test.com', passwordHash: await hashPassword('correct horse battery') })
    const login2 = await app.request('/v1/admin/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'op2@test.com', password: 'correct horse battery' }),
    })
    const cookie2raw = login2.headers.get('Set-Cookie')?.split(';')[0] ?? ''
    const csrfRes2 = await app.request('/v1/admin/sources', { headers: { cookie: cookie2raw } })
    const csrfMatch2 = /csrf=([0-9a-f]+)/.exec(csrfRes2.headers.get('Set-Cookie') ?? '')
    const csrfToken2 = csrfMatch2?.[1] ?? ''
    const cookie2 = `${cookie2raw}; csrf=${csrfToken2}`

    const res = await app.request(`/v1/admin/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: cookie2, 'X-CSRF-Token': csrfToken2 },
      body: JSON.stringify({ content: 'impostor message' }),
    })
    expect(res.status).toBe(409)
  })

  it('requests without auth cookie return 4xx (CSRF fires first on POST → 403; auth returns 401 with valid CSRF)', async () => {
    // CSRF middleware fires before auth — a POST without a CSRF token returns 403.
    // With a valid CSRF pair but no session cookie, auth returns 401.
    const { app, container } = buildTestApp()
    const s = await container.sessionStore.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    if (!s.ok) throw new Error('seed failed')

    // First GET to receive the csrf cookie from the server
    const getRes = await app.request('/v1/admin/sources')
    const csrfCookie = /csrf=([0-9a-f]+)/.exec(getRes.headers.get('Set-Cookie') ?? '')
    const csrfToken = csrfCookie?.[1] ?? ''

    // POST with CSRF token but no session cookie → 401 from requireAdmin
    const res = await app.request(`/v1/admin/sessions/${s.value.id}/claim`, {
      method: 'POST',
      headers: { cookie: `csrf=${csrfToken}`, 'X-CSRF-Token': csrfToken },
    })
    expect(res.status).toBe(401)
  })
})
