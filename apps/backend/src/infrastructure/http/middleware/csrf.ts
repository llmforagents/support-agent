import type { MiddlewareHandler } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { randomBytes, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'csrf'
const COOKIE_OPTS = (secure: boolean) => ({
  sameSite: 'Lax' as const, path: '/', httpOnly: false, secure,
})

/**
 * Mints the CSRF cookie on idempotent (GET / HEAD) requests if it's missing.
 * Mount globally (e.g. `/v1/admin/*`) so the cookie lands on the client during
 * any read — including `/auth/me` on page load — well before the SPA submits
 * a mutating request.
 *
 * Mutating requests (POST/PUT/DELETE) are intentionally NOT minting: piggy-
 * backing a Set-Cookie onto a /auth/login response would confuse callers that
 * parse Set-Cookie by position (test fixtures, simple HTTP clients).
 */
export function csrfCookie(opts: { secure: boolean }): MiddlewareHandler {
  return async (c, next) => {
    const isSafe = c.req.method === 'GET' || c.req.method === 'HEAD'
    if (isSafe && !getCookie(c, COOKIE_NAME)) {
      setCookie(c, COOKIE_NAME, randomBytes(16).toString('hex'), COOKIE_OPTS(opts.secure))
    }
    return next()
  }
}

/**
 * Validates the X-CSRF-Token header against the existing cookie on mutating
 * requests. Cookie minting is the responsibility of `csrfCookie` — this
 * middleware never sets a cookie, which avoids double Set-Cookie headers
 * when both middlewares are mounted on the same path.
 *
 * Mount only on prefixes that accept mutating requests.
 */
export function csrf(_opts: { secure: boolean }): MiddlewareHandler {
  return async (c, next) => {
    if (!['POST', 'PUT', 'DELETE'].includes(c.req.method)) return next()
    const cookieToken = getCookie(c, COOKIE_NAME)
    if (!cookieToken) {
      return c.json({ error: 'csrf_mismatch', kind: 'auth_no_session' }, 403)
    }
    const header = c.req.header('X-CSRF-Token') ?? ''
    const headerBuf = Buffer.from(header, 'utf8')
    const cookieBuf = Buffer.from(cookieToken, 'utf8')
    if (headerBuf.length !== cookieBuf.length || !timingSafeEqual(headerBuf, cookieBuf)) {
      return c.json({ error: 'csrf_mismatch', kind: 'auth_no_session' }, 403)
    }
    return next()
  }
}
