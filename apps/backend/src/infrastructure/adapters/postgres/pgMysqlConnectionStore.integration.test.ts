import { describe, it, expect } from 'vitest'
import { usePostgres } from '../../../../tests/helpers/pgFixture'
import { PgMysqlConnectionStore } from './pgMysqlConnectionStore'

const noopEncrypt = (s: string): Promise<string> => Promise.resolve(`enc::${s}`)
const noopDecrypt = (s: string): Promise<string> => Promise.resolve(s.startsWith('enc::') ? s.slice(5) : s)

const seed = () => ({
  name: 'prod-db',
  host: 'mysql.prod.internal',
  port: 3306,
  database: 'myapp',
  user: 'admin',
  password: 'topsecret',
  ssl: true,
})

describe('PgMysqlConnectionStore @integration', () => {
  const pg = usePostgres()

  it('createConnection + getConnection roundtrip (no password leak)', async () => {
    const store = new PgMysqlConnectionStore(pg.pool, noopEncrypt, noopDecrypt)
    await pg.pool.query('TRUNCATE mysql_connections CASCADE')

    const created = await store.createConnection(seed())
    expect(created.ok).toBe(true)
    if (!created.ok) return

    expect(created.value.name).toBe('prod-db')
    expect(created.value.host).toBe('mysql.prod.internal')
    expect(created.value.database).toBe('myapp')
    expect(created.value.user).toBe('admin')
    expect(created.value.ssl).toBe(true)
    expect((created.value as Record<string, unknown>)['password']).toBeUndefined()

    const got = await store.getConnection(created.value.id)
    expect(got.ok).toBe(true)
    if (!got.ok) return
    expect(got.value.id).toBe(created.value.id)
    expect((got.value as Record<string, unknown>)['password']).toBeUndefined()
  })

  it('getCredentials returns decrypted full creds', async () => {
    const store = new PgMysqlConnectionStore(pg.pool, noopEncrypt, noopDecrypt)
    await pg.pool.query('TRUNCATE mysql_connections CASCADE')

    const r = await store.createConnection(seed())
    if (!r.ok) throw new Error('create failed')

    const creds = await store.getCredentials(r.value.id)
    expect(creds.ok).toBe(true)
    if (!creds.ok) return
    expect(creds.value.password).toBe('topsecret')
    expect(creds.value.host).toBe('mysql.prod.internal')
    expect(creds.value.database).toBe('myapp')
    expect(creds.value.user).toBe('admin')
    expect(creds.value.port).toBe(3306)
    expect(creds.value.ssl).toBe(true)
  })

  it('listConnections ordered by createdAt DESC', async () => {
    const store = new PgMysqlConnectionStore(pg.pool, noopEncrypt, noopDecrypt)
    await pg.pool.query('TRUNCATE mysql_connections CASCADE')

    await store.createConnection({ ...seed(), name: 'alpha' })
    // Small delay to ensure distinct timestamps
    await new Promise((r) => setTimeout(r, 10))
    await store.createConnection({ ...seed(), name: 'beta' })

    const list = await store.listConnections()
    expect(list.ok).toBe(true)
    if (!list.ok) return
    expect(list.value.length).toBe(2)
    expect(list.value[0]?.name).toBe('beta')
    expect(list.value[1]?.name).toBe('alpha')
  })

  it('deleteConnection removes the row', async () => {
    const store = new PgMysqlConnectionStore(pg.pool, noopEncrypt, noopDecrypt)
    await pg.pool.query('TRUNCATE mysql_connections CASCADE')

    const r = await store.createConnection(seed())
    if (!r.ok) throw new Error('create failed')

    const del = await store.deleteConnection(r.value.id)
    expect(del.ok).toBe(true)

    const got = await store.getConnection(r.value.id)
    expect(got.ok).toBe(false)
    if (!got.ok) expect(got.error.kind).toBe('infra_db_error')
  })

  it('getConnection returns error for unknown id', async () => {
    const store = new PgMysqlConnectionStore(pg.pool, noopEncrypt, noopDecrypt)
    const r = await store.getConnection('00000000-0000-4000-8000-000000000099')
    expect(r.ok).toBe(false)
  })
})
