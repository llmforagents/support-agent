import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { VisitorId, UsdCents } from '@support/shared'
import { buildTestApp } from '../../../../tests/helpers/testApp'
import { hashPassword } from '../../crypto/passwordHash'

async function loggedIn() {
  const { app, container } = buildTestApp()
  await container.adminStore.insertAdmin({ email: 'inbox@test.com', passwordHash: await hashPassword('correct horse battery') })
  const login = await app.request('/v1/admin/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'inbox@test.com', password: 'correct horse battery' }),
  })
  const sessionCookie = login.headers.get('Set-Cookie')?.split(';')[0] ?? ''
  return { app, container, cookie: sessionCookie }
}

describe('admin inbox routes', () => {
  it('GET /v1/admin/sessions returns list of all sessions', async () => {
    const { app, container, cookie } = await loggedIn()
    await container.sessionStore.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    await container.sessionStore.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })

    const res = await app.request('/v1/admin/sessions', { headers: { cookie } })
    expect(res.status).toBe(200)
    const body = await res.json() as { sessions: unknown[] }
    expect(body.sessions.length).toBe(2)
  })

  it('GET /v1/admin/sessions?status=handoff_requested returns only matching sessions', async () => {
    const { app, container, cookie } = await loggedIn()
    const s1 = await container.sessionStore.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    const s2 = await container.sessionStore.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    if (!s1.ok || !s2.ok) throw new Error('seed failed')

    await container.sessionStore.updateState(s1.value.id, {
      status: 'handoff_requested',
      reason: { kind: 'visitor_intent', phrase: 'help' },
      requestedAt: new Date(),
    })

    const res = await app.request('/v1/admin/sessions?status=handoff_requested', { headers: { cookie } })
    expect(res.status).toBe(200)
    const body = await res.json() as { sessions: Array<{ id: string }> }
    expect(body.sessions.length).toBe(1)
    expect(body.sessions[0]?.id).toBe(s1.value.id)
  })

  it('GET /v1/admin/sessions/:id returns the session', async () => {
    const { app, container, cookie } = await loggedIn()
    const s = await container.sessionStore.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    if (!s.ok) throw new Error('seed failed')

    const res = await app.request(`/v1/admin/sessions/${s.value.id}`, { headers: { cookie } })
    expect(res.status).toBe(200)
    const body = await res.json() as { id: string }
    expect(body.id).toBe(s.value.id)
  })

  it('GET /v1/admin/sessions/:id returns 404 for unknown id', async () => {
    const { app, cookie } = await loggedIn()
    const res = await app.request(`/v1/admin/sessions/${randomUUID()}`, { headers: { cookie } })
    expect(res.status).toBe(404)
  })

  it('GET /v1/admin/sessions/:id/messages returns messages', async () => {
    const { app, container, cookie } = await loggedIn()
    const s = await container.sessionStore.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    if (!s.ok) throw new Error('seed failed')
    await container.sessionStore.appendMessage({ sessionId: s.value.id, role: 'visitor', content: 'hello', costCents: UsdCents(0) })
    await container.sessionStore.appendMessage({ sessionId: s.value.id, role: 'assistant', content: 'hi there', costCents: UsdCents(1) })

    const res = await app.request(`/v1/admin/sessions/${s.value.id}/messages`, { headers: { cookie } })
    expect(res.status).toBe(200)
    const body = await res.json() as { messages: Array<{ role: string; content: string }> }
    expect(body.messages.length).toBe(2)
    expect(body.messages[0]?.role).toBe('visitor')
  })

  it('GET /v1/admin/sessions/:id/messages paginates with afterId', async () => {
    const { app, container, cookie } = await loggedIn()
    const s = await container.sessionStore.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    if (!s.ok) throw new Error('seed failed')
    const m1 = await container.sessionStore.appendMessage({ sessionId: s.value.id, role: 'visitor', content: 'msg1', costCents: UsdCents(0) })
    await container.sessionStore.appendMessage({ sessionId: s.value.id, role: 'visitor', content: 'msg2', costCents: UsdCents(0) })
    if (!m1.ok) throw new Error('m1 failed')

    const res = await app.request(`/v1/admin/sessions/${s.value.id}/messages?afterId=${m1.value.id}`, { headers: { cookie } })
    expect(res.status).toBe(200)
    const body = await res.json() as { messages: Array<{ content: string }> }
    expect(body.messages.length).toBe(1)
    expect(body.messages[0]?.content).toBe('msg2')
  })

  it('ignores unknown status filter (returns all)', async () => {
    const { app, container, cookie } = await loggedIn()
    await container.sessionStore.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    const res = await app.request('/v1/admin/sessions?status=bogus_status', { headers: { cookie } })
    expect(res.status).toBe(200)
    const body = await res.json() as { sessions: unknown[] }
    expect(body.sessions.length).toBe(1)
  })
})
