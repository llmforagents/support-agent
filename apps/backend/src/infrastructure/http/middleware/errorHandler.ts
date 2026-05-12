import type { MiddlewareHandler } from 'hono'
import { ZodError } from 'zod'
import type { AppError } from '@support/shared'

export class AppHttpError extends Error {
  constructor(public readonly appError: AppError) {
    super(appError.kind)
  }
}

type HttpResponse = { status: number; body: { error: string; kind: string; detail?: unknown } }

function toHttpResponse(e: AppError): HttpResponse {
  switch (e.kind) {
    case 'auth_invalid_credentials':  return { status: 401, body: { error: 'invalid_credentials', kind: e.kind } }
    case 'auth_session_expired':      return { status: 401, body: { error: 'session_expired', kind: e.kind } }
    case 'auth_no_session':           return { status: 401, body: { error: 'no_session', kind: e.kind } }
    case 'auth_already_onboarded':    return { status: 409, body: { error: 'already_onboarded', kind: e.kind } }
    case 'auth_rate_limited':         return { status: 429, body: { error: 'rate_limited', kind: e.kind, detail: { retryAfterSec: e.retryAfterSec } } }
    case 'session_not_found':         return { status: 404, body: { error: 'session_not_found', kind: e.kind } }
    case 'session_closed':            return { status: 410, body: { error: 'session_closed', kind: e.kind } }
    case 'invalid_state_transition':  return { status: 409, body: { error: 'invalid_state_transition', kind: e.kind, detail: { from: e.from, to: e.to } } }
    case 'session_already_claimed':   return { status: 409, body: { error: 'already_claimed', kind: e.kind, detail: { operatorId: e.operatorId } } }
    case 'llm_insufficient_balance':  return { status: 402, body: { error: 'insufficient_balance', kind: e.kind } }
    case 'llm_unavailable':           return { status: 502, body: { error: 'llm_unavailable', kind: e.kind } }
    case 'llm_invalid_response':      return { status: 502, body: { error: 'llm_invalid_response', kind: e.kind } }
    case 'rate_limit_exceeded':       return { status: 429, body: { error: 'rate_limited', kind: e.kind, detail: { retryAfterSec: e.retryAfterSec } } }
    case 'infra_db_error':            return { status: 500, body: { error: 'database_error', kind: e.kind } }
    case 'infra_unexpected':          return { status: 500, body: { error: 'internal_error', kind: e.kind } }
    case 'pdf_encrypted':             return { status: 422, body: { error: 'pdf_encrypted', kind: e.kind } }
    case 'pdf_parse_failed':          return { status: 422, body: { error: 'pdf_parse_failed', kind: e.kind } }
    case 'embedding_provider_failed': return { status: 502, body: { error: 'embedder_unavailable', kind: e.kind } }
    case 'chunk_too_large':           return { status: 422, body: { error: 'chunk_too_large', kind: e.kind, detail: { chunkIndex: e.chunkIndex, tokens: e.tokens } } }
    case 'unsupported_file_type':     return { status: 415, body: { error: 'unsupported_file_type', kind: e.kind, detail: { mime: e.mime } } }
    case 'file_read_failed':          return { status: 500, body: { error: 'file_read_failed', kind: e.kind } }
    case 'source_not_found':          return { status: 404, body: { error: 'source_not_found', kind: e.kind } }
    case 'source_invalid_state':      return { status: 409, body: { error: 'source_invalid_state', kind: e.kind, detail: { current: e.current, required: e.required } } }
    case 'mysql_unsafe_query':        return { status: 422, body: { error: 'mysql_unsafe_query', kind: e.kind, detail: { reason: e.reason } } }
    case 'mysql_query_timeout':       return { status: 504, body: { error: 'mysql_query_timeout', kind: e.kind, detail: { timeoutMs: e.timeoutMs } } }
    case 'mysql_connection_refused':  return { status: 502, body: { error: 'mysql_connection_refused', kind: e.kind, detail: { host: e.host } } }
  }
}

interface PinoLike { error(...args: unknown[]): void; warn(...args: unknown[]): void }

export function errorHandler(): MiddlewareHandler {
  return async (c, next) => {
    await next()

    const err = c.error
    if (!err) return

    const log = c.get('logger') as PinoLike | undefined
    const requestId = c.get('requestId') as string | undefined

    if (err instanceof AppHttpError) {
      const r = toHttpResponse(err.appError)
      if (r.status >= 500) log?.error({ requestId, kind: err.appError.kind, err }, 'app error 5xx')
      else log?.warn?.({ requestId, kind: err.appError.kind }, 'app error')
      // c.res must be set directly to override Hono's default error handler
      c.res = c.json(r.body, r.status as 400 | 401 | 402 | 403 | 404 | 409 | 410 | 415 | 422 | 429 | 500 | 502 | 504)
      return
    }

    if (err instanceof ZodError) {
      // Bare `.parse(body)` calls inside route handlers throw ZodError when the
      // body shape is wrong. Surface this as a clean 400 instead of bubbling up
      // to a generic 500. The frontend can render the issues array if useful.
      log?.warn?.({ requestId, issues: err.issues }, 'bad request body')
      c.res = c.json({ error: 'bad_request', kind: 'validation_error', detail: { issues: err.issues } }, 400)
      return
    }

    log?.error({ requestId, err }, 'unhandled error')
    // No logger? Fall back to console for boot-time errors before middleware is wired.
    if (!log) console.error('[unhandled error]', err)
    c.res = c.json({ error: 'internal_error', kind: 'infra_unexpected' }, 500)
  }
}
