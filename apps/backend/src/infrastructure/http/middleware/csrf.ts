import type { MiddlewareHandler } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { randomBytes, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'csrf'

export function csrf(opts: { secure: boolean }): MiddlewareHandler {
  return async (c, next) => {
    let cookieToken = getCookie(c, COOKIE_NAME)
    if (!cookieToken) {
      cookieToken = randomBytes(16).toString('hex')
      setCookie(c, COOKIE_NAME, cookieToken, {
        sameSite: 'Lax', path: '/', httpOnly: false, secure: opts.secure,
      })
    }
    if (['POST', 'PUT', 'DELETE'].includes(c.req.method)) {
      const header = c.req.header('X-CSRF-Token') ?? ''
      const headerBuf = Buffer.from(header, 'utf8')
      const cookieBuf = Buffer.from(cookieToken, 'utf8')
      if (headerBuf.length !== cookieBuf.length || !timingSafeEqual(headerBuf, cookieBuf)) {
        return c.json({ error: 'csrf_mismatch', kind: 'auth_no_session' }, 403)
      }
    }
    return next()
  }
}
