import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { handleVisitorMessage } from './handleVisitorMessage'
import { MemorySessionStore } from '../../infrastructure/adapters/memory/memorySessionStore'
import { MemorySiteConfigStore } from '../../infrastructure/adapters/memory/memorySiteConfigStore'
import { MemoryBroadcast } from '../../infrastructure/adapters/memory/memoryBroadcast'
import { MemoryEmbedder } from '../../infrastructure/adapters/memory/memoryEmbedder'
import { MemoryVectorStore } from '../../infrastructure/adapters/memory/memoryVectorStore'
import { MemoryKnowledgeStore } from '../../infrastructure/adapters/memory/memoryKnowledgeStore'
import { VisitorId, UsdCents, ChunkId, AdminId } from '@support/shared'
import type { EmbedderPort, LlmPort } from '../ports'
import type { ChatDeps } from './handleVisitorMessage'

const DIM = 8

async function setup() {
  const sessionStore = new MemorySessionStore()
  const siteConfigStore = new MemorySiteConfigStore()
  const broadcast = new MemoryBroadcast()
  const knowledgeStore = new MemoryKnowledgeStore()
  const vectorStore = new MemoryVectorStore(knowledgeStore)
  const embedder = new MemoryEmbedder(DIM)
  await siteConfigStore.upsertOnboarding({
    siteKey: 'X', siteName: 'Acme', primaryColor: '#000',
    llm4agentsApiKeyEncrypted: 'enc::sk-proxy-xxxxxxxxxx',
    agentModel: 'm', embeddingModel: 'e', embeddingDim: DIM,
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
  const decrypt = (s: string): Promise<string> => Promise.resolve(s.startsWith('enc::') ? s.slice(5) : s)
  return { sessionStore, siteConfigStore, broadcast, llm, decrypt, sessionId: session.value.id, knowledgeStore, vectorStore, embedder }
}

function makeDeps(env: Awaited<ReturnType<typeof setup>>): ChatDeps {
  return {
    sessionStore: env.sessionStore,
    siteConfigStore: env.siteConfigStore,
    broadcast: env.broadcast,
    llm: env.llm,
    embedder: env.embedder,
    vectorStore: env.vectorStore,
    decrypt: env.decrypt,
  }
}

describe('handleVisitorMessage', () => {
  it('appends visitor msg, calls LLM, appends assistant msg, broadcasts tokens + done', async () => {
    const env = await setup()
    const events: unknown[] = []
    env.broadcast.subscribe(env.sessionId, (e) => events.push(e))
    const r = await handleVisitorMessage(makeDeps(env), { sessionId: env.sessionId, content: 'Hi there' })
    expect(r.ok).toBe(true)
    const tokenEvents = events.filter((e) => (e as { type: string }).type === 'token')
    expect(tokenEvents.length).toBe(2)
    const messageEvents = events.filter((e) => (e as { type: string }).type === 'message')
    expect(messageEvents.length).toBe(2)
  })

  it('rejects when session is closed', async () => {
    const env = await setup()
    await env.sessionStore.close(env.sessionId, 'admin')
    const r = await handleVisitorMessage(makeDeps(env), { sessionId: env.sessionId, content: 'hi' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('session_closed')
  })

  it('RAG: when corpus has matching chunk, assistant message has ragHits and system includes context', async () => {
    const env = await setup()

    // Seed a source and chunk
    const srcRes = await env.knowledgeStore.createSource({ name: 'docs', sourceType: 'txt', config: { sourceType: 'txt', fileRef: 'r' } })
    if (!srcRes.ok) throw new Error('seed source')
    await env.knowledgeStore.updateSourceState(srcRes.value.id, { status: 'ready', currentGeneration: 1, ingestedAt: new Date(), chunkCount: 1 })

    // Unit vector for chunk: [1,0,0,...]
    function norm(v: readonly number[]): readonly number[] {
      const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
      return v.map((x) => x / mag)
    }
    const chunkVec = norm([1, 0, 0, 0, 0, 0, 0, 0])
    await env.vectorStore.upsertChunks([{
      id: ChunkId(randomUUID()), sourceId: srcRes.value.id,
      chunkIndex: 0, text: 'The product costs $50', tokenCount: 5,
      metadata: {}, embedding: chunkVec, ingestGeneration: 1,
    }])

    // Stub embedder: always returns chunkVec so cosine=1 → above minScore=0.7
    const stubEmbedder: EmbedderPort = {
      dimension: DIM,
      embed: () => Promise.resolve({ ok: true, value: [chunkVec] }),
    }

    // Stub LLM that captures the system prompt it receives
    let capturedSystem = ''
    const stubLlm: LlmPort = {
      async *chatStream(req) {
        capturedSystem = req.system
        await Promise.resolve()
        yield { type: 'text', delta: 'costs $50' }
        yield { type: 'done', usage: { promptTokens: 10, completionTokens: 5 }, costCents: UsdCents(2) }
      },
    }

    const deps: ChatDeps = {
      sessionStore: env.sessionStore,
      siteConfigStore: env.siteConfigStore,
      broadcast: env.broadcast,
      llm: stubLlm,
      embedder: stubEmbedder,
      vectorStore: env.vectorStore,
      decrypt: env.decrypt,
    }

    const r = await handleVisitorMessage(deps, { sessionId: env.sessionId, content: 'How much does it cost?' })
    expect(r.ok).toBe(true)

    // System prompt should include context
    expect(capturedSystem).toContain('Relevant context')
    expect(capturedSystem).toContain('The product costs $50')
    expect(capturedSystem).toContain('[docs]')

    // Assistant message should have ragHits persisted
    const messages = await env.sessionStore.listMessages(env.sessionId, { limit: 10 })
    expect(messages.ok).toBe(true)
    if (!messages.ok) return
    const assistantMsg = messages.value.find((m) => m.role === 'assistant')
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg?.ragHits).toBeDefined()
    expect(assistantMsg?.ragHits?.length).toBe(1)
    expect(assistantMsg?.ragHits?.[0]?.sourceId).toBe(srcRes.value.id)
  })

  it('RAG: empty corpus → no ragHits on assistant message, system prompt unmodified', async () => {
    const env = await setup()

    let capturedSystem = ''
    const stubLlm: LlmPort = {
      async *chatStream(req) {
        capturedSystem = req.system
        await Promise.resolve()
        yield { type: 'text', delta: 'hi' }
        yield { type: 'done', usage: { promptTokens: 2, completionTokens: 1 }, costCents: UsdCents(0) }
      },
    }

    const r = await handleVisitorMessage(
      { ...makeDeps(env), llm: stubLlm },
      { sessionId: env.sessionId, content: 'hello' },
    )
    expect(r.ok).toBe(true)
    expect(capturedSystem).not.toContain('Relevant context')

    const messages = await env.sessionStore.listMessages(env.sessionId, { limit: 10 })
    if (!messages.ok) return
    const assistantMsg = messages.value.find((m) => m.role === 'assistant')
    expect(assistantMsg?.ragHits).toBeUndefined()
  })

  // ─── Handoff tool tests ───────────────────────────────────────────────

  it('handoff: tool NOT included when toolEnabled=false', async () => {
    const env = await setup()
    // setup() sets toolEnabled=false, adminOnline=false
    let capturedTools: unknown = 'not-set'
    const stubLlm: LlmPort = {
      async *chatStream(req) {
        await Promise.resolve()
        capturedTools = req.tools
        yield { type: 'text', delta: 'hi' }
        yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1 }, costCents: UsdCents(0) }
      },
    }
    const r = await handleVisitorMessage({ ...makeDeps(env), llm: stubLlm }, { sessionId: env.sessionId, content: 'hello' })
    expect(r.ok).toBe(true)
    expect(capturedTools).toBeUndefined()
  })

  it('handoff: tool NOT included when toolEnabled=true but adminOnline=false', async () => {
    const env = await setup()
    await env.siteConfigStore.upsertOnboarding({
      siteKey: 'X', siteName: 'Acme', primaryColor: '#000',
      llm4agentsApiKeyEncrypted: 'enc::sk-proxy-xxxxxxxxxx',
      agentModel: 'm', embeddingModel: 'e', embeddingDim: DIM,
      systemPrompt: 'help', mcpEnabled: false,
      handoffPolicy: { autoOnLowConfidence: false, autoOnFrustrationKeywords: [], timeoutBeforeRevertMs: 90000, toolEnabled: true },
      adminOnline: false, onboardingStep: 9, onboardingCompleted: true,
    })
    let capturedTools: unknown = 'not-set'
    const stubLlm: LlmPort = {
      async *chatStream(req) {
        await Promise.resolve()
        capturedTools = req.tools
        yield { type: 'text', delta: 'hi' }
        yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1 }, costCents: UsdCents(0) }
      },
    }
    const r = await handleVisitorMessage({ ...makeDeps(env), llm: stubLlm }, { sessionId: env.sessionId, content: 'hello' })
    expect(r.ok).toBe(true)
    expect(capturedTools).toBeUndefined()
  })

  it('handoff: tool_start fires → state transitions to handoff_requested, broadcasts new_handoff to admin_inbox, persists system_event, NO assistant message', async () => {
    const env = await setup()
    await env.siteConfigStore.upsertOnboarding({
      siteKey: 'X', siteName: 'Acme', primaryColor: '#000',
      llm4agentsApiKeyEncrypted: 'enc::sk-proxy-xxxxxxxxxx',
      agentModel: 'm', embeddingModel: 'e', embeddingDim: DIM,
      systemPrompt: 'help', mcpEnabled: false,
      handoffPolicy: { autoOnLowConfidence: false, autoOnFrustrationKeywords: [], timeoutBeforeRevertMs: 90000, toolEnabled: true },
      adminOnline: true, onboardingStep: 9, onboardingCompleted: true,
    })

    const sessionEvents: unknown[] = []
    const adminEvents: unknown[] = []
    env.broadcast.subscribe(env.sessionId, (e) => sessionEvents.push(e))
    env.broadcast.subscribe('admin_inbox', (e) => adminEvents.push(e))

    const stubLlm: LlmPort = {
      async *chatStream() {
        await Promise.resolve()
        yield { type: 'text', delta: 'Let me get' }
        yield { type: 'tool_start', name: 'request_human_handoff', argsJson: '{"reason":"user asked for a human","category":"user_request"}' }
        yield { type: 'done', usage: { promptTokens: 10, completionTokens: 5 }, costCents: UsdCents(1) }
      },
    }

    const r = await handleVisitorMessage({ ...makeDeps(env), llm: stubLlm }, { sessionId: env.sessionId, content: 'I want a human' })
    expect(r.ok).toBe(true)

    // Session state must be handoff_requested
    const sessionRes = await env.sessionStore.getSession(env.sessionId)
    expect(sessionRes.ok).toBe(true)
    if (!sessionRes.ok) return
    expect(sessionRes.value.state.status).toBe('handoff_requested')

    // state_changed broadcast on session channel
    const stateChangedEvs = sessionEvents.filter((e) => (e as { type: string }).type === 'state_changed')
    expect(stateChangedEvs.length).toBe(1)

    // new_handoff on admin_inbox
    expect(adminEvents.length).toBe(1)
    const nhEv = adminEvents[0] as { type: string; sessionId: string; reason: { kind: string; category: string } }
    expect(nhEv.type).toBe('new_handoff')
    expect(nhEv.sessionId).toBe(env.sessionId)
    expect(nhEv.reason.kind).toBe('ai_decision')
    expect(nhEv.reason.category).toBe('user_request')

    // system_event message persisted
    const messages = await env.sessionStore.listMessages(env.sessionId, { limit: 20 })
    expect(messages.ok).toBe(true)
    if (!messages.ok) return
    const sysEv = messages.value.find((m) => m.role === 'system_event')
    expect(sysEv).toBeDefined()
    expect(sysEv?.content).toContain('user asked for a human')

    // NO assistant message persisted
    const assistantMsg = messages.value.find((m) => m.role === 'assistant')
    expect(assistantMsg).toBeUndefined()
  })

  it('handoff: toolEnabled=true adminOnline=false → fallback guidance in system prompt, no tools array', async () => {
    const env = await setup()
    await env.siteConfigStore.upsertOnboarding({
      siteKey: 'X', siteName: 'Acme', primaryColor: '#000',
      llm4agentsApiKeyEncrypted: 'enc::sk-proxy-xxxxxxxxxx',
      agentModel: 'm', embeddingModel: 'e', embeddingDim: DIM,
      systemPrompt: 'help', mcpEnabled: false,
      handoffPolicy: { autoOnLowConfidence: false, autoOnFrustrationKeywords: [], timeoutBeforeRevertMs: 90000, toolEnabled: true },
      adminOnline: false, onboardingStep: 9, onboardingCompleted: true,
    })

    let capturedSystem = ''
    let capturedTools: unknown = 'not-set'
    const stubLlm: LlmPort = {
      async *chatStream(req) {
        await Promise.resolve()
        capturedSystem = req.system
        capturedTools = req.tools
        yield { type: 'text', delta: 'Lo siento' }
        yield { type: 'done', usage: { promptTokens: 2, completionTokens: 2 }, costCents: UsdCents(0) }
      },
    }

    const r = await handleVisitorMessage({ ...makeDeps(env), llm: stubLlm }, { sessionId: env.sessionId, content: 'quiero hablar con un humano' })
    expect(r.ok).toBe(true)
    expect(capturedTools).toBeUndefined()
    expect(capturedSystem).toContain('no hay agentes')
    expect(capturedSystem).not.toContain('request_human_handoff')
  })

  it('handoff: malformed tool args → falls back to out_of_scope category gracefully', async () => {
    const env = await setup()
    await env.siteConfigStore.upsertOnboarding({
      siteKey: 'X', siteName: 'Acme', primaryColor: '#000',
      llm4agentsApiKeyEncrypted: 'enc::sk-proxy-xxxxxxxxxx',
      agentModel: 'm', embeddingModel: 'e', embeddingDim: DIM,
      systemPrompt: 'help', mcpEnabled: false,
      handoffPolicy: { autoOnLowConfidence: false, autoOnFrustrationKeywords: [], timeoutBeforeRevertMs: 90000, toolEnabled: true },
      adminOnline: true, onboardingStep: 9, onboardingCompleted: true,
    })

    const adminEvents: unknown[] = []
    env.broadcast.subscribe('admin_inbox', (e) => adminEvents.push(e))

    const stubLlm: LlmPort = {
      async *chatStream() {
        await Promise.resolve()
        yield { type: 'tool_start', name: 'request_human_handoff', argsJson: 'INVALID JSON }{' }
        yield { type: 'done', usage: { promptTokens: 5, completionTokens: 2 }, costCents: UsdCents(0) }
      },
    }

    const r = await handleVisitorMessage({ ...makeDeps(env), llm: stubLlm }, { sessionId: env.sessionId, content: 'help' })
    expect(r.ok).toBe(true)

    const sessionRes = await env.sessionStore.getSession(env.sessionId)
    expect(sessionRes.ok).toBe(true)
    if (!sessionRes.ok) return
    expect(sessionRes.value.state.status).toBe('handoff_requested')

    // Category should fall back to out_of_scope
    const nhEv = adminEvents[0] as { reason: { category: string } } | undefined
    expect(nhEv?.reason.category).toBe('out_of_scope')
  })

  it('handoff: race-safe — if operator claims during the LLM stream, AI handoff is dropped (atomic CAS)', async () => {
    const env = await setup()
    await env.siteConfigStore.upsertOnboarding({
      siteKey: 'X', siteName: 'Acme', primaryColor: '#000',
      llm4agentsApiKeyEncrypted: 'enc::sk-proxy-xxxxxxxxxx',
      agentModel: 'm', embeddingModel: 'e', embeddingDim: DIM,
      systemPrompt: 'help', mcpEnabled: false,
      handoffPolicy: { autoOnLowConfidence: false, autoOnFrustrationKeywords: [], timeoutBeforeRevertMs: 90000, toolEnabled: true },
      adminOnline: true, onboardingStep: 9, onboardingCompleted: true,
    })

    const adminEvents: unknown[] = []
    env.broadcast.subscribe('admin_inbox', (e) => adminEvents.push(e))

    // Simulate an operator claiming the session mid-stream: the LLM yields
    // tool_start AFTER we mutate state to active_operator. The CAS guard in
    // handleVisitorMessage must detect the status drift and skip the transition.
    const stubLlm: LlmPort = {
      async *chatStream() {
        await Promise.resolve()
        const opTrans = await env.sessionStore.updateStateIf(env.sessionId, 'active_ai', {
          status: 'active_operator', operatorId: AdminId(randomUUID()), claimedAt: new Date(),
        })
        if (!opTrans.ok || !opTrans.value.updated) throw new Error('failed to seed operator claim')
        yield { type: 'tool_start', name: 'request_human_handoff', argsJson: '{"reason":"test","category":"user_request"}' }
        yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1 }, costCents: UsdCents(0) }
      },
    }

    const r = await handleVisitorMessage({ ...makeDeps(env), llm: stubLlm }, { sessionId: env.sessionId, content: 'Hi' })
    expect(r.ok).toBe(true)

    const sessionRes = await env.sessionStore.getSession(env.sessionId)
    expect(sessionRes.ok).toBe(true)
    if (!sessionRes.ok) return
    // Operator wins — state stays active_operator, AI handoff is dropped.
    expect(sessionRes.value.state.status).toBe('active_operator')

    // No new_handoff event was broadcast — admin already owns the session.
    const newHandoffs = adminEvents.filter((e) => (e as { type: string }).type === 'new_handoff')
    expect(newHandoffs.length).toBe(0)

    // No system_event for the dropped escalation.
    const messages = await env.sessionStore.listMessages(env.sessionId, { limit: 20 })
    expect(messages.ok).toBe(true)
    if (!messages.ok) return
    const sysEv = messages.value.find((m) => m.role === 'system_event')
    expect(sysEv).toBeUndefined()
  })
})
