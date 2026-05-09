import { Ok, Err, type Result, type AppError, type SessionId, type AdminId, UsdCents } from '@support/shared'
import { claimByOperator } from '../chat/conversationTransitions'
import type { SessionStorePort, BroadcastPort } from '../ports'

export type ClaimDeps = Readonly<{
  sessionStore: SessionStorePort
  broadcast: BroadcastPort
}>

export async function claimHandoff(
  deps: ClaimDeps,
  sessionId: SessionId,
  operatorId: AdminId,
): Promise<Result<void, AppError>> {
  const sess = await deps.sessionStore.getSession(sessionId)
  if (!sess.ok) return sess

  const trans = claimByOperator(sess.value.state, operatorId)
  if (!trans.ok) {
    if (sess.value.state.status === 'active_operator') {
      return Err({ kind: 'session_already_claimed', operatorId: sess.value.state.operatorId })
    }
    return Err({ kind: 'invalid_state_transition', from: trans.from, to: trans.to })
  }

  // Atomic conditional update — only succeeds if state is still handoff_requested
  const upd = await deps.sessionStore.updateStateIf(sessionId, 'handoff_requested', trans.next)
  if (!upd.ok) return upd

  if (!upd.value.updated) {
    // Someone else claimed it between our read and our write — re-read to report who
    const reload = await deps.sessionStore.getSession(sessionId)
    if (reload.ok && reload.value.state.status === 'active_operator') {
      return Err({ kind: 'session_already_claimed', operatorId: reload.value.state.operatorId })
    }
    return Err({ kind: 'invalid_state_transition', from: 'unknown', to: 'active_operator' })
  }

  await deps.sessionStore.appendMessage({
    sessionId,
    role: 'system_event',
    content: 'Operador conectado.',
    costCents: UsdCents(0),
  })

  deps.broadcast.publish(sessionId, { type: 'state_changed', from: sess.value.state, to: trans.next })
  deps.broadcast.publish('admin_inbox', { type: 'session_claimed', sessionId, operatorId })

  return Ok(undefined)
}
