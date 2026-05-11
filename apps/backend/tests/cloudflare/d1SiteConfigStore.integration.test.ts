// Mirrors apps/backend/src/infrastructure/adapters/postgres/pgSiteConfigStore.integration.test.ts
// test-by-test. Any drift between the two files is a bug — both adapters
// must satisfy the same SiteConfigStorePort contract.
import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { runD1Migrations } from '../../src/infrastructure/adapters/cloudflare/d1Migrations'
import { D1SiteConfigStore } from '../../src/infrastructure/adapters/cloudflare/d1SiteConfigStore'

describe('D1SiteConfigStore @integration', () => {
  beforeEach(async () => {
    await runD1Migrations(env.DB)
    // vitest-pool-workers isolates storage per file, not per test.
    // The CHECK (id = 1) means there's at most one row to wipe.
    await env.DB.prepare('DELETE FROM site_config').run()
  })

  it('upsert + get round-trip', async () => {
    const store = new D1SiteConfigStore(env.DB)
    const empty = await store.get()
    expect(empty.ok && empty.value === null).toBe(true)
    const r = await store.upsertOnboarding({
      siteKey: 'site-abc',
      siteName: 'Acme',
      primaryColor: '#ff0000',
      llm4agentsApiKeyEncrypted: 'enc',
      systemPrompt: 'hi',
      onboardingStep: 5,
    })
    expect(r.ok).toBe(true)
    const got = await store.get()
    if (got.ok && got.value) {
      expect(got.value.siteName).toBe('Acme')
      expect(got.value.primaryColor).toBe('#ff0000')
    } else {
      throw new Error('not found')
    }
  })

  it('setAdminOnline persists', async () => {
    const store = new D1SiteConfigStore(env.DB)
    // Seed a row first — D1 has no rows by default, and setAdminOnline only
    // UPDATEs (matching Pg's behavior of needing a pre-existing row).
    await store.upsertOnboarding({
      siteKey: 'site-abc',
      siteName: 'Acme',
      llm4agentsApiKeyEncrypted: 'enc',
      systemPrompt: 'hi',
    })
    await store.setAdminOnline(true)
    const got = await store.get()
    expect(got.ok && got.value?.adminOnline).toBe(true)
  })
})
