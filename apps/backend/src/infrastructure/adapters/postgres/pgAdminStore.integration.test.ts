import { describe, it, expect } from 'vitest'
import { usePostgres } from '../../../../tests/helpers/pgFixture'
import { PgAdminStore } from './pgAdminStore'

describe('PgAdminStore @integration', () => {
  const pg = usePostgres()

  it('countAdmins on empty db = 0', async () => {
    const store = new PgAdminStore(pg.pool)
    await pg.pool.query('TRUNCATE admins CASCADE')
    const r = await store.countAdmins()
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe(0)
  })

  it('insertAdmin then findByEmail returns row', async () => {
    const store = new PgAdminStore(pg.pool)
    await pg.pool.query('TRUNCATE admins CASCADE')
    const ins = await store.insertAdmin({ email: 'a@b.com', passwordHash: 'h' })
    expect(ins.ok).toBe(true)
    const found = await store.findByEmail('A@B.COM')
    expect(found.ok).toBe(true)
    if (found.ok && found.value) expect(found.value.email).toBe('a@b.com')
  })

  it('insertAdmin uniqueness on email', async () => {
    const store = new PgAdminStore(pg.pool)
    await pg.pool.query('TRUNCATE admins CASCADE')
    await store.insertAdmin({ email: 'a@b.com', passwordHash: 'h' })
    const dup = await store.insertAdmin({ email: 'a@b.com', passwordHash: 'h2' })
    expect(dup.ok).toBe(false)
    if (!dup.ok) expect(dup.error.kind).toBe('infra_db_error')
  })

  it('insertFirstAdmin races: only first call succeeds, rest return null', async () => {
    const store = new PgAdminStore(pg.pool)
    await pg.pool.query('TRUNCATE admins CASCADE')
    const a = await store.insertFirstAdmin({ email: 'a@x.com', passwordHash: 'h' })
    const b = await store.insertFirstAdmin({ email: 'b@x.com', passwordHash: 'h' })
    expect(a.ok && a.value !== null).toBe(true)
    expect(b.ok && b.value === null).toBe(true)
  })

  it('findById returns null for unknown', async () => {
    const store = new PgAdminStore(pg.pool)
    const r = await store.findById('00000000-0000-4000-8000-000000000000' as never)
    expect(r.ok && r.value === null).toBe(true)
  })
})
