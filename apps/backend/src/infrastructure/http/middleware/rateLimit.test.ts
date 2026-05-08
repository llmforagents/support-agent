import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { rateLimit } from './rateLimit'

describe('rateLimit', () => {
  it('allows below limit, blocks above', async () => {
    const app = new Hono()
    app.use('*', rateLimit({ windowMs: 60_000, max: 2, key: () => 'k' }))
    app.get('/', (c) => c.json({ ok: true }))
    const r1 = await app.request('/'); expect(r1.status).toBe(200)
    const r2 = await app.request('/'); expect(r2.status).toBe(200)
    const r3 = await app.request('/'); expect(r3.status).toBe(429)
    expect(r3.headers.get('Retry-After')).toMatch(/^\d+$/)
  })
  it('isolates by key', async () => {
    const app = new Hono()
    app.use('*', rateLimit({ windowMs: 60_000, max: 1, key: (c) => c.req.header('x-tag') ?? '' }))
    app.get('/', (c) => c.json({ ok: true }))
    expect((await app.request('/', { headers: { 'x-tag': 'a' } })).status).toBe(200)
    expect((await app.request('/', { headers: { 'x-tag': 'a' } })).status).toBe(429)
    expect((await app.request('/', { headers: { 'x-tag': 'b' } })).status).toBe(200)
  })
})
