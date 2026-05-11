// Mirrors apps/backend/src/infrastructure/adapters/postgres/pgSessionStore.updateStateIf.integration.test.ts
// Adds an extra D1-specific assertion: every state mutation must also update
// the denormalised `status_kind` column (D1 has no JSON expression indexes).
import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { env } from 'cloudflare:test'
import { runD1Migrations } from '../../src/infrastructure/adapters/cloudflare/d1Migrations'
import { D1SessionStore } from '../../src/infrastructure/adapters/cloudflare/d1SessionStore'
import { VisitorId, SessionId } from '@support/shared'
import type { ConversationState } from '../../src/domain/conversation'

describe('D1SessionStore.updateStateIf @integration', () => {
  beforeEach(async () => {
    await runD1Migrations(env.DB)
    await env.DB.prepare('DELETE FROM sessions').run()
  })

  async function makeStore() {
    const store = new D1SessionStore(env.DB)
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

    // D1-specific: status_kind is denormalised and MUST stay in sync.
    const row = await env.DB
      .prepare(`SELECT status_kind FROM sessions WHERE id = ?`)
      .bind(id)
      .first<{ status_kind: string }>()
    expect(row?.status_kind).toBe('handoff_requested')
  })

  it('returns updated=false when expectedStatus does not match', async () => {
    const { store, id } = await makeStore()
    const next: ConversationState = { status: 'handoff_requested', reason: { kind: 'visitor_intent', phrase: 'x' }, requestedAt: new Date() }
    const r = await store.updateStateIf(id, 'handoff_requested', next)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.updated).toBe(false)
    const reload = await store.getSession(id)
    expect(reload.ok && reload.value.state.status).toBe('active_ai')
  })

  it('returns ok with updated=false for non-existent id (no row matched)', async () => {
    const store = new D1SessionStore(env.DB)
    // updateStateIf uses UPDATE WHERE — if no row, changes=0 → updated=false (not an error).
    const r = await store.updateStateIf(SessionId(randomUUID()), 'active_ai', { status: 'active_ai' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.updated).toBe(false)
  })

  it('only one of two concurrent CAS attempts on the same row succeeds', async () => {
    const { store, id } = await makeStore()
    const requestedAt = new Date()
    const nextA: ConversationState = { status: 'handoff_requested', reason: { kind: 'visitor_intent', phrase: 'A' }, requestedAt }
    const nextB: ConversationState = { status: 'handoff_requested', reason: { kind: 'visitor_intent', phrase: 'B' }, requestedAt }
    const [rA, rB] = await Promise.all([
      store.updateStateIf(id, 'active_ai', nextA),
      store.updateStateIf(id, 'active_ai', nextB),
    ])
    expect(rA.ok && rB.ok).toBe(true)
    if (!rA.ok || !rB.ok) return
    const wins = [rA.value.updated, rB.value.updated].filter(Boolean).length
    expect(wins).toBe(1)
  })

  it('idempotent — applying the same transition twice is a no-op the second time', async () => {
    const { store, id } = await makeStore()
    const next: ConversationState = { status: 'handoff_requested', reason: { kind: 'visitor_intent', phrase: 'once' }, requestedAt: new Date() }
    const r1 = await store.updateStateIf(id, 'active_ai', next)
    const r2 = await store.updateStateIf(id, 'active_ai', next)
    expect(r1.ok && r2.ok).toBe(true)
    if (!r1.ok || !r2.ok) return
    expect(r1.value.updated).toBe(true)
    expect(r2.value.updated).toBe(false) // expectedStatus 'active_ai' no longer matches
  })
})

describe('D1SessionStore.listSessions @integration', () => {
  beforeEach(async () => {
    await runD1Migrations(env.DB)
    await env.DB.prepare('DELETE FROM sessions').run()
  })

  it('lists all sessions sorted by last_activity_at DESC', async () => {
    const store = new D1SessionStore(env.DB)
    const s1 = await store.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    if (!s1.ok) throw new Error('s1 failed')
    // bump s1 so it becomes the newest
    await store.bumpActivity(s1.value.id)
    const s2 = await store.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    if (!s2.ok) throw new Error('s2 failed')
    await store.bumpActivity(s2.value.id)
    const r = await store.listSessions({ limit: 10 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.length).toBe(2)
  })

  it('filters by status', async () => {
    const store = new D1SessionStore(env.DB)
    const s1 = await store.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    const s2 = await store.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    if (!s1.ok || !s2.ok) throw new Error('create failed')
    await store.updateState(s1.value.id, { status: 'handoff_requested', reason: { kind: 'visitor_intent', phrase: 'y' }, requestedAt: new Date() })
    const r = await store.listSessions({ status: 'handoff_requested', limit: 10 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.length).toBe(1)
    expect(r.value[0]?.id).toBe(s1.value.id)
  })
})
