import { randomUUID } from 'node:crypto'
import { Ok, Err, type Result, type AppError, UsdCents, MAX_HISTORY_TURNS, MessageId, type SessionId } from '@support/shared'
import type { BroadcastPort, EmbedderPort, LlmPort, SessionStorePort, SiteConfigStorePort, VectorStorePort } from '../ports'
import { searchKnowledge } from '../kb/searchKnowledge'
import { HANDOFF_TOOL, HANDOFF_TOOL_GUIDANCE } from './handoffPrompt'
import { requestHandoff } from './conversationTransitions'
import type { HandoffReason, HandoffCategory } from '../../domain/conversation'

export type ChatDeps = Readonly<{
  sessionStore: SessionStorePort
  siteConfigStore: SiteConfigStorePort
  broadcast: BroadcastPort
  llm: LlmPort
  embedder: EmbedderPort
  vectorStore: VectorStorePort
  decrypt: (envelope: string) => string
}>

const VALID_CATEGORIES: readonly HandoffCategory[] = [
  'user_request', 'frustration', 'out_of_scope', 'sensitive_topic', 'repeated_failure',
]

export async function handleVisitorMessage(
  deps: ChatDeps,
  input: { sessionId: SessionId; content: string; abort?: AbortSignal },
): Promise<Result<void, AppError>> {
  const sessionRes = await deps.sessionStore.getSession(input.sessionId)
  if (!sessionRes.ok) return sessionRes
  const session = sessionRes.value
  if (session.state.status === 'closed') return Err({ kind: 'session_closed', sessionId: input.sessionId })
  if (session.state.status === 'active_operator' || session.state.status === 'handoff_requested') {
    const v = await deps.sessionStore.appendMessage({ sessionId: input.sessionId, role: 'visitor', content: input.content, costCents: UsdCents(0) })
    if (v.ok) deps.broadcast.publish(input.sessionId, { type: 'message', message: v.value })
    return Ok(undefined)
  }

  const cfg = await deps.siteConfigStore.get()
  if (!cfg.ok || !cfg.value || !cfg.value.onboardingCompleted) {
    return Err({ kind: 'infra_unexpected', cause: 'onboarding incomplete' })
  }

  const visitorMsg = await deps.sessionStore.appendMessage({ sessionId: input.sessionId, role: 'visitor', content: input.content, costCents: UsdCents(0) })
  if (!visitorMsg.ok) return visitorMsg
  deps.broadcast.publish(input.sessionId, { type: 'message', message: visitorMsg.value })

  const historyRes = await deps.sessionStore.listMessages(input.sessionId, { limit: MAX_HISTORY_TURNS })
  if (!historyRes.ok) return historyRes
  const history = historyRes.value
    .filter((m) => m.role === 'visitor' || m.role === 'assistant')
    .map((m) => ({ role: m.role === 'visitor' ? 'user' as const : 'assistant' as const, content: m.content }))

  const apiKey = deps.decrypt(cfg.value.llm4agentsApiKeyEncrypted)
  const systemPrompt = cfg.value.systemPrompt.replace(/\{\{siteName\}\}/g, cfg.value.siteName)

  const ragRes = await searchKnowledge(
    { embedder: deps.embedder, vectorStore: deps.vectorStore, siteConfigStore: deps.siteConfigStore, decrypt: deps.decrypt },
    input.content,
    { topK: 5, minScore: 0.7 },
  )
  const ragHits = ragRes.ok ? ragRes.value : []
  const ragContext = ragHits.length > 0
    ? '\n\nRelevant context (use only if applicable):\n' + ragHits.map((h) => `[${h.sourceName}]\n${h.text}`).join('\n---\n')
    : ''

  const handoffEnabled = cfg.value.handoffPolicy.toolEnabled && cfg.value.adminOnline
  const fullSystemPrompt = systemPrompt + ragContext
    + (handoffEnabled ? '\n\n' + HANDOFF_TOOL_GUIDANCE : '')
  const tools = handoffEnabled ? [HANDOFF_TOOL] : undefined

  const pendingAssistantId = MessageId(randomUUID())
  const ctrl = new AbortController()
  if (input.abort) input.abort.addEventListener('abort', () => ctrl.abort(), { once: true })

  let buffer = ''
  let cost = UsdCents(0)
  let handoffTriggered = false
  let handoffReason: HandoffReason | null = null

  const llmReq = tools !== undefined
    ? { apiKey, model: cfg.value.agentModel, system: fullSystemPrompt, messages: history, tools, abort: ctrl.signal }
    : { apiKey, model: cfg.value.agentModel, system: fullSystemPrompt, messages: history, abort: ctrl.signal }

  try {
    for await (const ev of deps.llm.chatStream(llmReq)) {
      switch (ev.type) {
        case 'text':
          if (handoffTriggered) break
          buffer += ev.delta
          deps.broadcast.publish(input.sessionId, { type: 'token', messageId: pendingAssistantId, delta: ev.delta })
          break
        case 'done':
          cost = ev.costCents
          break
        case 'tool_start':
          if (ev.name === 'request_human_handoff') {
            let parsed: { reason?: unknown; category?: unknown } = {}
            try { parsed = JSON.parse(ev.argsJson) as { reason?: unknown; category?: unknown } } catch { /* malformed args; treat as out_of_scope */ }
            const category: HandoffCategory = typeof parsed.category === 'string' && (VALID_CATEGORIES as readonly string[]).includes(parsed.category)
              ? (parsed.category as HandoffCategory)
              : 'out_of_scope'
            const toolReason = typeof parsed.reason === 'string' ? parsed.reason : 'AI requested escalation'
            handoffReason = { kind: 'ai_decision', toolReason, category }
            handoffTriggered = true
            ctrl.abort()
          }
          break
        case 'reasoning':
        case 'tool_end':
          break
      }
      if (handoffTriggered) break
    }
  } catch (err) {
    if (handoffTriggered) {
      // Abort thrown by our own ctrl.abort() — not a real error
    } else if (ctrl.signal.aborted) {
      return Err({ kind: 'llm_unavailable', cause: 'aborted' })
    } else {
      return Err({ kind: 'llm_unavailable', cause: String(err) })
    }
  }

  if (handoffTriggered && handoffReason !== null) {
    const trans = requestHandoff(session.state, handoffReason)
    if (trans.ok) {
      // TODO(T109): replace with atomic updateStateIf to guard concurrent updates
      const upd = await deps.sessionStore.updateState(input.sessionId, trans.next)
      if (upd.ok) {
        const sysEv = await deps.sessionStore.appendMessage({
          sessionId: input.sessionId, role: 'system_event',
          content: `AI escaló la conversación: ${handoffReason.toolReason}`,
          costCents: UsdCents(0),
        })
        if (sysEv.ok) deps.broadcast.publish(input.sessionId, { type: 'message', message: sysEv.value })
        deps.broadcast.publish(input.sessionId, { type: 'state_changed', from: session.state, to: trans.next })
        deps.broadcast.publish('admin_inbox', { type: 'new_handoff', sessionId: input.sessionId, reason: handoffReason })
      }
    }
    return Ok(undefined)
  }

  const ragHitsForPersist = ragHits.map((h) => ({ id: h.id, sourceId: h.sourceId, score: h.score }))
  const assistantMsg = await deps.sessionStore.appendMessageWithId({
    id: pendingAssistantId, sessionId: input.sessionId, role: 'assistant',
    content: buffer, costCents: cost,
    ...(ragHitsForPersist.length > 0 ? { ragHits: ragHitsForPersist } : {}),
  })
  if (assistantMsg.ok) deps.broadcast.publish(input.sessionId, { type: 'message', message: assistantMsg.value })
  return Ok(undefined)
}
