import { cors } from 'hono/cors'
import type { MiddlewareHandler } from 'hono'

export function widgetCors(): MiddlewareHandler {
  return cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'X-Visitor-Id', 'Last-Event-Id'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    exposeHeaders: ['X-Request-Id'],
    maxAge: 600,
  })
}

export function adminCors(adminOrigin: string): MiddlewareHandler {
  return cors({
    origin: adminOrigin,
    allowHeaders: ['Content-Type', 'X-CSRF-Token'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['X-Request-Id'],
    credentials: true,
    maxAge: 600,
  })
}
