// G5 — the JSON branch of `POST /v1/admin/sources` (mysql_query) is not
// supported when running on the Cloudflare driver because there's no
// outbound MySQL connection from Workers. The route must short-circuit
// with a 422 before hitting the Zod schema / knowledgeStore.
//
// We exercise the guard with `buildTestApp({ driver: 'cloudflare' })` —
// the route-mounting code reads `c.driver`, so the in-memory adapters
// are fine for asserting the response status/body. Wiring a full
// SELF.fetch path through miniflare here would require duplicating every
// env var the worker's loadEnv expects; for a single conditional the
// driver-only override is more targeted.
import { describe, it, expect } from 'vitest'
import { buildTestApp } from '../helpers/testApp'
// Use the bcryptjs-backed hasher because the cf vitest pool runs inside a
// Workers isolate and cannot load the native `bcrypt` addon.
import { hashPasswordCloudflare as hashPassword } from '../../src/infrastructure/adapters/cloudflare/cloudflarePasswordHash'

async function loggedIn() {
  const { app, container } = buildTestApp({ driver: 'cloudflare' })
  await container.adminStore.insertAdmin({
    email: 'a@b.com',
    passwordHash: await hashPassword('correct horse battery'),
  })
  const login = await app.request('/v1/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.com', password: 'correct horse battery' }),
  })
  const sessionCookie = login.headers.get('Set-Cookie')?.split(';')[0] ?? ''
  const csrfRes = await app.request('/v1/admin/sources', { headers: { cookie: sessionCookie } })
  const csrfMatch = /csrf=([0-9a-f]+)/.exec(csrfRes.headers.get('Set-Cookie') ?? '')
  const csrfToken = csrfMatch?.[1] ?? ''
  return { app, cookie: `${sessionCookie}; csrf=${csrfToken}`, csrfToken }
}

describe('admin sources rejects mysql_query on cloudflare driver @integration', () => {
  it('POST /v1/admin/sources with sourceType=mysql_query returns 422 mysql_unsupported_on_driver', async () => {
    const { app, cookie, csrfToken } = await loggedIn()
    const res = await app.request('/v1/admin/sources', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie,
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({
        name: 'my mysql',
        sourceType: 'mysql_query',
        connectionId: 'c1',
        query: 'SELECT 1',
        rowTemplate: 'x',
      }),
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error?: string; detail?: string }
    expect(body.error).toBe('mysql_unsupported_on_driver')
  })

  it('POST /v1/admin/sources with multipart file still works on cloudflare driver', async () => {
    const { app, cookie, csrfToken } = await loggedIn()
    const fd = new FormData()
    fd.append('name', 'doc')
    fd.append('type', 'txt')
    fd.append('file', new Blob(['hello'], { type: 'text/plain' }), 'd.txt')
    const res = await app.request('/v1/admin/sources', {
      method: 'POST',
      headers: { cookie, 'X-CSRF-Token': csrfToken },
      body: fd,
    })
    // The file branch must NOT be gated by the cloudflare guard.
    expect(res.status).toBe(201)
  })
})
