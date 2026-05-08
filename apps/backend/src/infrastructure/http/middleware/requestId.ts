import type { MiddlewareHandler } from 'hono'
import { ulid } from 'ulid'

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/

export function requestId(): MiddlewareHandler {
  return async (c, next) => {
    const inbound = c.req.header('X-Request-Id')
    const id = inbound && ULID_RE.test(inbound) ? inbound : ulid()
    c.set('requestId', id)
    c.header('X-Request-Id', id)
    await next()
  }
}
