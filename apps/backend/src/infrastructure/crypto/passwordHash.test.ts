import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from './passwordHash'

describe('passwordHash', () => {
  it('hashes and verifies correct password', async () => {
    const h = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('correct horse battery staple', h)).toBe(true)
  })
  it('rejects wrong password', async () => {
    const h = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('Tr0ub4dor&3', h)).toBe(false)
  })
  it('produces different hashes for same input (random salt)', async () => {
    expect(await hashPassword('x')).not.toBe(await hashPassword('x'))
  })
})
