import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { runD1Migrations } from '../../src/infrastructure/adapters/cloudflare/d1Migrations'
import { D1AdminStore } from '../../src/infrastructure/adapters/cloudflare/d1AdminStore'
import { D1AdminSessionStore } from '../../src/infrastructure/adapters/cloudflare/d1AdminSessionStore'

describe('D1AdminSessionStore @integration', () => {
  beforeEach(async () => {
    await runD1Migrations(env.DB)
    // ON DELETE CASCADE on admin_sessions(admin_id) sweeps sessions too.
    await env.DB.prepare('DELETE FROM admins').run()
  })

  it('insert + find + delete + deleteExpired', async () => {
    const admins = new D1AdminStore(env.DB)
    const sessions = new D1AdminSessionStore(env.DB)
    const ins = await admins.insertAdmin({ email: 's@x.com', passwordHash: 'h' })
    if (!ins.ok) throw new Error('admin insert failed')

    const fut = new Date(Date.now() + 60_000)
    const past = new Date(Date.now() - 1_000)
    await sessions.insert({ adminId: ins.value.id, tokenHash: 'live', expiresAt: fut })
    await sessions.insert({ adminId: ins.value.id, tokenHash: 'old', expiresAt: past })

    const found = await sessions.findByTokenHash('live')
    expect(found.ok && found.value !== null).toBe(true)

    const reaped = await sessions.deleteExpired()
    expect(reaped.ok && reaped.value === 1).toBe(true)

    await sessions.delete('live')
    const gone = await sessions.findByTokenHash('live')
    expect(gone.ok && gone.value === null).toBe(true)
  })
})
