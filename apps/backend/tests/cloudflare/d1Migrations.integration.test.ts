import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { runD1Migrations } from '../../src/infrastructure/adapters/cloudflare/d1Migrations'

describe('d1Migrations', () => {
  it('applies migrations 0001-0003 idempotently', async () => {
    await runD1Migrations(env.DB)
    const r = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{
      name: string
    }>()
    const names = r.results.map((row) => row.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'admins',
        'sessions',
        'messages',
        'sources',
        'chunks',
        'mysql_connections',
        'schema_migrations',
      ]),
    )
  })

  it('skips already-applied migrations on second run', async () => {
    await runD1Migrations(env.DB)
    await runD1Migrations(env.DB) // must not error on duplicate CREATE
    const r = await env.DB.prepare('SELECT COUNT(*) AS c FROM schema_migrations').first<{
      c: number
    }>()
    expect(r?.c).toBe(3)
  })

  it('status_kind column exists on sessions after 0003', async () => {
    await runD1Migrations(env.DB)
    const r = await env.DB.prepare("PRAGMA table_info('sessions')").all<{ name: string }>()
    const cols = r.results.map((row) => row.name)
    expect(cols).toContain('status_kind')
  })
})
