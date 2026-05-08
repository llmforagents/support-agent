import { describe, it, expect } from 'vitest'
import { usePostgres } from '../../../../tests/helpers/pgFixture'
import { PgAdminStore } from './pgAdminStore'
import { PgAdminSessionStore } from './pgAdminSessionStore'

describe('PgAdminSessionStore @integration', () => {
  const pg = usePostgres()
  it('insert + find + delete + deleteExpired', async () => {
    await pg.pool.query('TRUNCATE admins CASCADE')
    const admins = new PgAdminStore(pg.pool)
    const sessions = new PgAdminSessionStore(pg.pool)
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
