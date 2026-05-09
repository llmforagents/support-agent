import { Ok, Err, type Result, type AppError, type SessionId, type AdminId, UsdCents } from '@support/shared'
import { releaseToAi } from '../chat/conversationTransitions'
import type { SessionStorePort, BroadcastPort } from '../ports'

export type ReleaseDeps = Readonly<{
  sessionStore: SessionStorePort
  broadcast: BroadcastPort
}>

export async function releaseSession(
  deps: ReleaseDeps,
  input: { sessionId: SessionId; operatorId: AdminId },
): Promise<Result<void, AppError>> {
  const sess = await deps.sessionStore.getSession(input.sessionId)
  if (!sess.ok) return sess

  if (sess.value.state.status !== 'active_operator') {
    return Err({ kind: 'invalid_state_transition', from: sess.value.state.status, to: 'released_to_ai' })
  }

  if (sess.value.state.operatorId !== input.operatorId) {
    return Err({ kind: 'session_already_claimed', operatorId: sess.value.state.operatorId })
  }

  const trans = releaseToAi(sess.value.state)
  if (!trans.ok) {
    return Err({ kind: 'invalid_state_transition', from: trans.from, to: trans.to })
  }

  const upd = await deps.sessionStore.updateStateIf(input.sessionId, 'active_operator', trans.next)
  if (!upd.ok) return upd
  if (!upd.value.updated) {
    return Err({ kind: 'invalid_state_transition', from: 'unknown', to: 'released_to_ai' })
  }

  await deps.sessionStore.appendMessage({
    sessionId: input.sessionId,
    role: 'system_event',
    content: 'Operador liberó la conversación. El AI continuará.',
    costCents: UsdCents(0),
  })

  deps.broadcast.publish(input.sessionId, { type: 'state_changed', from: sess.value.state, to: trans.next })
  deps.broadcast.publish('admin_inbox', { type: 'session_released', sessionId: input.sessionId })

  return Ok(undefined)
}
