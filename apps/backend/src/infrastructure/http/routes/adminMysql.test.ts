import { describe, it, expect } from 'vitest'
import { buildTestApp } from '../../../../tests/helpers/testApp'
import { hashPassword } from '../../crypto/passwordHash'

const CONNECTION_PAYLOAD = {
  name: 'prod-db',
  host: 'mysql.example.com',
  port: 3306,
  database: 'myapp',
  user: 'reader',
  password: 'secretpass',
  ssl: true,
}

async function loggedIn() {
  const { app, container } = buildTestApp()
  await container.adminStore.insertAdmin({ email: 'a@b.com', passwordHash: await hashPassword('correct horse battery') })

  // Login
  const login = await app.request('/v1/admin/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.com', password: 'correct horse battery' }),
  })
  const sessionCookie = login.headers.get('Set-Cookie')?.split(';')[0] ?? ''

  // GET mysql-connections to receive the csrf cookie
  const csrfRes = await app.request('/v1/admin/mysql-connections', { headers: { cookie: sessionCookie } })
  const csrfMatch = /csrf=([0-9a-f]+)/.exec(csrfRes.headers.get('Set-Cookie') ?? '')
  const csrfToken = csrfMatch?.[1] ?? ''
  return { app, container, cookie: `${sessionCookie}; csrf=${csrfToken}`, csrfToken }
}

describe('admin mysql-connections routes', () => {
  it('GET /v1/admin/mysql-connections returns empty list initially', async () => {
    const { app, cookie } = await loggedIn()
    const res = await app.request('/v1/admin/mysql-connections', { headers: { cookie } })
    expect(res.status).toBe(200)
    const body = await res.json() as { connections: unknown[] }
    expect(body.connections).toEqual([])
  })

  it('POST /v1/admin/mysql-connections creates connection and returns 201', async () => {
    const { app, cookie, csrfToken } = await loggedIn()
    const res = await app.request('/v1/admin/mysql-connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie, 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(CONNECTION_PAYLOAD),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as { id: string; name: string; host: string }
    expect(body.name).toBe('prod-db')
    expect(typeof body.id).toBe('string')
    expect(body.host).toBe('mysql.example.com')
    // password must not be in response
    expect((body as Record<string, unknown>)['password']).toBeUndefined()
  })

  it('GET /v1/admin/mysql-connections returns the seeded connection', async () => {
    const { app, cookie, csrfToken, container } = await loggedIn()
    // Seed directly via store
    const created = await container.mysqlConnectionStore.createConnection(CONNECTION_PAYLOAD)
    if (!created.ok) throw new Error('seed failed')

    const res = await app.request('/v1/admin/mysql-connections', { headers: { cookie } })
    expect(res.status).toBe(200)
    const body = await res.json() as { connections: { id: string; name: string }[] }
    expect(body.connections.length).toBe(1)
    expect(body.connections[0]?.name).toBe('prod-db')

    // Verify the POST + GET roundtrip by adding a second connection
    const postRes = await app.request('/v1/admin/mysql-connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie, 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ ...CONNECTION_PAYLOAD, name: 'staging-db' }),
    })
    expect(postRes.status).toBe(201)

    const list2 = await app.request('/v1/admin/mysql-connections', { headers: { cookie } })
    const body2 = await list2.json() as { connections: { name: string }[] }
    expect(body2.connections.length).toBe(2)
  })

  it('DELETE /v1/admin/mysql-connections/:id removes the connection', async () => {
    const { app, cookie, csrfToken, container } = await loggedIn()
    const created = await container.mysqlConnectionStore.createConnection(CONNECTION_PAYLOAD)
    if (!created.ok) throw new Error('seed failed')

    const res = await app.request(`/v1/admin/mysql-connections/${created.value.id}`, {
      method: 'DELETE',
      headers: { cookie, 'X-CSRF-Token': csrfToken },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)

    // Verify it is gone
    const list = await app.request('/v1/admin/mysql-connections', { headers: { cookie } })
    const listBody = await list.json() as { connections: unknown[] }
    expect(listBody.connections.length).toBe(0)
  })

  it('POST /:id/validate-query accepts valid SELECT', async () => {
    const { app, cookie, csrfToken, container } = await loggedIn()
    const created = await container.mysqlConnectionStore.createConnection(CONNECTION_PAYLOAD)
    if (!created.ok) throw new Error('seed failed')

    const res = await app.request(`/v1/admin/mysql-connections/${created.value.id}/validate-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie, 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ query: 'SELECT id, name FROM users WHERE active = 1' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; hasLimit: boolean; safeSql: string }
    expect(body.ok).toBe(true)
    expect(body.hasLimit).toBe(false)
    expect(body.safeSql).toContain('LIMIT 5000')
  })

  it('POST /:id/validate-query rejects INSERT', async () => {
    const { app, cookie, csrfToken, container } = await loggedIn()
    const created = await container.mysqlConnectionStore.createConnection(CONNECTION_PAYLOAD)
    if (!created.ok) throw new Error('seed failed')

    const res = await app.request(`/v1/admin/mysql-connections/${created.value.id}/validate-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie, 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ query: 'INSERT INTO users VALUES (1, "x")' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; reason: string }
    expect(body.ok).toBe(false)
    expect(body.reason).toBe('denied_keyword')
  })

  it('POST /:id/validate-query accepts SELECT with LIMIT (hasLimit=true)', async () => {
    const { app, cookie, csrfToken, container } = await loggedIn()
    const created = await container.mysqlConnectionStore.createConnection(CONNECTION_PAYLOAD)
    if (!created.ok) throw new Error('seed failed')

    const res = await app.request(`/v1/admin/mysql-connections/${created.value.id}/validate-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie, 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ query: 'SELECT * FROM products LIMIT 100' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; hasLimit: boolean }
    expect(body.ok).toBe(true)
    expect(body.hasLimit).toBe(true)
  })

  it('POST /v1/admin/mysql-connections rejects empty name', async () => {
    const { app, cookie, csrfToken } = await loggedIn()
    const res = await app.request('/v1/admin/mysql-connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie, 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ name: '', host: 'x', port: 3306, database: 'db', user: 'u', password: 'p', ssl: false }),
    })
    // name min(1) fails — Zod throws, Hono returns 500 or 400
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('rejects unauthenticated request', async () => {
    const { app } = buildTestApp()
    const res = await app.request('/v1/admin/mysql-connections')
    expect(res.status).toBe(401)
  })
})
