import { describe, it, expect } from 'vitest'
import { buildTestApp } from '../../../../tests/helpers/testApp'

const VISITOR_ID = '550e8400-e29b-41d4-a716-446655440000'

async function setup() {
  const { app, container } = buildTestApp()
  const encrypted = await container.encrypt('sk-proxy-xxxxxxxxxx')
  void container.siteConfigStore.upsertOnboarding({
    siteKey: 'X', siteName: 'Acme', primaryColor: '#000',
    llm4agentsApiKeyEncrypted: encrypted,
    agentModel: 'm', embeddingModel: 'e', embeddingDim: 1536,
    systemPrompt: 'help', mcpEnabled: false,
    handoffPolicy: { autoOnLowConfidence: false, autoOnFrustrationKeywords: [], timeoutBeforeRevertMs: 90000, toolEnabled: false },
    adminOnline: false, onboardingStep: 9, onboardingCompleted: true,
  })
  ;(container as { llm: unknown }).llm = {
    async *chatStream() {
      await Promise.resolve()
      yield { type: 'text', delta: 'hi back' }
      yield { type: 'done', usage: { promptTokens: 1, completionTokens: 2 }, costCents: 1 }
    },
  }
  return { app, container }
}

describe('widget session routes', () => {
  it('POST /v1/widget/sessions creates session, returns sessionId + streamToken', async () => {
    const { app } = await setup()
    const res = await app.request('/v1/widget/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Visitor-Id': VISITOR_ID },
      body: JSON.stringify({ url: 'http://x' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { sessionId: string; streamToken: string }
    expect(body.sessionId).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.streamToken).toMatch(/^\d+\.[0-9a-f]{64}$/)
  })

  it('POST /v1/widget/sessions rejects without X-Visitor-Id', async () => {
    const { app } = await setup()
    const res = await app.request('/v1/widget/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect(res.status).toBe(400)
  })

  it('POST /messages calls handleVisitorMessage and returns ok', async () => {
    const { app } = await setup()
    // Wait briefly for async upsertOnboarding to complete
    await new Promise(r => setTimeout(r, 10))
    const create = await app.request('/v1/widget/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Visitor-Id': VISITOR_ID },
      body: JSON.stringify({}),
    })
    const { sessionId } = await create.json() as { sessionId: string }
    const send = await app.request(`/v1/widget/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Visitor-Id': VISITOR_ID },
      body: JSON.stringify({ content: 'Hi' }),
    })
    expect(send.status).toBe(200)
    const body = await send.json() as { ok: boolean; streamToken: string }
    expect(body.ok).toBe(true)
    expect(body.streamToken).toMatch(/^\d+\.[0-9a-f]{64}$/)
  })

  it('POST /messages rejects content over limit', async () => {
    const { app } = await setup()
    await new Promise(r => setTimeout(r, 10))
    const create = await app.request('/v1/widget/sessions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Visitor-Id': VISITOR_ID }, body: '{}',
    })
    const { sessionId } = await create.json() as { sessionId: string }
    const send = await app.request(`/v1/widget/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Visitor-Id': VISITOR_ID },
      body: JSON.stringify({ content: 'a'.repeat(5000) }),
    })
    expect(send.status).toBe(400)
  })
})
