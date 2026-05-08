import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { MemoryAdminStore } from '../../infrastructure/adapters/memory/memoryAdminStore'
import { MemoryAdminSessionStore } from '../../infrastructure/adapters/memory/memoryAdminSessionStore'
import { hashPassword, verifyPassword } from '../../infrastructure/crypto/passwordHash'
import { login } from './login'
import { verifySession } from './verifySession'
import { logout } from './logout'

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

async function setup() {
  const adminStore = new MemoryAdminStore()
  const sessionStore = new MemoryAdminSessionStore()
  await adminStore.insertAdmin({ email: 'a@b.com', passwordHash: await hashPassword('correct horse battery') })
  return { adminStore, sessionStore, deps: { adminStore, sessionStore, verifyPassword, sha256 } }
}

describe('login', () => {
  it('accepts correct credentials and returns plaintext token', async () => {
    const { deps } = await setup()
    const r = await login(deps, { email: 'a@b.com', password: 'correct horse battery' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.token).toMatch(/^[0-9a-f]{64}$/)
      expect(r.value.expiresAt.getTime()).toBeGreaterThan(Date.now())
    }
  })
  it('rejects wrong password', async () => {
    const { deps } = await setup()
    const r = await login(deps, { email: 'a@b.com', password: 'wrong' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('auth_invalid_credentials')
  })
  it('rejects unknown email', async () => {
    const { deps } = await setup()
    const r = await login(deps, { email: 'nobody@x.com', password: 'x' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('auth_invalid_credentials')
  })
})

describe('verifySession', () => {
  it('valid token returns admin row', async () => {
    const { deps } = await setup()
    const r = await login(deps, { email: 'a@b.com', password: 'correct horse battery' })
    if (!r.ok) throw new Error('login failed')
    const v = await verifySession(deps, r.value.token)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.value.email).toBe('a@b.com')
  })
  it('unknown token → auth_no_session', async () => {
    const { deps } = await setup()
    const v = await verifySession(deps, '0'.repeat(64))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.error.kind).toBe('auth_no_session')
  })
})

describe('logout', () => {
  it('revokes the session', async () => {
    const { deps } = await setup()
    const r = await login(deps, { email: 'a@b.com', password: 'correct horse battery' })
    if (!r.ok) throw new Error('login failed')
    await logout(deps, r.value.token)
    const v = await verifySession(deps, r.value.token)
    expect(v.ok).toBe(false)
  })
})
