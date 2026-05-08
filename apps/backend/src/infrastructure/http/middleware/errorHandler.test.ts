import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import type { AppError } from '@support/shared'
import { errorHandler, AppHttpError } from './errorHandler'

describe('errorHandler', () => {
  function build(error: AppError) {
    const app = new Hono()
    app.use('*', errorHandler())
    app.get('/', () => { throw new AppHttpError(error) })
    return app
  }

  it('maps auth_invalid_credentials to 401', async () => {
    const app = build({ kind: 'auth_invalid_credentials' })
    const res = await app.request('/')
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string; kind: string }
    expect(body).toEqual({ error: 'invalid_credentials', kind: 'auth_invalid_credentials' })
  })

  it('maps session_already_claimed to 409 with detail', async () => {
    const app = build({ kind: 'session_already_claimed', operatorId: '550e8400-e29b-41d4-a716-446655440000' as never })
    const res = await app.request('/')
    expect(res.status).toBe(409)
    const body = await res.json() as { error: string; detail: { operatorId: string } }
    expect(body.detail.operatorId).toBe('550e8400-e29b-41d4-a716-446655440000')
  })

  it('maps llm_insufficient_balance to 402', async () => {
    const app = build({ kind: 'llm_insufficient_balance' })
    const res = await app.request('/')
    expect(res.status).toBe(402)
  })

  it('maps unknown thrown error to 500', async () => {
    const app = new Hono()
    app.use('*', errorHandler())
    app.get('/', () => { throw new Error('boom') })
    const res = await app.request('/')
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('internal_error')
  })
})
