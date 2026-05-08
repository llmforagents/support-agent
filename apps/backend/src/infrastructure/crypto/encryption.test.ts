import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from './encryption'

const KEY = 'a'.repeat(64)

describe('encryption', () => {
  it('round-trips plaintext', () => {
    const ct = encrypt('hello world', KEY)
    expect(ct).not.toContain('hello')
    expect(decrypt(ct, KEY)).toBe('hello world')
  })
  it('produces different ciphertext for same plaintext (random iv)', () => {
    expect(encrypt('x', KEY)).not.toBe(encrypt('x', KEY))
  })
  it('throws on tampered ciphertext', () => {
    const ct = encrypt('secret', KEY)
    const tampered = ct.replace(/\.[0-9a-f]{2}/, '.00')
    expect(() => decrypt(tampered, KEY)).toThrow()
  })
  it('throws on bad key length', () => {
    expect(() => encrypt('x', 'short')).toThrow(/key/)
  })
})
