import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { VisitorId, UsdCents, SessionId } from '@support/shared'
import { MemorySessionStore } from './memorySessionStore'
import type { ConversationState } from '../../../domain/conversation'

describe('MemorySessionStore.updateStateIf', () => {
  async function makeStore() {
    const store = new MemorySessionStore()
    const s = await store.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    if (!s.ok) throw new Error('create failed')
    return { store, id: s.value.id }
  }

  it('updates state when expectedStatus matches', async () => {
    const { store, id } = await makeStore()
    const next: ConversationState = { status: 'handoff_requested', reason: { kind: 'visitor_intent', phrase: 'human please' }, requestedAt: new Date() }
    const r = await store.updateStateIf(id, 'active_ai', next)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.updated).toBe(true)
    const reload = await store.getSession(id)
    expect(reload.ok && reload.value.state.status).toBe('handoff_requested')
  })

  it('returns updated=false when expectedStatus does not match', async () => {
    const { store, id } = await makeStore()
    const next: ConversationState = { status: 'handoff_requested', reason: { kind: 'visitor_intent', phrase: 'x' }, requestedAt: new Date() }
    // current is active_ai, but we expect handoff_requested — mismatch
    const r = await store.updateStateIf(id, 'handoff_requested', next)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.updated).toBe(false)
    const reload = await store.getSession(id)
    // state unchanged
    expect(reload.ok && reload.value.state.status).toBe('active_ai')
  })

  it('returns session_not_found for unknown id', async () => {
    const store = new MemorySessionStore()
    const r = await store.updateStateIf(SessionId(randomUUID()), 'active_ai', { status: 'active_ai' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe('session_not_found')
  })
})

describe('MemorySessionStore.listSessions', () => {
  it('lists all sessions sorted by lastActivityAt DESC', async () => {
    const store = new MemorySessionStore()
    const s1 = await store.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    await new Promise((r) => setTimeout(r, 5))
    const s2 = await store.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    if (!s1.ok || !s2.ok) throw new Error('create failed')
    const r = await store.listSessions({ limit: 10 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.length).toBe(2)
    // s2 is newer, so it appears first
    expect(r.value[0]?.id).toBe(s2.value.id)
  })

  it('filters by status', async () => {
    const store = new MemorySessionStore()
    const s1 = await store.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    const s2 = await store.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    if (!s1.ok || !s2.ok) throw new Error('create failed')
    await store.updateState(s1.value.id, { status: 'handoff_requested', reason: { kind: 'visitor_intent', phrase: 'x' }, requestedAt: new Date() })
    const r = await store.listSessions({ status: 'handoff_requested', limit: 10 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.length).toBe(1)
    expect(r.value[0]?.id).toBe(s1.value.id)
  })

  it('respects limit', async () => {
    const store = new MemorySessionStore()
    for (let i = 0; i < 5; i++) {
      await store.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    }
    const r = await store.listSessions({ limit: 3 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.length).toBe(3)
  })
})
