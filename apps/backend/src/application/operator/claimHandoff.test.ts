import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { VisitorId, AdminId, SessionId } from '@support/shared'
import { MemorySessionStore } from '../../infrastructure/adapters/memory/memorySessionStore'
import type { BroadcastPort } from '../ports'
import { claimHandoff } from './claimHandoff'

function makeBroadcast(): { port: BroadcastPort; published: Array<{ channel: unknown; event: unknown }> } {
  const published: Array<{ channel: unknown; event: unknown }> = []
  const port: BroadcastPort = {
    publish: (channel, event) => { published.push({ channel, event }) },
    subscribe: () => () => undefined,
  }
  return { port, published }
}

async function seedHandoffSession(store: MemorySessionStore) {
  const s = await store.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
  if (!s.ok) throw new Error('create failed')
  await store.updateState(s.value.id, {
    status: 'handoff_requested',
    reason: { kind: 'visitor_intent', phrase: 'I want a human' },
    requestedAt: new Date(),
  })
  return s.value.id
}

describe('claimHandoff', () => {
  it('happy path: transitions handoff_requested → active_operator', async () => {
    const store = new MemorySessionStore()
    const { port, published } = makeBroadcast()
    const id = await seedHandoffSession(store)
    const operatorId = AdminId(randomUUID())

    const r = await claimHandoff({ sessionStore: store, broadcast: port }, id, operatorId)
    expect(r.ok).toBe(true)

    const reload = await store.getSession(id)
    expect(reload.ok && reload.value.state.status).toBe('active_operator')
    if (reload.ok && reload.value.state.status === 'active_operator') {
      expect(reload.value.state.operatorId).toBe(operatorId)
    }

    // broadcasts state_changed on session channel
    const stateChanged = published.find((p) => p.channel === id && (p.event as { type: string }).type === 'state_changed')
    expect(stateChanged).toBeDefined()

    // broadcasts session_claimed on admin_inbox
    const claimed = published.find((p) => p.channel === 'admin_inbox' && (p.event as { type: string }).type === 'session_claimed')
    expect(claimed).toBeDefined()
  })

  it('returns session_already_claimed when session is already active_operator', async () => {
    const store = new MemorySessionStore()
    const { port } = makeBroadcast()
    const id = await seedHandoffSession(store)
    const op1 = AdminId(randomUUID())
    const op2 = AdminId(randomUUID())

    const r1 = await claimHandoff({ sessionStore: store, broadcast: port }, id, op1)
    expect(r1.ok).toBe(true)

    const r2 = await claimHandoff({ sessionStore: store, broadcast: port }, id, op2)
    expect(r2.ok).toBe(false)
    if (!r2.ok) {
      expect(r2.error.kind).toBe('session_already_claimed')
      if (r2.error.kind === 'session_already_claimed') {
        expect(r2.error.operatorId).toBe(op1)
      }
    }
  })

  it('returns invalid_state_transition when state is not handoff_requested', async () => {
    const store = new MemorySessionStore()
    const { port } = makeBroadcast()
    const s = await store.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    if (!s.ok) throw new Error('create failed')
    // state is active_ai — not handoff_requested
    const r = await claimHandoff({ sessionStore: store, broadcast: port }, s.value.id, AdminId(randomUUID()))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('invalid_state_transition')
  })

  it('race condition: only the first of two concurrent claims succeeds', async () => {
    const store = new MemorySessionStore()
    const { port } = makeBroadcast()
    const id = await seedHandoffSession(store)
    const op1 = AdminId(randomUUID())
    const op2 = AdminId(randomUUID())

    // Fire both concurrently
    const [r1, r2] = await Promise.all([
      claimHandoff({ sessionStore: store, broadcast: port }, id, op1),
      claimHandoff({ sessionStore: store, broadcast: port }, id, op2),
    ])

    const successes = [r1, r2].filter((r) => r.ok).length
    const failures = [r1, r2].filter((r) => !r.ok).length
    expect(successes).toBe(1)
    expect(failures).toBe(1)

    const failedResult = [r1, r2].find((r) => !r.ok)
    if (failedResult && !failedResult.ok) {
      expect(['session_already_claimed', 'invalid_state_transition']).toContain(failedResult.error.kind)
    }
  })

  it('returns session_not_found for unknown session id', async () => {
    const store = new MemorySessionStore()
    const { port } = makeBroadcast()
    const r = await claimHandoff({ sessionStore: store, broadcast: port }, SessionId(randomUUID()), AdminId(randomUUID()))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('session_not_found')
  })
})
