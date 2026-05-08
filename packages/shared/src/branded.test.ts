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
    it('accepts sk-proxy- prefix', () => {
      expect(ApiKey('sk-proxy-abc123def456')).toBe('sk-proxy-abc123def456')
    })
    it('rejects without prefix', () => {
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
