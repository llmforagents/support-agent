import { describe, it, expect } from 'vitest'
import {
  SessionId, AdminId, MessageId, SourceId, ChunkId, VisitorId,
  ApiKey, UsdCents,
} from './branded'

describe('branded types', () => {
  describe('SessionId', () => {
    it('accepts valid uuid v4', () => {
      const id = SessionId('550e8400-e29b-41d4-a716-446655440000')
      expect(typeof id).toBe('string')
    })
    it('rejects empty string', () => {
      expect(() => SessionId('')).toThrow(/Invalid SessionId/)
    })
    it('rejects non-uuid', () => {
      expect(() => SessionId('not-a-uuid')).toThrow(/Invalid SessionId/)
    })
  })

  describe('ApiKey', () => {
    it('accepts a 64-char hex token (typical llm4agents agent key)', () => {
      const key = '63a4b3d1c54cfeac5c865a035675aaf72f96794e5688520ec5a8ec5dbde7bb62'
      expect(ApiKey(key)).toBe(key)
    })
    it('accepts a legacy sk-proxy-* token (back-compat)', () => {
      expect(ApiKey('sk-proxy-abc123def456')).toBe('sk-proxy-abc123def456')
    })
    it('rejects short strings (<20 chars)', () => {
      expect(() => ApiKey('abc123')).toThrow(/Invalid ApiKey/)
    })
    it('rejects empty', () => {
      expect(() => ApiKey('')).toThrow(/Invalid ApiKey/)
    })
  })

  describe('UsdCents', () => {
    it('accepts integer ≥0', () => {
      expect(UsdCents(0)).toBe(0)
      expect(UsdCents(1234)).toBe(1234)
    })
    it('rejects negative', () => {
      expect(() => UsdCents(-1)).toThrow(/Invalid UsdCents/)
    })
    it('rejects non-integer', () => {
      expect(() => UsdCents(1.5)).toThrow(/Invalid UsdCents/)
    })
  })

  it('AdminId, MessageId, SourceId, ChunkId, VisitorId all validate uuid', () => {
    const valid = '550e8400-e29b-41d4-a716-446655440000'
    expect(AdminId(valid)).toBe(valid)
    expect(MessageId(valid)).toBe(valid)
    expect(SourceId(valid)).toBe(valid)
    expect(ChunkId(valid)).toBe(valid)
    expect(VisitorId(valid)).toBe(valid)
    expect(() => AdminId('x')).toThrow()
  })
})
