import { describe, it, expect } from 'vitest'
import { usePostgres } from '../../../../tests/helpers/pgFixture'

describe('runMigrations @integration', () => {
  const pg = usePostgres()
  it('creates expected tables', async () => {
    const r = await pg.pool.query<{ tablename: string }>(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `)
    const names = r.rows.map((x) => x.tablename)
    expect(names).toContain('admins')
    expect(names).toContain('admin_sessions')
    expect(names).toContain('site_config')
    expect(names).toContain('sessions')
    expect(names).toContain('messages')
    expect(names).toContain('schema_migrations')
  })
})
