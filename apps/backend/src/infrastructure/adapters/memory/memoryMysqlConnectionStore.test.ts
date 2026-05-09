import { describe, it, expect } from 'vitest'
import { MemoryMysqlConnectionStore } from './memoryMysqlConnectionStore'

const seed = () => ({
  name: 'test-db',
  host: 'db.example.com',
  port: 3306,
  database: 'mydb',
  user: 'root',
  password: 's3cret',
  ssl: true,
})

describe('MemoryMysqlConnectionStore', () => {
  it('createConnection + getConnection roundtrip (no password leak)', async () => {
    const store = new MemoryMysqlConnectionStore()
    const r = await store.createConnection(seed())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.name).toBe('test-db')
    expect(r.value.host).toBe('db.example.com')
    expect(r.value.database).toBe('mydb')
    expect(r.value.user).toBe('root')
    expect(r.value.ssl).toBe(true)
    // password must NOT appear on the public row
    expect((r.value as Record<string, unknown>)['password']).toBeUndefined()

    const got = await store.getConnection(r.value.id)
    expect(got.ok).toBe(true)
    if (!got.ok) return
    expect(got.value.id).toBe(r.value.id)
    expect((got.value as Record<string, unknown>)['password']).toBeUndefined()
  })

  it('getCredentials returns decrypted full creds', async () => {
    const store = new MemoryMysqlConnectionStore()
    const r = await store.createConnection(seed())
    if (!r.ok) throw new Error('create failed')

    const creds = await store.getCredentials(r.value.id)
    expect(creds.ok).toBe(true)
    if (!creds.ok) return
    expect(creds.value.password).toBe('s3cret')
    expect(creds.value.host).toBe('db.example.com')
    expect(creds.value.database).toBe('mydb')
    expect(creds.value.user).toBe('root')
    expect(creds.value.port).toBe(3306)
    expect(creds.value.ssl).toBe(true)
  })

  it('listConnections returns newest first', async () => {
    const store = new MemoryMysqlConnectionStore()
    const a = await store.createConnection({ ...seed(), name: 'first' })
    const b = await store.createConnection({ ...seed(), name: 'second' })
    if (!a.ok || !b.ok) throw new Error('seed failed')

    const list = await store.listConnections()
    expect(list.ok).toBe(true)
    if (!list.ok) return
    expect(list.value[0]?.name).toBe('second')
    expect(list.value[1]?.name).toBe('first')
  })

  it('deleteConnection removes the entry', async () => {
    const store = new MemoryMysqlConnectionStore()
    const r = await store.createConnection(seed())
    if (!r.ok) throw new Error('create failed')

    const del = await store.deleteConnection(r.value.id)
    expect(del.ok).toBe(true)

    const got = await store.getConnection(r.value.id)
    expect(got.ok).toBe(false)
  })

  it('getConnection returns error for unknown id', async () => {
    const store = new MemoryMysqlConnectionStore()
    const r = await store.getConnection('nonexistent-id')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('infra_db_error')
  })

  it('getCredentials returns error for unknown id', async () => {
    const store = new MemoryMysqlConnectionStore()
    const r = await store.getCredentials('nonexistent-id')
    expect(r.ok).toBe(false)
  })
})
