import { Hono } from 'hono'
import { setCookie, deleteCookie, getCookie } from 'hono/cookie'
import {
  CreateFirstAdminSchema, LoginSchema, ADMIN_SESSION_TTL_MS, ADMIN_LOGIN_RATE_LIMIT_PER_HOUR,
} from '@support/shared'
import type { Container } from '../../../composition/container'
import type { Context } from 'hono'
import { createFirstAdmin } from '../../../application/auth/createFirstAdmin'
import { login as loginOrch } from '../../../application/auth/login'
import { logout as logoutOrch } from '../../../application/auth/logout'
import { verifySession } from '../../../application/auth/verifySession'
import { AppHttpError } from '../middleware/errorHandler'
import { rateLimit } from '../middleware/rateLimit'

function clientIp(ctx: Context): string {
  return ctx.req.header('cf-connecting-ip')
    ?? ctx.req.header('x-real-ip')
    ?? ctx.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown'
}

export function adminAuthRoutes(c: Container): Hono {
  const app = new Hono()

  app.get('/status', async (ctx) => {
    const r = await c.adminStore.countAdmins()
    if (!r.ok) throw new AppHttpError(r.error)
    return ctx.json({ adminExists: r.value > 0 })
  })

  app.use('/onboarding', rateLimit({ windowMs: 60 * 60_000, max: 20, key: clientIp }))
  app.post('/onboarding', async (ctx) => {
    const body = CreateFirstAdminSchema.parse(await ctx.req.json())
    const r = await createFirstAdmin({ adminStore: c.adminStore, hashPassword: c.hashPassword }, body)
    if (!r.ok) throw new AppHttpError(r.error)
    // Auto-login: the wizard's remaining steps (site config, system prompt)
    // hit endpoints that require a session. Issuing the session cookie here
    // makes the wizard a single uninterrupted flow.
    const loginR = await loginOrch(
      { adminStore: c.adminStore, sessionStore: c.adminSessionStore, verifyPassword: c.verifyPassword, sha256: c.sha256 },
      body,
    )
    if (loginR.ok) {
      setCookie(ctx, 'session', loginR.value.token, {
        httpOnly: true,
        secure: c.env.COOKIE_SECURE,
        sameSite: 'Lax',
        path: '/',
        maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
      })
    }
    return ctx.json({ id: r.value.id, email: r.value.email })
  })

  app.use('/login', rateLimit({ windowMs: 60 * 60_000, max: ADMIN_LOGIN_RATE_LIMIT_PER_HOUR, key: clientIp }))
  app.post('/login', async (ctx) => {
    const body = LoginSchema.parse(await ctx.req.json())
    const r = await loginOrch(
      { adminStore: c.adminStore, sessionStore: c.adminSessionStore, verifyPassword: c.verifyPassword, sha256: c.sha256 },
      body,
    )
    if (!r.ok) throw new AppHttpError(r.error)
    setCookie(ctx, 'session', r.value.token, {
      httpOnly: true,
      secure: c.env.COOKIE_SECURE,
      sameSite: 'Lax',
      path: '/',
      maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
    })
    return ctx.json({ ok: true })
  })

  app.post('/logout', async (ctx) => {
    const token = getCookie(ctx, 'session') ?? ''
    if (token) await logoutOrch({ sessionStore: c.adminSessionStore, sha256: c.sha256 }, token)
    deleteCookie(ctx, 'session', { path: '/' })
    return ctx.json({ ok: true })
  })

  app.get('/me', async (ctx) => {
    const token = getCookie(ctx, 'session') ?? ''
    const r = await verifySession({ adminStore: c.adminStore, sessionStore: c.adminSessionStore, sha256: c.sha256 }, token)
    if (!r.ok) throw new AppHttpError(r.error)
    return ctx.json({ id: r.value.id, email: r.value.email })
  })

  return app
}
