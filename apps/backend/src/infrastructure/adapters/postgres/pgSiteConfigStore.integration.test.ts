import { describe, it, expect } from 'vitest'
import { usePostgres } from '../../../../tests/helpers/pgFixture'
import { PgSiteConfigStore } from './pgSiteConfigStore'

describe('PgSiteConfigStore @integration', () => {
  const pg = usePostgres()
  it('upsert + get round-trip', async () => {
    await pg.pool.query('TRUNCATE site_config CASCADE')
    const store = new PgSiteConfigStore(pg.pool)
    const empty = await store.get()
    expect(empty.ok && empty.value === null).toBe(true)
    const r = await store.upsertOnboarding({
      siteKey: 'site-abc', siteName: 'Acme', primaryColor: '#ff0000',
      llm4agentsApiKeyEncrypted: 'enc', systemPrompt: 'hi', onboardingStep: 5,
    })
    expect(r.ok).toBe(true)
    const got = await store.get()
    if (got.ok && got.value) {
      expect(got.value.siteName).toBe('Acme')
      expect(got.value.primaryColor).toBe('#ff0000')
    } else { throw new Error('not found') }
  })
  it('setAdminOnline persists', async () => {
    const store = new PgSiteConfigStore(pg.pool)
    await store.setAdminOnline(true)
    const got = await store.get()
    expect(got.ok && got.value?.adminOnline).toBe(true)
  })
  it('setMcpEnabled toggles mcp_enabled and round-trips through get', async () => {
    const store = new PgSiteConfigStore(pg.pool)
    // Seed via upsertOnboarding with mcpEnabled implicit (default false)
    await store.upsertOnboarding({
      siteKey: 'site-mcp', siteName: 'Acme', primaryColor: '#ff0000',
      llm4agentsApiKeyEncrypted: 'enc', systemPrompt: 'hi',
    })
    const r1 = await store.setMcpEnabled(true)
    expect(r1.ok).toBe(true)
    const cfg1 = await store.get()
    expect(cfg1.ok && cfg1.value?.mcpEnabled).toBe(true)
    const r2 = await store.setMcpEnabled(false)
    expect(r2.ok).toBe(true)
    const cfg2 = await store.get()
    expect(cfg2.ok && cfg2.value?.mcpEnabled).toBe(false)
  })
})
