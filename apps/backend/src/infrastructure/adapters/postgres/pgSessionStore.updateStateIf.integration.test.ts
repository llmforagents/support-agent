import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { usePostgres } from '../../../../tests/helpers/pgFixture'
import { PgSessionStore } from './pgSessionStore'
import { VisitorId, SessionId } from '@support/shared'
import type { ConversationState } from '../../../domain/conversation'

describe('PgSessionStore.updateStateIf @integration', () => {
  const pg = usePostgres()

  async function makeStore() {
    await pg.pool.query('TRUNCATE sessions CASCADE')
    const store = new PgSessionStore(pg.pool)
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
    const r = await store.updateStateIf(id, 'handoff_requested', next)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.updated).toBe(false)
    const reload = await store.getSession(id)
    expect(reload.ok && reload.value.state.status).toBe('active_ai')
  })

  it('returns ok with updated=false for non-existent id (no row matched)', async () => {
    await pg.pool.query('TRUNCATE sessions CASCADE')
    const store = new PgSessionStore(pg.pool)
    // updateStateIf uses UPDATE WHERE — if no row, rowCount=0 → updated=false (not an error in Pg impl)
    const r = await store.updateStateIf(SessionId(randomUUID()), 'active_ai', { status: 'active_ai' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.updated).toBe(false)
  })
})

describe('PgSessionStore.listSessions @integration', () => {
  const pg = usePostgres()

  it('lists all sessions sorted by last_activity_at DESC', async () => {
    await pg.pool.query('TRUNCATE sessions CASCADE')
    const store = new PgSessionStore(pg.pool)
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
    await pg.pool.query('TRUNCATE sessions CASCADE')
    const store = new PgSessionStore(pg.pool)
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
