import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { VisitorId, AdminId, SessionId, MAX_VISITOR_MESSAGE_LEN } from '@support/shared'
import { MemorySessionStore } from '../../infrastructure/adapters/memory/memorySessionStore'
import type { BroadcastPort } from '../ports'
import { sendOperatorMessage } from './sendOperatorMessage'
import { releaseSession } from './releaseSession'
import { closeSession } from './closeSession'

function makeBroadcast(): { port: BroadcastPort; published: Array<{ channel: unknown; event: unknown }> } {
  const published: Array<{ channel: unknown; event: unknown }> = []
  const port: BroadcastPort = {
    publish: (channel, event) => { published.push({ channel, event }) },
    subscribe: () => () => undefined,
  }
  return { port, published }
}

async function seedActiveOperatorSession(store: MemorySessionStore, operatorId: AdminId) {
  const s = await store.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
  if (!s.ok) throw new Error('create failed')
  await store.updateState(s.value.id, {
    status: 'active_operator',
    operatorId,
    claimedAt: new Date(),
  })
  return s.value.id
}

// ─── sendOperatorMessage ──────────────────────────────────────────────────────

describe('sendOperatorMessage', () => {
  it('happy path: persists message and broadcasts', async () => {
    const store = new MemorySessionStore()
    const { port, published } = makeBroadcast()
    const operatorId = AdminId(randomUUID())
    const id = await seedActiveOperatorSession(store, operatorId)

    const r = await sendOperatorMessage(
      { sessionStore: store, broadcast: port },
      { sessionId: id, operatorId, content: 'Hello visitor!' },
    )
    expect(r.ok).toBe(true)

    const messages = await store.listMessages(id, { limit: 10 })
    expect(messages.ok).toBe(true)
    if (messages.ok) {
      const opMsg = messages.value.find((m) => m.role === 'operator')
      expect(opMsg?.content).toBe('Hello visitor!')
    }

    const msgEvent = published.find((p) => p.channel === id && (p.event as { type: string }).type === 'message')
    expect(msgEvent).toBeDefined()
  })

  it('rejects if session is not active_operator', async () => {
    const store = new MemorySessionStore()
    const { port } = makeBroadcast()
    const s = await store.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    if (!s.ok) throw new Error('create failed')
    // state is active_ai
    const r = await sendOperatorMessage(
      { sessionStore: store, broadcast: port },
      { sessionId: s.value.id, operatorId: AdminId(randomUUID()), content: 'hi' },
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('invalid_state_transition')
  })

  it('rejects if operatorId does not match claiming operator', async () => {
    const store = new MemorySessionStore()
    const { port } = makeBroadcast()
    const op1 = AdminId(randomUUID())
    const op2 = AdminId(randomUUID())
    const id = await seedActiveOperatorSession(store, op1)

    const r = await sendOperatorMessage(
      { sessionStore: store, broadcast: port },
      { sessionId: id, operatorId: op2, content: 'impostor' },
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('session_already_claimed')
  })

  it('rejects message that exceeds MAX_VISITOR_MESSAGE_LEN', async () => {
    const store = new MemorySessionStore()
    const { port } = makeBroadcast()
    const operatorId = AdminId(randomUUID())
    const id = await seedActiveOperatorSession(store, operatorId)
    const tooLong = 'x'.repeat(MAX_VISITOR_MESSAGE_LEN + 1)

    const r = await sendOperatorMessage(
      { sessionStore: store, broadcast: port },
      { sessionId: id, operatorId, content: tooLong },
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('infra_unexpected')
  })
})

// ─── releaseSession ───────────────────────────────────────────────────────────

describe('releaseSession', () => {
  it('happy path: transitions active_operator → released_to_ai and broadcasts', async () => {
    const store = new MemorySessionStore()
    const { port, published } = makeBroadcast()
    const operatorId = AdminId(randomUUID())
    const id = await seedActiveOperatorSession(store, operatorId)

    const r = await releaseSession(
      { sessionStore: store, broadcast: port },
      { sessionId: id, operatorId },
    )
    expect(r.ok).toBe(true)

    const reload = await store.getSession(id)
    expect(reload.ok && reload.value.state.status).toBe('released_to_ai')

    const stateChanged = published.find((p) => p.channel === id && (p.event as { type: string }).type === 'state_changed')
    expect(stateChanged).toBeDefined()
    const released = published.find((p) => p.channel === 'admin_inbox' && (p.event as { type: string }).type === 'session_released')
    expect(released).toBeDefined()
  })

  it('rejects if state is not active_operator', async () => {
    const store = new MemorySessionStore()
    const { port } = makeBroadcast()
    const s = await store.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    if (!s.ok) throw new Error('create failed')
    const r = await releaseSession(
      { sessionStore: store, broadcast: port },
      { sessionId: s.value.id, operatorId: AdminId(randomUUID()) },
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('invalid_state_transition')
  })

  it('rejects if operatorId does not match', async () => {
    const store = new MemorySessionStore()
    const { port } = makeBroadcast()
    const op1 = AdminId(randomUUID())
    const id = await seedActiveOperatorSession(store, op1)
    const r = await releaseSession(
      { sessionStore: store, broadcast: port },
      { sessionId: id, operatorId: AdminId(randomUUID()) },
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('session_already_claimed')
  })
})

// ─── closeSession ─────────────────────────────────────────────────────────────

describe('closeSession', () => {
  it('idempotent: already-closed session returns ok without re-broadcasting', async () => {
    const store = new MemorySessionStore()
    const { port, published } = makeBroadcast()
    const s = await store.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    if (!s.ok) throw new Error('create failed')
    await store.updateState(s.value.id, { status: 'closed', closedBy: 'admin', closedAt: new Date() })

    const r = await closeSession({ sessionStore: store, broadcast: port }, { sessionId: s.value.id, by: 'admin' })
    expect(r.ok).toBe(true)
    expect(published.length).toBe(0)
  })

  it('closes an active_ai session and broadcasts', async () => {
    const store = new MemorySessionStore()
    const { port, published } = makeBroadcast()
    const s = await store.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    if (!s.ok) throw new Error('create failed')

    const r = await closeSession({ sessionStore: store, broadcast: port }, { sessionId: s.value.id, by: 'admin' })
    expect(r.ok).toBe(true)

    const reload = await store.getSession(s.value.id)
    expect(reload.ok && reload.value.state.status).toBe('closed')

    const closedEvent = published.find((p) => p.channel === s.value.id && (p.event as { type: string }).type === 'closed')
    expect(closedEvent).toBeDefined()
  })

  it('closes an active_operator session', async () => {
    const store = new MemorySessionStore()
    const { port } = makeBroadcast()
    const operatorId = AdminId(randomUUID())
    const id = await seedActiveOperatorSession(store, operatorId)

    const r = await closeSession({ sessionStore: store, broadcast: port }, { sessionId: id, by: 'admin' })
    expect(r.ok).toBe(true)

    const reload = await store.getSession(id)
    expect(reload.ok && reload.value.state.status).toBe('closed')
  })

  it('returns session_not_found for unknown session', async () => {
    const store = new MemorySessionStore()
    const { port } = makeBroadcast()
    const r = await closeSession({ sessionStore: store, broadcast: port }, { sessionId: SessionId(randomUUID()), by: 'timeout' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('session_not_found')
  })
})
