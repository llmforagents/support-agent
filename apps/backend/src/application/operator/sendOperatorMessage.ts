import { Ok, Err, type Result, type AppError, type SessionId, type AdminId, UsdCents, MAX_VISITOR_MESSAGE_LEN } from '@support/shared'
import type { SessionStorePort, BroadcastPort } from '../ports'

export type SendOperatorMessageDeps = Readonly<{
  sessionStore: SessionStorePort
  broadcast: BroadcastPort
}>

export async function sendOperatorMessage(
  deps: SendOperatorMessageDeps,
  input: { sessionId: SessionId; operatorId: AdminId; content: string },
): Promise<Result<void, AppError>> {
  if (input.content.length > MAX_VISITOR_MESSAGE_LEN) {
    return Err({ kind: 'infra_unexpected', cause: 'operator message too long' })
  }

  const sess = await deps.sessionStore.getSession(input.sessionId)
  if (!sess.ok) return sess

  if (sess.value.state.status !== 'active_operator') {
    return Err({ kind: 'invalid_state_transition', from: sess.value.state.status, to: 'send_operator_message' })
  }

  if (sess.value.state.operatorId !== input.operatorId) {
    return Err({ kind: 'session_already_claimed', operatorId: sess.value.state.operatorId })
  }

  const msg = await deps.sessionStore.appendMessage({
    sessionId: input.sessionId,
    role: 'operator',
    content: input.content,
    costCents: UsdCents(0),
  })
  if (!msg.ok) return msg

  deps.broadcast.publish(input.sessionId, { type: 'message', message: msg.value })

  return Ok(undefined)
}
