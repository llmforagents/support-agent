import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { requestId } from './requestId'

describe('requestId middleware', () => {
  it('attaches a ulid to context and to X-Request-Id response header', async () => {
    const app = new Hono()
    app.use('*', requestId())
    app.get('/', (c) => c.json({ id: c.get('requestId') as string }))
    const res = await app.request('/')
    expect(res.status).toBe(200)
    const header = res.headers.get('X-Request-Id')
    expect(header).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    const body = (await res.json()) as { id: string }
    expect(body.id).toBe(header)
  })

  it('honors inbound X-Request-Id when valid ulid', async () => {
    const app = new Hono()
    app.use('*', requestId())
    app.get('/', (c) => c.json({ id: c.get('requestId') as string }))
    const res = await app.request('/', { headers: { 'X-Request-Id': '01ARZ3NDEKTSV4RRFFQ69G5FAV' } })
    expect(res.headers.get('X-Request-Id')).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV')
  })
})
