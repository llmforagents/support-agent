import { describe, it, expect } from 'vitest'
import { buildTestApp } from '../../../../tests/helpers/testApp'

describe('GET /v1/widget/config', () => {
  it('returns 404 before onboarding', async () => {
    const { app } = buildTestApp()
    const res = await app.request('/v1/widget/config?siteKey=NONEXISTENT')
    expect(res.status).toBe(404)
  })

  it('returns public config after onboarding', async () => {
    const { app, container } = buildTestApp()
    await container.siteConfigStore.upsertOnboarding({
      siteKey: 'ABCDEFGHIJKLMNOPQRSTUVWX',
      siteName: 'Acme', primaryColor: '#ff00ff',
      llm4agentsApiKeyEncrypted: 'enc', agentModel: 'm',
      embeddingModel: 'e', embeddingDim: 1536, systemPrompt: 'p',
      mcpEnabled: false,
      handoffPolicy: { autoOnLowConfidence: true, autoOnFrustrationKeywords: [], timeoutBeforeRevertMs: 90000, toolEnabled: true },
      adminOnline: true, onboardingStep: 9, onboardingCompleted: true,
    })
    const res = await app.request('/v1/widget/config?siteKey=ABCDEFGHIJKLMNOPQRSTUVWX')
    expect(res.status).toBe(200)
    const body = await res.json() as { siteName: string; primaryColor: string; adminOnline: boolean }
    expect(body.siteName).toBe('Acme')
    expect(body.primaryColor).toBe('#ff00ff')
    expect(body.adminOnline).toBe(true)
    expect((body as Record<string, unknown>)['llm4agentsApiKeyEncrypted']).toBeUndefined()
  })
})
