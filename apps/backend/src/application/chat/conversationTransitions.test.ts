import { describe, it, expect } from 'vitest'
import { AdminId } from '@support/shared'
import type { ConversationState, HandoffReason } from '../../domain/conversation'
import {
  requestHandoff,
  claimByOperator,
  releaseToAi,
  reactivateAi,
  timeoutRevert,
  closeConversation,
} from './conversationTransitions'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const operatorId = AdminId('00000000-0000-0000-0000-000000000001')
const operatorId2 = AdminId('00000000-0000-0000-0000-000000000002')

const reason: HandoffReason = {
  kind: 'ai_decision',
  toolReason: 'User requested human help',
  category: 'user_request',
}

const stateActiveAi: ConversationState = { status: 'active_ai' }
const stateHandoffRequested: ConversationState = { status: 'handoff_requested', reason, requestedAt: new Date() }
const stateActiveOperator: ConversationState = { status: 'active_operator', operatorId, claimedAt: new Date() }
const stateReleasedToAi: ConversationState = { status: 'released_to_ai', releasedAt: new Date() }
const stateClosed: ConversationState = { status: 'closed', closedBy: 'admin', closedAt: new Date() }

// ── requestHandoff ────────────────────────────────────────────────────────────

describe('requestHandoff', () => {
  it('succeeds from active_ai', () => {
    const result = requestHandoff(stateActiveAi, reason)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.next.status).toBe('handoff_requested')
    if (result.next.status !== 'handoff_requested') return
    expect(result.next.reason).toBe(reason)
    expect(result.next.requestedAt).toBeInstanceOf(Date)
  })

  it('succeeds from released_to_ai', () => {
    const result = requestHandoff(stateReleasedToAi, reason)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.next.status).toBe('handoff_requested')
  })

  it('fails from handoff_requested', () => {
    const result = requestHandoff(stateHandoffRequested, reason)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid_transition')
    expect(result.from).toBe('handoff_requested')
    expect(result.to).toBe('handoff_requested')
  })

  it('fails from active_operator', () => {
    const result = requestHandoff(stateActiveOperator, reason)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.from).toBe('active_operator')
  })

  it('fails from closed', () => {
    const result = requestHandoff(stateClosed, reason)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.from).toBe('closed')
  })
})

// ── claimByOperator ───────────────────────────────────────────────────────────

describe('claimByOperator', () => {
  it('succeeds from handoff_requested', () => {
    const result = claimByOperator(stateHandoffRequested, operatorId)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.next.status).toBe('active_operator')
    if (result.next.status !== 'active_operator') return
    expect(result.next.operatorId).toBe(operatorId)
    expect(result.next.claimedAt).toBeInstanceOf(Date)
  })

  it('carries different operatorId correctly', () => {
    const result = claimByOperator(stateHandoffRequested, operatorId2)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    if (result.next.status !== 'active_operator') return
    expect(result.next.operatorId).toBe(operatorId2)
  })

  it('fails from active_ai', () => {
    const result = claimByOperator(stateActiveAi, operatorId)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.from).toBe('active_ai')
    expect(result.to).toBe('active_operator')
  })

  it('fails from active_operator', () => {
    const result = claimByOperator(stateActiveOperator, operatorId)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.from).toBe('active_operator')
  })

  it('fails from released_to_ai', () => {
    const result = claimByOperator(stateReleasedToAi, operatorId)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.from).toBe('released_to_ai')
  })

  it('fails from closed', () => {
    const result = claimByOperator(stateClosed, operatorId)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.from).toBe('closed')
  })
})

// ── releaseToAi ───────────────────────────────────────────────────────────────

describe('releaseToAi', () => {
  it('succeeds from active_operator', () => {
    const result = releaseToAi(stateActiveOperator)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.next.status).toBe('released_to_ai')
    if (result.next.status !== 'released_to_ai') return
    expect(result.next.releasedAt).toBeInstanceOf(Date)
  })

  it('fails from active_ai', () => {
    const result = releaseToAi(stateActiveAi)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.from).toBe('active_ai')
    expect(result.to).toBe('released_to_ai')
  })

  it('fails from handoff_requested', () => {
    const result = releaseToAi(stateHandoffRequested)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.from).toBe('handoff_requested')
  })

  it('fails from released_to_ai', () => {
    const result = releaseToAi(stateReleasedToAi)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.from).toBe('released_to_ai')
  })

  it('fails from closed', () => {
    const result = releaseToAi(stateClosed)
    expect(result.ok).toBe(false)
  })
})

// ── reactivateAi ──────────────────────────────────────────────────────────────

describe('reactivateAi', () => {
  it('succeeds from released_to_ai', () => {
    const result = reactivateAi(stateReleasedToAi)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.next.status).toBe('active_ai')
  })

  it('fails from active_ai', () => {
    const result = reactivateAi(stateActiveAi)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.from).toBe('active_ai')
    expect(result.to).toBe('active_ai')
  })

  it('fails from handoff_requested', () => {
    const result = reactivateAi(stateHandoffRequested)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.from).toBe('handoff_requested')
  })

  it('fails from active_operator', () => {
    const result = reactivateAi(stateActiveOperator)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.from).toBe('active_operator')
  })

  it('fails from closed', () => {
    const result = reactivateAi(stateClosed)
    expect(result.ok).toBe(false)
  })
})

// ── timeoutRevert ─────────────────────────────────────────────────────────────

describe('timeoutRevert', () => {
  it('succeeds from handoff_requested', () => {
    const result = timeoutRevert(stateHandoffRequested)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.next.status).toBe('active_ai')
  })

  it('fails from active_ai', () => {
    const result = timeoutRevert(stateActiveAi)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.from).toBe('active_ai')
    expect(result.to).toBe('active_ai')
  })

  it('fails from active_operator', () => {
    const result = timeoutRevert(stateActiveOperator)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.from).toBe('active_operator')
  })

  it('fails from released_to_ai', () => {
    const result = timeoutRevert(stateReleasedToAi)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.from).toBe('released_to_ai')
  })

  it('fails from closed', () => {
    const result = timeoutRevert(stateClosed)
    expect(result.ok).toBe(false)
  })
})

// ── closeConversation ─────────────────────────────────────────────────────────

describe('closeConversation', () => {
  it('succeeds from active_ai closed by admin', () => {
    const result = closeConversation(stateActiveAi, 'admin')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.next.status).toBe('closed')
    if (result.next.status !== 'closed') return
    expect(result.next.closedBy).toBe('admin')
    expect(result.next.closedAt).toBeInstanceOf(Date)
  })

  it('succeeds from handoff_requested closed by timeout', () => {
    const result = closeConversation(stateHandoffRequested, 'timeout')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    if (result.next.status !== 'closed') return
    expect(result.next.closedBy).toBe('timeout')
  })

  it('succeeds from active_operator closed by visitor', () => {
    const result = closeConversation(stateActiveOperator, 'visitor')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    if (result.next.status !== 'closed') return
    expect(result.next.closedBy).toBe('visitor')
    expect(result.next.closedAt).toBeInstanceOf(Date)
  })

  it('succeeds from released_to_ai', () => {
    const result = closeConversation(stateReleasedToAi, 'admin')
    expect(result.ok).toBe(true)
  })

  it('fails from already closed (idempotent guard)', () => {
    const result = closeConversation(stateClosed, 'admin')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.from).toBe('closed')
    expect(result.to).toBe('closed')
  })
})
