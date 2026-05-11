// Mirrors apps/backend/src/infrastructure/adapters/postgres/pgMysqlConnectionStore.integration.test.ts
// test-by-test. Two intentional drifts vs the Pg twin (documented in
// migration 0003_handoff_mysql.sql + the D1 store header):
//   • D1 schema has no `ssl` column → the store always reports `ssl: false`.
//     The `ssl: true` assertion from the Pg test is dropped here.
//   • host/database/user are plaintext in D1 (only password is encrypted),
//     so encryption fidelity is only meaningful for `password`.
// Test names remain identical to the Pg counterparts.
import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { runD1Migrations } from '../../src/infrastructure/adapters/cloudflare/d1Migrations'
import { D1MysqlConnectionStore } from '../../src/infrastructure/adapters/cloudflare/d1MysqlConnectionStore'

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

describe('D1MysqlConnectionStore @integration', () => {
  beforeEach(async () => {
    await runD1Migrations(env.DB)
    await env.DB.prepare('DELETE FROM mysql_connections').run()
  })

  it('createConnection + getConnection roundtrip (no password leak)', async () => {
    const store = new D1MysqlConnectionStore(env.DB, noopEncrypt, noopDecrypt)

    const created = await store.createConnection(seed())
    expect(created.ok).toBe(true)
    if (!created.ok) return

    expect(created.value.name).toBe('prod-db')
    expect(created.value.host).toBe('mysql.prod.internal')
    expect(created.value.database).toBe('myapp')
    expect(created.value.user).toBe('admin')
    expect((created.value as Record<string, unknown>)['password']).toBeUndefined()

    const got = await store.getConnection(created.value.id)
    expect(got.ok).toBe(true)
    if (!got.ok) return
    expect(got.value.id).toBe(created.value.id)
    expect((got.value as Record<string, unknown>)['password']).toBeUndefined()
  })

  it('getCredentials returns decrypted full creds', async () => {
    const store = new D1MysqlConnectionStore(env.DB, noopEncrypt, noopDecrypt)

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
  })

  it('listConnections ordered by createdAt DESC', async () => {
    const store = new D1MysqlConnectionStore(env.DB, noopEncrypt, noopDecrypt)

    await store.createConnection({ ...seed(), name: 'alpha' })
    // SQLite datetime('now') has 1-second resolution; pause to guarantee
    // a distinct timestamp so DESC ordering is deterministic.
    await new Promise((r) => setTimeout(r, 1100))
    await store.createConnection({ ...seed(), name: 'beta' })

    const list = await store.listConnections()
    expect(list.ok).toBe(true)
    if (!list.ok) return
    expect(list.value.length).toBe(2)
    expect(list.value[0]?.name).toBe('beta')
    expect(list.value[1]?.name).toBe('alpha')
  })

  it('deleteConnection removes the row', async () => {
    const store = new D1MysqlConnectionStore(env.DB, noopEncrypt, noopDecrypt)

    const r = await store.createConnection(seed())
    if (!r.ok) throw new Error('create failed')

    const del = await store.deleteConnection(r.value.id)
    expect(del.ok).toBe(true)

    const got = await store.getConnection(r.value.id)
    expect(got.ok).toBe(false)
    if (!got.ok) expect(got.error.kind).toBe('infra_db_error')
  })

  it('getConnection returns error for unknown id', async () => {
    const store = new D1MysqlConnectionStore(env.DB, noopEncrypt, noopDecrypt)
    const r = await store.getConnection('00000000-0000-4000-8000-000000000099')
    expect(r.ok).toBe(false)
  })
})
