import { describe, it, expect } from 'vitest'
import { handleVisitorMessage } from './handleVisitorMessage'
import { MemorySessionStore } from '../../infrastructure/adapters/memory/memorySessionStore'
import { MemorySiteConfigStore } from '../../infrastructure/adapters/memory/memorySiteConfigStore'
import { MemoryBroadcast } from '../../infrastructure/adapters/memory/memoryBroadcast'
import { VisitorId, UsdCents } from '@support/shared'
import type { LlmPort } from '../ports'
import { randomUUID } from 'node:crypto'

async function setup() {
  const sessionStore = new MemorySessionStore()
  const siteConfigStore = new MemorySiteConfigStore()
  const broadcast = new MemoryBroadcast()
  await siteConfigStore.upsertOnboarding({
    siteKey: 'X', siteName: 'Acme', primaryColor: '#000',
    llm4agentsApiKeyEncrypted: 'enc::sk-proxy-xxxxxxxxxx',
    agentModel: 'm', embeddingModel: 'e', embeddingDim: 1536,
    systemPrompt: 'help', mcpEnabled: false,
    handoffPolicy: { autoOnLowConfidence: false, autoOnFrustrationKeywords: [], timeoutBeforeRevertMs: 90000, toolEnabled: false },
    adminOnline: false, onboardingStep: 9, onboardingCompleted: true,
  })
  const session = await sessionStore.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
  if (!session.ok) throw new Error('seed')
  const llm: LlmPort = {
    async *chatStream() {
      await Promise.resolve()
      yield { type: 'text', delta: 'hello' }
      yield { type: 'text', delta: ' world' }
      yield { type: 'done', usage: { promptTokens: 5, completionTokens: 2 }, costCents: UsdCents(1) }
    },
  }
  const decrypt = (s: string) => s.startsWith('enc::') ? s.slice(5) : s
  return { sessionStore, siteConfigStore, broadcast, llm, decrypt, sessionId: session.value.id }
}

describe('handleVisitorMessage', () => {
  it('appends visitor msg, calls LLM, appends assistant msg, broadcasts tokens + done', async () => {
    const env = await setup()
    const events: unknown[] = []
    env.broadcast.subscribe(env.sessionId, (e) => events.push(e))
    const r = await handleVisitorMessage(
      { sessionStore: env.sessionStore, siteConfigStore: env.siteConfigStore, broadcast: env.broadcast, llm: env.llm, decrypt: env.decrypt },
      { sessionId: env.sessionId, content: 'Hi there' },
    )
    expect(r.ok).toBe(true)
    const tokenEvents = events.filter((e) => (e as { type: string }).type === 'token')
    expect(tokenEvents.length).toBe(2)
    const messageEvents = events.filter((e) => (e as { type: string }).type === 'message')
    expect(messageEvents.length).toBe(2)
  })

  it('rejects when session is closed', async () => {
    const env = await setup()
    await env.sessionStore.close(env.sessionId, 'admin')
    const r = await handleVisitorMessage(
      { sessionStore: env.sessionStore, siteConfigStore: env.siteConfigStore, broadcast: env.broadcast, llm: env.llm, decrypt: env.decrypt },
      { sessionId: env.sessionId, content: 'hi' },
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('session_closed')
  })
})
