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
  return { app, container, cookie: sessionCookie }
}

describe('admin stream routes', () => {
  it('rejects without cookie', async () => {
    const { app } = buildTestApp()
    const res = await app.request('/v1/admin/stream')
    expect(res.status).toBe(401)
  })

  it('GET /v1/admin/stream returns 200 text/event-stream when authenticated', async () => {
    const { app, cookie } = await loggedIn()
    const controller = new AbortController()
    const res = await app.request('/v1/admin/stream', {
      headers: { cookie },
      signal: controller.signal,
    })
    // Abort immediately after checking headers so the test doesn't hang
    controller.abort()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
  })
})
