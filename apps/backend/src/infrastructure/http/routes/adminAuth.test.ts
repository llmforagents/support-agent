import { describe, it, expect } from 'vitest'
import { buildTestApp } from '../../../../tests/helpers/testApp'
import { hashPassword } from '../../crypto/passwordHash'

describe('admin auth routes', () => {
  it('POST /v1/admin/auth/onboarding creates first admin', async () => {
    const { app, container } = buildTestApp()
    const res = await app.request('/v1/admin/auth/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', password: 'correct horse battery' }),
    })
    expect(res.status).toBe(200)
    const r = await container.adminStore.findByEmail('a@b.com')
    expect(r.ok && r.value !== null).toBe(true)
  })

  it('POST /v1/admin/auth/onboarding rejects when admin exists', async () => {
    const { app, container } = buildTestApp()
    await container.adminStore.insertAdmin({ email: 'first@x.com', passwordHash: await hashPassword('p') })
    const res = await app.request('/v1/admin/auth/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'second@x.com', password: 'correct horse battery' }),
    })
    expect(res.status).toBe(409)
  })

  it('GET /v1/admin/auth/status returns adminExists', async () => {
    const { app, container } = buildTestApp()
    let res = await app.request('/v1/admin/auth/status')
    expect(await res.json()).toEqual({ adminExists: false })
    await container.adminStore.insertAdmin({ email: 'a@b.com', passwordHash: 'h' })
    res = await app.request('/v1/admin/auth/status')
    expect(await res.json()).toEqual({ adminExists: true })
  })

  it('POST /v1/admin/auth/login sets session cookie', async () => {
    const { app, container } = buildTestApp()
    await container.adminStore.insertAdmin({ email: 'a@b.com', passwordHash: await hashPassword('correct horse battery') })
    const res = await app.request('/v1/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', password: 'correct horse battery' }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('Set-Cookie')).toMatch(/^session=[0-9a-f]{64};/)
  })

  it('GET /v1/admin/auth/me returns 401 without cookie', async () => {
    const { app } = buildTestApp()
    const res = await app.request('/v1/admin/auth/me')
    expect(res.status).toBe(401)
  })

  it('GET /v1/admin/auth/me returns admin with valid cookie', async () => {
    const { app, container } = buildTestApp()
    await container.adminStore.insertAdmin({ email: 'a@b.com', passwordHash: await hashPassword('correct horse battery') })
    const login = await app.request('/v1/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', password: 'correct horse battery' }),
    })
    const cookie = login.headers.get('Set-Cookie')?.split(';')[0] ?? ''
    const me = await app.request('/v1/admin/auth/me', { headers: { cookie } })
    expect(me.status).toBe(200)
    expect(await me.json()).toEqual({ email: 'a@b.com' })
  })
})
