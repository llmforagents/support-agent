// D1 implementation of SessionStorePort. Mirrors PgSessionStore semantics
// with two D1-specific accommodations:
//
//   1. JSON-status indexing. D1/SQLite has no JSON expression indexes, so
//      the schema (migration 0003) carries a denormalised `status_kind`
//      column with a partial index. EVERY write that mutates `state` must
//      also update `status_kind` in the SAME UPDATE — that's how the inbox
//      query (`WHERE status_kind = 'handoff_requested'`) stays cheap.
//      Reads that filter by status use `status_kind` (not `state->>'status'`).
//
//   2. JSON columns are TEXT. `state`, `visitor_meta`, and `rag_hits` are
//      stored as JSON strings. Reads go through `safeJsonParse` so a
//      malformed row surfaces as `infra_db_error` rather than throwing.
//
// Errors map to `infra_db_error` and `session_not_found` to mirror
// PgSessionStore — no new error kinds are introduced.
//
// Date columns (`created_at`, `last_activity_at`, `closed_at`) use SQLite's
// native `datetime('now')` format via the shared helpers in `./dateUtils.ts`.
import { randomUUID } from 'node:crypto'
import {
  Ok,
  Err,
  type Result,
  type AppError,
  SessionId,
  MessageId,
  VisitorId,
  UsdCents,
  ChunkId,
  SourceId,
} from '@support/shared'
import type {
  ConversationState,
  Message,
  MessageRagHit,
  Session,
} from '../../../domain/conversation'
import type { SessionStorePort } from '../../../application/ports'
import { parseSqliteDatetime } from './dateUtils'

type SRow = Readonly<{
  id: string
  visitor_id: string
  state: string
  visitor_meta: string
  total_cost_cents: number
  created_at: string
  last_activity_at: string
  closed_at: string | null
}>

type MRow = Readonly<{
  id: string
  session_id: string
  role: Message['role']
  content: string
  cost_cents: number
  created_at: string
  rag_hits: string | null
}>

type RagHitJson = Readonly<{ id: string; sourceId: string; score: number }>

function safeJsonParse<T>(raw: string, label: string): Result<T, AppError> {
  try {
    return Ok(JSON.parse(raw) as T)
  } catch (err) {
    return Err({ kind: 'infra_db_error', cause: `${label} json malformed: ${String(err)}` })
  }
}

function rowToSession(r: SRow): Result<Session, AppError> {
  const stateRes = safeJsonParse<ConversationState>(r.state, 'state')
  if (!stateRes.ok) return stateRes
  const metaRes = safeJsonParse<Session['visitorMeta']>(r.visitor_meta, 'visitor_meta')
  if (!metaRes.ok) return metaRes
  const session: Session = {
    id: SessionId(r.id),
    visitorId: VisitorId(r.visitor_id),
    state: stateRes.value,
    visitorMeta: metaRes.value,
    totalCostCents: UsdCents(r.total_cost_cents),
    createdAt: parseSqliteDatetime(r.created_at),
    lastActivityAt: parseSqliteDatetime(r.last_activity_at),
    ...(r.closed_at !== null ? { closedAt: parseSqliteDatetime(r.closed_at) } : {}),
  }
  return Ok(session)
}

function rowToMessage(r: MRow): Result<Message, AppError> {
  let ragHits: ReadonlyArray<MessageRagHit> | undefined
  if (r.rag_hits !== null && r.rag_hits.length > 0) {
    const parsed = safeJsonParse<readonly RagHitJson[]>(r.rag_hits, 'rag_hits')
    if (!parsed.ok) return parsed
    if (parsed.value.length > 0) {
      ragHits = parsed.value.map((h) => ({
        id: ChunkId(h.id),
        sourceId: SourceId(h.sourceId),
        score: h.score,
      }))
    }
  }
  const msg: Message = {
    id: MessageId(r.id),
    sessionId: SessionId(r.session_id),
    role: r.role,
    content: r.content,
    costCents: UsdCents(r.cost_cents),
    createdAt: parseSqliteDatetime(r.created_at),
    ...(ragHits !== undefined ? { ragHits } : {}),
  }
  return Ok(msg)
}

export class D1SessionStore implements SessionStorePort {
  constructor(private readonly db: D1Database) {}

  async createSession(input: {
    visitorId: VisitorId
    visitorMeta: Session['visitorMeta']
  }): Promise<Result<Session, AppError>> {
    const id = randomUUID()
    const initialState: ConversationState = { status: 'active_ai' }
    try {
      const r = await this.db
        .prepare(
          `INSERT INTO sessions (id, visitor_id, state, status_kind, visitor_meta)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          input.visitorId,
          JSON.stringify(initialState),
          initialState.status,
          JSON.stringify(input.visitorMeta),
        )
        .run()
      if (!r.success) {
        return Err({ kind: 'infra_db_error', cause: r.error ?? 'd1 insert failed' })
      }
      return this.getSession(SessionId(id))
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async getSession(id: SessionId): Promise<Result<Session, AppError>> {
    try {
      const row = await this.db
        .prepare(
          `SELECT id, visitor_id, state, visitor_meta, total_cost_cents,
                  created_at, last_activity_at, closed_at
           FROM sessions WHERE id = ?`,
        )
        .bind(id)
        .first<SRow>()
      if (!row) return Err({ kind: 'session_not_found', sessionId: id })
      return rowToSession(row)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async updateState(id: SessionId, state: ConversationState): Promise<Result<void, AppError>> {
    try {
      // `state` and `status_kind` MUST move atomically — the inbox index
      // is on `status_kind`, so any drift would mis-route handoff queries.
      const r = await this.db
        .prepare(
          `UPDATE sessions
           SET state = ?, status_kind = ?, last_activity_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(JSON.stringify(state), state.status, id)
        .run()
      if (!r.success) {
        return Err({ kind: 'infra_db_error', cause: r.error ?? 'd1 update failed' })
      }
      if ((r.meta?.changes ?? 0) === 0) {
        return Err({ kind: 'session_not_found', sessionId: id })
      }
      return Ok(undefined)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async updateStateIf(
    id: SessionId,
    expectedStatus: ConversationState['status'],
    next: ConversationState,
  ): Promise<Result<{ updated: boolean }, AppError>> {
    try {
      // CAS guard: filter on the indexed `status_kind` column. If the row's
      // current status has drifted (e.g. another operator already claimed),
      // the WHERE clause excludes it and we return `updated: false`.
      // Same UPDATE writes the new `state` JSON + `status_kind`.
      const r = await this.db
        .prepare(
          `UPDATE sessions
           SET state = ?, status_kind = ?, last_activity_at = datetime('now')
           WHERE id = ? AND status_kind = ?`,
        )
        .bind(JSON.stringify(next), next.status, id, expectedStatus)
        .run()
      if (!r.success) {
        return Err({ kind: 'infra_db_error', cause: r.error ?? 'd1 update failed' })
      }
      return Ok({ updated: (r.meta?.changes ?? 0) > 0 })
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async listSessions(opts: {
    status?: ConversationState['status']
    limit: number
    cursor?: SessionId
  }): Promise<Result<readonly Session[], AppError>> {
    try {
      // Filter via `status_kind` (indexed) — never `json_extract(state,...)`.
      // That's the whole point of the denormalised column.
      const baseSql = `SELECT id, visitor_id, state, visitor_meta, total_cost_cents,
                              created_at, last_activity_at, closed_at
                       FROM sessions`
      const stmt =
        opts.status !== undefined
          ? this.db
              .prepare(`${baseSql} WHERE status_kind = ? ORDER BY last_activity_at DESC LIMIT ?`)
              .bind(opts.status, opts.limit)
          : this.db
              .prepare(`${baseSql} ORDER BY last_activity_at DESC LIMIT ?`)
              .bind(opts.limit)
      const result = await stmt.all<SRow>()
      const sessions: Session[] = []
      for (const row of result.results) {
        const r = rowToSession(row)
        if (!r.ok) return r
        sessions.push(r.value)
      }
      return Ok(sessions)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  appendMessage(input: {
    sessionId: SessionId
    role: Message['role']
    content: string
    costCents: UsdCents
  }): Promise<Result<Message, AppError>> {
    return this.appendMessageWithId({ id: MessageId(randomUUID()), ...input })
  }

  async appendMessageWithId(input: {
    id: MessageId
    sessionId: SessionId
    role: Message['role']
    content: string
    costCents: UsdCents
    ragHits?: ReadonlyArray<MessageRagHit>
  }): Promise<Result<Message, AppError>> {
    const ragHitsJson =
      input.ragHits && input.ragHits.length > 0
        ? JSON.stringify(
            input.ragHits.map((h) => ({ id: h.id, sourceId: h.sourceId, score: h.score })),
          )
        : null
    try {
      // D1 has no multi-statement transactions in the same prepared-statement
      // call, but `batch()` runs atomically per the Workers docs. Two writes:
      //   (1) insert the message
      //   (2) bump last_activity_at + total_cost_cents on the parent session
      const insert = this.db
        .prepare(
          `INSERT INTO messages (id, session_id, role, content, cost_cents, rag_hits)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(input.id, input.sessionId, input.role, input.content, input.costCents, ragHitsJson)
      const bump = this.db
        .prepare(
          `UPDATE sessions
           SET last_activity_at = datetime('now'),
               total_cost_cents = total_cost_cents + ?
           WHERE id = ?`,
        )
        .bind(input.costCents, input.sessionId)
      const [insertRes, bumpRes] = await this.db.batch([insert, bump])
      if (!insertRes?.success) {
        return Err({ kind: 'infra_db_error', cause: insertRes?.error ?? 'd1 insert failed' })
      }
      if (!bumpRes?.success) {
        return Err({ kind: 'infra_db_error', cause: bumpRes?.error ?? 'd1 bump failed' })
      }
      const row = await this.db
        .prepare(
          `SELECT id, session_id, role, content, cost_cents, created_at, rag_hits
           FROM messages WHERE id = ?`,
        )
        .bind(input.id)
        .first<MRow>()
      if (!row) return Err({ kind: 'infra_db_error', cause: 'message row missing after insert' })
      return rowToMessage(row)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async listMessages(
    id: SessionId,
    opts: { limit: number; afterId?: MessageId },
  ): Promise<Result<readonly Message[], AppError>> {
    try {
      const baseSql = `SELECT id, session_id, role, content, cost_cents, created_at, rag_hits
                       FROM messages WHERE session_id = ?`
      // (created_at, id) keyset pagination so duplicate timestamps stay stable.
      // SQLite supports row-value compares.
      const stmt = opts.afterId
        ? this.db
            .prepare(
              `${baseSql} AND (created_at, id) > (
                  (SELECT created_at FROM messages WHERE id = ?), ?
                ) ORDER BY created_at, id LIMIT ?`,
            )
            .bind(id, opts.afterId, opts.afterId, opts.limit)
        : this.db.prepare(`${baseSql} ORDER BY created_at, id LIMIT ?`).bind(id, opts.limit)
      const result = await stmt.all<MRow>()
      const messages: Message[] = []
      for (const row of result.results) {
        const r = rowToMessage(row)
        if (!r.ok) return r
        messages.push(r.value)
      }
      return Ok(messages)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async bumpActivity(id: SessionId): Promise<Result<void, AppError>> {
    try {
      await this.db
        .prepare(`UPDATE sessions SET last_activity_at = datetime('now') WHERE id = ?`)
        .bind(id)
        .run()
      return Ok(undefined)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async close(id: SessionId, by: 'admin' | 'visitor' | 'timeout'): Promise<Result<void, AppError>> {
    const closedState: ConversationState = { status: 'closed', closedBy: by, closedAt: new Date() }
    try {
      // Single UPDATE: state JSON + status_kind + closed_at — keeps the
      // denormalised column in sync with the JSON payload (Pattern: every
      // mutation of `state` must also touch `status_kind`).
      const r = await this.db
        .prepare(
          `UPDATE sessions
           SET state = ?, status_kind = ?, closed_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(JSON.stringify(closedState), closedState.status, id)
        .run()
      if (!r.success) {
        return Err({ kind: 'infra_db_error', cause: r.error ?? 'd1 update failed' })
      }
      return Ok(undefined)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }
}
