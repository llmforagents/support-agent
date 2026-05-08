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
})
