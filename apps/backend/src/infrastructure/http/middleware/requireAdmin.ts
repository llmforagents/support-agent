import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { verifySession } from '../../../application/auth/verifySession'
import type { AdminStorePort, AdminSessionStorePort } from '../../../application/ports'
import { AppHttpError } from './errorHandler'

export type RequireAdminDeps = Readonly<{
  adminStore: AdminStorePort
  sessionStore: AdminSessionStorePort
  sha256: (s: string) => string
}>

export function requireAdmin(deps: RequireAdminDeps): MiddlewareHandler {
  return async (c, next) => {
    const token = getCookie(c, 'session') ?? ''
    const r = await verifySession(deps, token)
    if (!r.ok) throw new AppHttpError(r.error)
    c.set('admin', r.value)
    await next()
  }
}
