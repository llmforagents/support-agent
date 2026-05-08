import { describe, it, expect, vi } from 'vitest'
import { signStreamToken, verifyStreamToken } from './streamToken'

const SECRET = 's'.repeat(64)
const NOW = 1735689600_000

describe('streamToken', () => {
  it('signs and verifies', () => {
    vi.setSystemTime(NOW)
    const token = signStreamToken({ sessionId: 'sess1', visitorId: 'vis1' }, SECRET)
    const ok = verifyStreamToken(token, { sessionId: 'sess1', visitorId: 'vis1' }, SECRET)
    expect(ok.ok).toBe(true)
  })
  it('rejects wrong sessionId', () => {
    vi.setSystemTime(NOW)
    const token = signStreamToken({ sessionId: 'sess1', visitorId: 'vis1' }, SECRET)
    const ok = verifyStreamToken(token, { sessionId: 'sess2', visitorId: 'vis1' }, SECRET)
    expect(ok.ok).toBe(false)
  })
  it('rejects token signed with a different secret', () => {
    vi.setSystemTime(NOW)
    const token = signStreamToken({ sessionId: 'sess1', visitorId: 'vis1' }, SECRET)
    const ok = verifyStreamToken(token, { sessionId: 'sess1', visitorId: 'vis1' }, 'd'.repeat(64))
    expect(ok.ok).toBe(false)
  })
  it('rejects expired token', () => {
    vi.setSystemTime(NOW)
    const token = signStreamToken({ sessionId: 'sess1', visitorId: 'vis1' }, SECRET)
    vi.setSystemTime(NOW + 3 * 60 * 60 * 1000)
    const ok = verifyStreamToken(token, { sessionId: 'sess1', visitorId: 'vis1' }, SECRET)
    expect(ok.ok).toBe(false)
    if (!ok.ok) expect(ok.error).toBe('expired')
  })
  it('rejects tampered token', () => {
    const token = signStreamToken({ sessionId: 'sess1', visitorId: 'vis1' }, SECRET) + 'x'
    const ok = verifyStreamToken(token, { sessionId: 'sess1', visitorId: 'vis1' }, SECRET)
    expect(ok.ok).toBe(false)
  })
})
