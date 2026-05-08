import { describe, it, expect } from 'vitest'
import { buildTestApp } from './helpers/testApp'

describe('createApp', () => {
  it('GET /healthz → 200 ok', async () => {
    const { app } = await buildTestApp()
    const res = await app.request('/healthz')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('GET /readyz → 200 with sub-check booleans', async () => {
    const { app } = await buildTestApp()
    const res = await app.request('/readyz')
    expect(res.status).toBe(200)
    const body = await res.json() as { db: boolean; llm: boolean }
    expect(body.db).toBe(true)
  })

  it('attaches X-Request-Id', async () => {
    const { app } = await buildTestApp()
    const res = await app.request('/healthz')
    expect(res.headers.get('X-Request-Id')).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })
})
