import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from './encryption'

const KEY = 'a'.repeat(64)

describe('encryption', () => {
  it('round-trips plaintext', async () => {
    const ct = await encrypt('hello world', KEY)
    expect(ct).not.toContain('hello')
    expect(await decrypt(ct, KEY)).toBe('hello world')
  })
  it('produces different ciphertext for same plaintext (random iv)', async () => {
    expect(await encrypt('x', KEY)).not.toBe(await encrypt('x', KEY))
  })
  it('throws on tampered ciphertext', async () => {
    const ct = await encrypt('secret', KEY)
    const tampered = ct.replace(/\.[0-9a-f]{2}/, '.00')
    await expect(decrypt(tampered, KEY)).rejects.toThrow()
  })
  it('throws on bad key length', async () => {
    await expect(encrypt('x', 'short')).rejects.toThrow(/key/)
  })
})
