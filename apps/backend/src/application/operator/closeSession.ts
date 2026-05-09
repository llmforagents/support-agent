import { Ok, Err, type Result, type AppError, type SessionId } from '@support/shared'
import { closeConversation } from '../chat/conversationTransitions'
import type { SessionStorePort, BroadcastPort } from '../ports'

export type CloseDeps = Readonly<{
  sessionStore: SessionStorePort
  broadcast: BroadcastPort
}>

export async function closeSession(
  deps: CloseDeps,
  input: { sessionId: SessionId; by: 'admin' | 'visitor' | 'timeout' },
): Promise<Result<void, AppError>> {
  const sess = await deps.sessionStore.getSession(input.sessionId)
  if (!sess.ok) return sess

  // Idempotent: already closed is a no-op
  if (sess.value.state.status === 'closed') return Ok(undefined)

  const trans = closeConversation(sess.value.state, input.by)
  if (!trans.ok) {
    return Err({ kind: 'invalid_state_transition', from: trans.from, to: trans.to })
  }

  const upd = await deps.sessionStore.updateState(input.sessionId, trans.next)
  if (!upd.ok) return upd

  await deps.sessionStore.close(input.sessionId, input.by)

  deps.broadcast.publish(input.sessionId, { type: 'closed', reason: input.by })

  return Ok(undefined)
}
