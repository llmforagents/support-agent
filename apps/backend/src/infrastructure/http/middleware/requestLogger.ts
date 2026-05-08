import type { MiddlewareHandler } from 'hono'
import type { Logger } from '../../observability/logger'

export function requestLogger(rootLogger: Logger): MiddlewareHandler {
  return async (c, next) => {
    const startedAt = Date.now()
    const requestId = c.get('requestId')
    const child = rootLogger.child({ requestId })
    c.set('logger', child)
    try {
      await next()
    } finally {
      const durationMs = Date.now() - startedAt
      child.info({
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        status: c.res.status,
        durationMs,
      }, 'http')
    }
  }
}
