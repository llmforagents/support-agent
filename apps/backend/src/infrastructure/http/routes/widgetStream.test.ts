import { describe, it, expect } from 'vitest'
import { buildTestApp } from '../../../../tests/helpers/testApp'
import { signStreamToken } from '../../crypto/streamToken'

const VISITOR_ID = '550e8400-e29b-41d4-a716-446655440000'

describe('widget stream', () => {
  it('rejects missing token', async () => {
    const { app } = buildTestApp()
    const res = await app.request(`/v1/widget/sessions/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa/stream`, {
      headers: { 'X-Visitor-Id': VISITOR_ID },
    })
    expect(res.status).toBe(401)
  })

  it('rejects bad signature', async () => {
    const { app } = buildTestApp()
    const res = await app.request(`/v1/widget/sessions/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa/stream?token=1.bad`, {
      headers: { 'X-Visitor-Id': VISITOR_ID },
    })
    expect(res.status).toBe(401)
  })

  it('returns 200 + text/event-stream with valid token, emits connected event', async () => {
    const { app, container } = buildTestApp()
    const create = await app.request('/v1/widget/sessions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Visitor-Id': VISITOR_ID }, body: '{}',
    })
    const { sessionId } = await create.json() as { sessionId: string }
    const token = signStreamToken({ sessionId, visitorId: VISITOR_ID }, container.env.STREAM_TOKEN_SECRET)
    const res = await app.request(`/v1/widget/sessions/${sessionId}/stream?token=${token}`, {
      headers: { 'X-Visitor-Id': VISITOR_ID },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/^text\/event-stream/)
    if (!res.body) throw new Error('no body')
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    const chunk = await reader.read()
    const text = dec.decode(chunk.value)
    expect(text).toContain('"type":"connected"')
    await reader.cancel()
  })
})
