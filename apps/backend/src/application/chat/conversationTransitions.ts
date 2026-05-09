import type { ConversationState, HandoffReason } from '../../domain/conversation'
import type { AdminId } from '@support/shared'

export type TransitionResult =
  | { ok: true; next: ConversationState }
  | { ok: false; reason: 'invalid_transition'; from: ConversationState['status']; to: string }

export function requestHandoff(state: ConversationState, reason: HandoffReason): TransitionResult {
  if (state.status !== 'active_ai' && state.status !== 'released_to_ai') {
    return { ok: false, reason: 'invalid_transition', from: state.status, to: 'handoff_requested' }
  }
  return { ok: true, next: { status: 'handoff_requested', reason, requestedAt: new Date() } }
}

export function claimByOperator(state: ConversationState, operatorId: AdminId): TransitionResult {
  if (state.status !== 'handoff_requested') {
    return { ok: false, reason: 'invalid_transition', from: state.status, to: 'active_operator' }
  }
  return { ok: true, next: { status: 'active_operator', operatorId, claimedAt: new Date() } }
}

export function releaseToAi(state: ConversationState): TransitionResult {
  if (state.status !== 'active_operator') {
    return { ok: false, reason: 'invalid_transition', from: state.status, to: 'released_to_ai' }
  }
  return { ok: true, next: { status: 'released_to_ai', releasedAt: new Date() } }
}

export function reactivateAi(state: ConversationState): TransitionResult {
  if (state.status !== 'released_to_ai') {
    return { ok: false, reason: 'invalid_transition', from: state.status, to: 'active_ai' }
  }
  return { ok: true, next: { status: 'active_ai' } }
}

export function timeoutRevert(state: ConversationState): TransitionResult {
  if (state.status !== 'handoff_requested') {
    return { ok: false, reason: 'invalid_transition', from: state.status, to: 'active_ai' }
  }
  return { ok: true, next: { status: 'active_ai' } }
}

export function closeConversation(state: ConversationState, by: 'admin' | 'visitor' | 'timeout'): TransitionResult {
  if (state.status === 'closed') {
    return { ok: false, reason: 'invalid_transition', from: state.status, to: 'closed' }
  }
  return { ok: true, next: { status: 'closed', closedBy: by, closedAt: new Date() } }
}
