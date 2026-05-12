import { describe, it, expect } from 'vitest'
import { completeOnboarding } from './completeOnboarding'
import { MemorySiteConfigStore } from '../../infrastructure/adapters/memory/memorySiteConfigStore'

describe('completeOnboarding', () => {
  const fakeEncrypt = (plaintext: string): Promise<string> => Promise.resolve(`enc::${plaintext}`)

  it('encrypts api key before storing', async () => {
    const store = new MemorySiteConfigStore()
    const r = await completeOnboarding({ siteConfigStore: store, encrypt: fakeEncrypt }, {
      siteName: 'Acme', primaryColor: '#4f46e5',
      llm4agentsApiKey: 'sk-proxy-abcdefghijklmnop',
      agentModel: 'anthropic/claude-sonnet-4',
      systemPrompt: 'You are the support agent for Acme.',
    })
    expect(r.ok).toBe(true)
    const got = await store.get()
    if (got.ok && got.value) {
      expect(got.value.llm4agentsApiKeyEncrypted.startsWith('enc::')).toBe(true)
      expect(got.value.onboardingCompleted).toBe(true)
      expect(got.value.siteKey).toMatch(/^[A-Za-z0-9_-]{20}$/)
    } else throw new Error('not stored')
  })

  it('idempotent — re-calling does not duplicate', async () => {
    const store = new MemorySiteConfigStore()
    const dep = { siteConfigStore: store, encrypt: fakeEncrypt }
    const input = { siteName: 'A', primaryColor: '#000000', llm4agentsApiKey: 'sk-proxy-abcdefghijklmnop', agentModel: 'm', systemPrompt: 'p' }
    const a = await completeOnboarding(dep, input)
    const b = await completeOnboarding(dep, input)
    expect(a.ok && b.ok).toBe(true)
    if (a.ok && b.ok) expect(a.value.siteKey).toBe(b.value.siteKey)
  })
})
