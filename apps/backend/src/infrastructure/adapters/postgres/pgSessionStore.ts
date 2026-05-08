import { randomUUID } from 'node:crypto'
import { Ok, Err, type Result, type AppError, SessionId, MessageId, VisitorId, UsdCents, ChunkId, SourceId } from '@support/shared'
import type { ConversationState, Message, MessageRagHit, Session } from '../../../domain/conversation'
import type { SessionStorePort } from '../../../application/ports'
import type { PgPool } from './pool'

type SRow = { id: string; visitor_id: string; state: ConversationState; visitor_meta: Session['visitorMeta']; total_cost_cents: number; created_at: Date; last_activity_at: Date; closed_at: Date | null }
type MRow = { id: string; session_id: string; role: Message['role']; content: string; cost_cents: number; created_at: Date; rag_hits: Array<{ id: string; sourceId: string; score: number }> | null }

function rowToSession(r: SRow): Session {
  return {
    id: SessionId(r.id), visitorId: VisitorId(r.visitor_id), state: r.state,
    visitorMeta: r.visitor_meta, totalCostCents: UsdCents(r.total_cost_cents),
    createdAt: r.created_at, lastActivityAt: r.last_activity_at,
    ...(r.closed_at !== null ? { closedAt: r.closed_at } : {}),
  }
}
function rowToMessage(r: MRow): Message {
  const ragHits: ReadonlyArray<MessageRagHit> | undefined =
    r.rag_hits && r.rag_hits.length > 0
      ? r.rag_hits.map((h) => ({ id: ChunkId(h.id), sourceId: SourceId(h.sourceId), score: h.score }))
      : undefined
  return {
    id: MessageId(r.id), sessionId: SessionId(r.session_id),
    role: r.role, content: r.content,
    costCents: UsdCents(r.cost_cents), createdAt: r.created_at,
    ...(ragHits !== undefined ? { ragHits } : {}),
  }
}

export class PgSessionStore implements SessionStorePort {
  constructor(private readonly pool: PgPool) {}

  async createSession(input: { visitorId: ReturnType<typeof VisitorId>; visitorMeta: Session['visitorMeta'] }): Promise<Result<Session, AppError>> {
    const id = randomUUID()
    const initialState: ConversationState = { status: 'active_ai' }
    try {
      const r = await this.pool.query<SRow>(
        `INSERT INTO sessions (id, visitor_id, state, visitor_meta) VALUES ($1, $2, $3::jsonb, $4::jsonb)
         RETURNING id, visitor_id, state, visitor_meta, total_cost_cents, created_at, last_activity_at, closed_at`,
        [id, input.visitorId, JSON.stringify(initialState), JSON.stringify(input.visitorMeta)],
      )
      const row = r.rows[0]
      if (!row) return Err({ kind: 'infra_db_error', cause: 'no row' })
      return Ok(rowToSession(row))
    } catch (err) { return Err({ kind: 'infra_db_error', cause: String(err) }) }
  }

  async getSession(id: SessionId): Promise<Result<Session, AppError>> {
    try {
      const r = await this.pool.query<SRow>(`SELECT id, visitor_id, state, visitor_meta, total_cost_cents, created_at, last_activity_at, closed_at FROM sessions WHERE id = $1`, [id])
      const row = r.rows[0]
      if (!row) return Err({ kind: 'session_not_found', sessionId: id })
      return Ok(rowToSession(row))
    } catch (err) { return Err({ kind: 'infra_db_error', cause: String(err) }) }
  }

  async updateState(id: SessionId, state: ConversationState): Promise<Result<void, AppError>> {
    try {
      const r = await this.pool.query(`UPDATE sessions SET state = $1::jsonb, last_activity_at = NOW() WHERE id = $2`, [JSON.stringify(state), id])
      if (r.rowCount === 0) return Err({ kind: 'session_not_found', sessionId: id })
      return Ok(undefined)
    } catch (err) { return Err({ kind: 'infra_db_error', cause: String(err) }) }
  }

  appendMessage(input: { sessionId: SessionId; role: Message['role']; content: string; costCents: UsdCents }): Promise<Result<Message, AppError>> {
    return this.appendMessageWithId({ id: MessageId(randomUUID()), ...input })
  }

  async appendMessageWithId(input: { id: MessageId; sessionId: SessionId; role: Message['role']; content: string; costCents: UsdCents; ragHits?: ReadonlyArray<MessageRagHit> }): Promise<Result<Message, AppError>> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const ragHitsJson = input.ragHits && input.ragHits.length > 0
        ? JSON.stringify(input.ragHits.map((h) => ({ id: h.id, sourceId: h.sourceId, score: h.score })))
        : null
      const r = await client.query<MRow>(
        `INSERT INTO messages (id, session_id, role, content, cost_cents, rag_hits) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING id, session_id, role, content, cost_cents, created_at, rag_hits`,
        [input.id, input.sessionId, input.role, input.content, input.costCents, ragHitsJson],
      )
      await client.query(
        `UPDATE sessions SET last_activity_at = NOW(), total_cost_cents = total_cost_cents + $1 WHERE id = $2`,
        [input.costCents, input.sessionId],
      )
      await client.query('COMMIT')
      const row = r.rows[0]
      if (!row) return Err({ kind: 'infra_db_error', cause: 'no row' })
      return Ok(rowToMessage(row))
    } catch (err) {
      try { await client.query('ROLLBACK') } catch { /* noop */ }
      return Err({ kind: 'infra_db_error', cause: String(err) })
    } finally {
      client.release()
    }
  }

  async listMessages(id: SessionId, opts: { limit: number; afterId?: MessageId }): Promise<Result<readonly Message[], AppError>> {
    try {
      const baseSql = `SELECT id, session_id, role, content, cost_cents, created_at, rag_hits FROM messages WHERE session_id = $1`
      let r
      if (opts.afterId) {
        r = await this.pool.query<MRow>(
          `${baseSql} AND (created_at, id) > (
              (SELECT created_at FROM messages WHERE id = $2),
              $2::uuid
            ) ORDER BY created_at, id LIMIT $3`,
          [id, opts.afterId, opts.limit],
        )
      } else {
        r = await this.pool.query<MRow>(`${baseSql} ORDER BY created_at, id LIMIT $2`, [id, opts.limit])
      }
      return Ok(r.rows.map(rowToMessage))
    } catch (err) { return Err({ kind: 'infra_db_error', cause: String(err) }) }
  }

  async bumpActivity(id: SessionId): Promise<Result<void, AppError>> {
    try {
      await this.pool.query(`UPDATE sessions SET last_activity_at = NOW() WHERE id = $1`, [id])
      return Ok(undefined)
    } catch (err) { return Err({ kind: 'infra_db_error', cause: String(err) }) }
  }

  async close(id: SessionId, by: 'admin' | 'visitor' | 'timeout'): Promise<Result<void, AppError>> {
    const closedState: ConversationState = { status: 'closed', closedBy: by, closedAt: new Date() }
    try {
      await this.pool.query(`UPDATE sessions SET state = $1::jsonb, closed_at = NOW() WHERE id = $2`, [JSON.stringify(closedState), id])
      return Ok(undefined)
    } catch (err) { return Err({ kind: 'infra_db_error', cause: String(err) }) }
  }
}
