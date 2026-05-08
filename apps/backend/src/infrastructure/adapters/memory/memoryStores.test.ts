import { describe, it, expect } from 'vitest'
import { MemoryAdminStore } from './memoryAdminStore'
import { MemoryAdminSessionStore } from './memoryAdminSessionStore'

describe('MemoryAdminStore', () => {
  it('counts and inserts and finds case-insensitive', async () => {
    const s = new MemoryAdminStore()
    const c1 = await s.countAdmins()
    expect(c1.ok && c1.value === 0).toBe(true)
    await s.insertAdmin({ email: 'A@b.com', passwordHash: 'h' })
    const f = await s.findByEmail('a@B.com')
    expect(f.ok && f.value !== null).toBe(true)
  })

  it('insertFirstAdmin returns null when not empty', async () => {
    const s = new MemoryAdminStore()
    await s.insertAdmin({ email: 'first@x.com', passwordHash: 'h' })
    const r = await s.insertFirstAdmin({ email: 'second@x.com', passwordHash: 'h' })
    expect(r.ok && r.value === null).toBe(true)
  })
})

describe('MemoryAdminSessionStore', () => {
  it('insert + find + delete', async () => {
    const s = new MemoryAdminSessionStore()
    const exp = new Date(Date.now() + 60_000)
    await s.insert({ adminId: '550e8400-e29b-41d4-a716-446655440000' as never, tokenHash: 'h1', expiresAt: exp })
    const found = await s.findByTokenHash('h1')
    expect(found.ok && found.value !== null).toBe(true)
    await s.delete('h1')
    const gone = await s.findByTokenHash('h1')
    expect(gone.ok && gone.value === null).toBe(true)
  })
  it('deleteExpired removes only expired', async () => {
    const s = new MemoryAdminSessionStore()
    await s.insert({ adminId: 'x' as never, tokenHash: 'a', expiresAt: new Date(Date.now() - 1) })
    await s.insert({ adminId: 'x' as never, tokenHash: 'b', expiresAt: new Date(Date.now() + 60_000) })
    const r = await s.deleteExpired()
    expect(r.ok && r.value === 1).toBe(true)
  })
})
