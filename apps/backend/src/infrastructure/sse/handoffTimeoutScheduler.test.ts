import { describe, it, expect, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { HandoffTimeoutScheduler } from './handoffTimeoutScheduler'
import { MemorySessionStore } from '../adapters/memory/memorySessionStore'
import { InProcessSseHub } from './inProcessSseHub'
import { VisitorId, HANDOFF_TIMEOUT_MS } from '@support/shared'
import type { ConversationState } from '../../domain/conversation'

describe('HandoffTimeoutScheduler', () => {
  it('reverts a handoff_requested session older than HANDOFF_TIMEOUT_MS', async () => {
    const sessionStore = new MemorySessionStore()
    const broadcast = new InProcessSseHub()
    const events: unknown[] = []

    const created = await sessionStore.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    if (!created.ok) throw new Error('seed')

    // Manually set state to handoff_requested with a stale timestamp
    const staleState: ConversationState = {
      status: 'handoff_requested',
      reason: { kind: 'visitor_intent', phrase: 'help' },
      requestedAt: new Date(Date.now() - HANDOFF_TIMEOUT_MS - 1000),
    }
    await sessionStore.updateState(created.value.id, staleState)

    broadcast.subscribe(created.value.id, (e) => events.push(e))

    const scheduler = new HandoffTimeoutScheduler(sessionStore, broadcast)
    await scheduler.tick()

    const reload = await sessionStore.getSession(created.value.id)
    expect(reload.ok && reload.value.state.status).toBe('active_ai')
    const stateChange = events.find((e) => (e as { type: string }).type === 'state_changed')
    expect(stateChange).toBeDefined()
  })

  it('leaves fresh handoff_requested sessions alone', async () => {
    const sessionStore = new MemorySessionStore()
    const broadcast = new InProcessSseHub()
    const created = await sessionStore.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    if (!created.ok) throw new Error('seed')
    const freshState: ConversationState = {
      status: 'handoff_requested',
      reason: { kind: 'visitor_intent', phrase: 'help' },
      requestedAt: new Date(),  // just now
    }
    await sessionStore.updateState(created.value.id, freshState)

    const scheduler = new HandoffTimeoutScheduler(sessionStore, broadcast)
    await scheduler.tick()

    const reload = await sessionStore.getSession(created.value.id)
    expect(reload.ok && reload.value.state.status).toBe('handoff_requested')
  })

  it('skips sessions in non-handoff_requested status', async () => {
    const sessionStore = new MemorySessionStore()
    const broadcast = new InProcessSseHub()
    const created = await sessionStore.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    if (!created.ok) throw new Error('seed')
    // session stays in initial active_ai; scheduler must skip
    const scheduler = new HandoffTimeoutScheduler(sessionStore, broadcast)
    await scheduler.tick()
    const reload = await sessionStore.getSession(created.value.id)
    expect(reload.ok && reload.value.state.status).toBe('active_ai')
  })

  it('handles race: another claim wins between listSessions and updateStateIf', async () => {
    const sessionStore = new MemorySessionStore()
    const broadcast = new InProcessSseHub()
    const created = await sessionStore.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    if (!created.ok) throw new Error('seed')
    const staleState: ConversationState = {
      status: 'handoff_requested',
      reason: { kind: 'visitor_intent', phrase: 'help' },
      requestedAt: new Date(Date.now() - HANDOFF_TIMEOUT_MS - 1000),
    }
    await sessionStore.updateState(created.value.id, staleState)

    // Spy on updateStateIf to simulate a race: the admin claimed between list and update
    const originalUpdateStateIf = sessionStore.updateStateIf.bind(sessionStore)
    const spy = vi.spyOn(sessionStore, 'updateStateIf').mockImplementation(async (id, expected, next) => {
      // Simulate that the state changed externally (admin claimed)
      if (expected === 'handoff_requested') {
        // Emulate a successful claim happening just before our update
        await originalUpdateStateIf(id, 'handoff_requested', { status: 'active_operator', operatorId: 'admin-1' as never, claimedAt: new Date() })
      }
      // Now our updateStateIf with expected='handoff_requested' should return updated=false
      return originalUpdateStateIf(id, expected, next)
    })

    const scheduler = new HandoffTimeoutScheduler(sessionStore, broadcast)
    await scheduler.tick()

    const reload = await sessionStore.getSession(created.value.id)
    // Session should be active_operator, NOT active_ai (the race winner stays)
    expect(reload.ok && reload.value.state.status).toBe('active_operator')
    spy.mockRestore()
  })

  it('start/stop is idempotent', () => {
    const sessionStore = new MemorySessionStore()
    const broadcast = new InProcessSseHub()
    const scheduler = new HandoffTimeoutScheduler(sessionStore, broadcast, undefined, 60_000)
    scheduler.start()
    scheduler.start()  // no-op second call
    scheduler.stop()
    scheduler.stop()  // no-op
  })
})
