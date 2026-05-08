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

  it('maps pdf_encrypted to 422', async () => {
    const res = await build({ kind: 'pdf_encrypted' }).request('/')
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: string; kind: string }
    expect(body.error).toBe('pdf_encrypted')
    expect(body.kind).toBe('pdf_encrypted')
  })

  it('maps pdf_parse_failed to 422', async () => {
    const res = await build({ kind: 'pdf_parse_failed', reason: 'corrupt header' }).request('/')
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('pdf_parse_failed')
  })

  it('maps embedding_provider_failed to 502', async () => {
    const res = await build({ kind: 'embedding_provider_failed', cause: 'timeout' }).request('/')
    expect(res.status).toBe(502)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('embedder_unavailable')
  })

  it('maps chunk_too_large to 422 with detail', async () => {
    const res = await build({ kind: 'chunk_too_large', chunkIndex: 3, tokens: 9000 }).request('/')
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string; detail: { chunkIndex: number; tokens: number } }
    expect(body.error).toBe('chunk_too_large')
    expect(body.detail.chunkIndex).toBe(3)
    expect(body.detail.tokens).toBe(9000)
  })

  it('maps unsupported_file_type to 415 with detail', async () => {
    const res = await build({ kind: 'unsupported_file_type', mime: 'image/png' }).request('/')
    expect(res.status).toBe(415)
    const body = await res.json() as { error: string; detail: { mime: string } }
    expect(body.error).toBe('unsupported_file_type')
    expect(body.detail.mime).toBe('image/png')
  })

  it('maps file_read_failed to 500', async () => {
    const res = await build({ kind: 'file_read_failed', cause: 'ENOENT' }).request('/')
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('file_read_failed')
  })

  it('maps source_not_found to 404', async () => {
    const res = await build({ kind: 'source_not_found' }).request('/')
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('source_not_found')
  })

  it('maps source_invalid_state to 409 with detail', async () => {
    const res = await build({ kind: 'source_invalid_state', current: 'ingesting', required: ['idle', 'paused'] }).request('/')
    expect(res.status).toBe(409)
    const body = await res.json() as { error: string; detail: { current: string; required: readonly string[] } }
    expect(body.error).toBe('source_invalid_state')
    expect(body.detail.current).toBe('ingesting')
    expect(body.detail.required).toEqual(['idle', 'paused'])
  })
})
