import { describe, it, expect } from 'vitest'
import { createFirstAdmin } from './createFirstAdmin'
import { MemoryAdminStore } from '../../infrastructure/adapters/memory/memoryAdminStore'
import { hashPassword, verifyPassword } from '../../infrastructure/crypto/passwordHash'

describe('createFirstAdmin', () => {
  it('creates admin when table empty', async () => {
    const store = new MemoryAdminStore()
    const r = await createFirstAdmin(
      { adminStore: store, hashPassword },
      { email: 'a@b.com', password: 'correct horse battery' },
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.email).toBe('a@b.com')
  })

  it('rejects when an admin already exists', async () => {
    const store = new MemoryAdminStore()
    await store.insertAdmin({ email: 'first@x.com', passwordHash: 'h' })
    const r = await createFirstAdmin(
      { adminStore: store, hashPassword },
      { email: 'second@x.com', password: 'correct horse battery' },
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('auth_already_onboarded')
  })

  it('hashes password', async () => {
    const store = new MemoryAdminStore()
    await createFirstAdmin(
      { adminStore: store, hashPassword },
      { email: 'a@b.com', password: 'correct horse battery' },
    )
    const found = await store.findByEmail('a@b.com')
    if (found.ok && found.value) {
      expect(await verifyPassword('correct horse battery', found.value.passwordHash)).toBe(true)
    } else {
      throw new Error('admin not found')
    }
  })
})
