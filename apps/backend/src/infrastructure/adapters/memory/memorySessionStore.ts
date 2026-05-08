import { randomUUID } from 'node:crypto'
import { Ok, Err, type Result, type AppError, SessionId, MessageId, UsdCents } from '@support/shared'
import type { ConversationState, Message, MessageRagHit, Session } from '../../../domain/conversation'
import type { SessionStorePort } from '../../../application/ports'

export class MemorySessionStore implements SessionStorePort {
  private sessions = new Map<string, Session>()
  private messages = new Map<string, Message[]>()

  createSession(input: { visitorId: Session['visitorId']; visitorMeta: Session['visitorMeta'] }): Promise<Result<Session, AppError>> {
    const id = SessionId(randomUUID())
    const now = new Date()
    const s: Session = {
      id, visitorId: input.visitorId, state: { status: 'active_ai' },
      visitorMeta: input.visitorMeta, totalCostCents: UsdCents(0),
      createdAt: now, lastActivityAt: now,
    }
    this.sessions.set(id, s)
    this.messages.set(id, [])
    return Promise.resolve(Ok(s))
  }

  getSession(id: SessionId): Promise<Result<Session, AppError>> {
    const s = this.sessions.get(id)
    if (!s) return Promise.resolve(Err({ kind: 'session_not_found', sessionId: id }))
    return Promise.resolve(Ok(s))
  }

  updateState(id: SessionId, state: ConversationState): Promise<Result<void, AppError>> {
    const s = this.sessions.get(id)
    if (!s) return Promise.resolve(Err({ kind: 'session_not_found', sessionId: id }))
    this.sessions.set(id, { ...s, state })
    return Promise.resolve(Ok(undefined))
  }

  appendMessage(input: { sessionId: SessionId; role: Message['role']; content: string; costCents: UsdCents }): Promise<Result<Message, AppError>> {
    return this.appendMessageWithId({ id: MessageId(randomUUID()), ...input })
  }

  appendMessageWithId(input: { id: MessageId; sessionId: SessionId; role: Message['role']; content: string; costCents: UsdCents; ragHits?: ReadonlyArray<MessageRagHit> }): Promise<Result<Message, AppError>> {
    const list = this.messages.get(input.sessionId)
    const session = this.sessions.get(input.sessionId)
    if (!list || !session) return Promise.resolve(Err({ kind: 'session_not_found', sessionId: input.sessionId }))
    const m: Message = {
      id: input.id, sessionId: input.sessionId, role: input.role,
      content: input.content, costCents: input.costCents, createdAt: new Date(),
      ...(input.ragHits !== undefined && input.ragHits.length > 0 ? { ragHits: input.ragHits } : {}),
    }
    list.push(m)
    this.sessions.set(input.sessionId, { ...session, totalCostCents: UsdCents(session.totalCostCents + input.costCents), lastActivityAt: new Date() })
    return Promise.resolve(Ok(m))
  }

  listMessages(id: SessionId, opts: { limit: number; afterId?: MessageId }): Promise<Result<readonly Message[], AppError>> {
    const list = this.messages.get(id) ?? []
    const start = opts.afterId ? list.findIndex((m) => m.id === opts.afterId) + 1 : 0
    return Promise.resolve(Ok(list.slice(start, start + opts.limit)))
  }

  bumpActivity(id: SessionId): Promise<Result<void, AppError>> {
    const s = this.sessions.get(id)
    if (s) this.sessions.set(id, { ...s, lastActivityAt: new Date() })
    return Promise.resolve(Ok(undefined))
  }

  close(id: SessionId, by: 'admin' | 'visitor' | 'timeout'): Promise<Result<void, AppError>> {
    const s = this.sessions.get(id)
    if (!s) return Promise.resolve(Err({ kind: 'session_not_found', sessionId: id }))
    const now = new Date()
    this.sessions.set(id, { ...s, closedAt: now, state: { status: 'closed', closedBy: by, closedAt: now } })
    return Promise.resolve(Ok(undefined))
  }
}
