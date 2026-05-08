import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { SessionId, VisitorId, SSE_HEARTBEAT_MS } from '@support/shared'
import type { Container } from '../../../composition/composeContainer'
import { verifyStreamToken } from '../../crypto/streamToken'
import type { BroadcastEvent } from '../../../application/ports'

let liveConnections = 0

export function widgetStreamRoutes(c: Container): Hono {
  const app = new Hono()

  app.get('/:id/stream', async (ctx) => {
    if (liveConnections >= c.env.SSE_MAX_CONNECTIONS) {
      ctx.header('Retry-After', '30')
      return ctx.json({ error: 'sse_capacity_exhausted' }, 503)
    }

    let sessionId
    try { sessionId = SessionId(ctx.req.param('id') ?? '') } catch { return ctx.json({ error: 'bad_id' }, 400) }

    const token = ctx.req.query('token') ?? ''
    const visitorIdHeader = ctx.req.header('X-Visitor-Id') ?? ''
    let visitorId
    try { visitorId = VisitorId(visitorIdHeader) } catch {
      return ctx.json({ error: 'missing_visitor_id' }, 400)
    }
    const v = verifyStreamToken(token, { sessionId, visitorId }, c.env.STREAM_TOKEN_SECRET)
    if (!v.ok) return ctx.json({ error: 'invalid_token', detail: v.error }, 401)

    const session = await c.sessionStore.getSession(sessionId)
    if (!session.ok) return ctx.json({ error: 'session_not_found' }, 404)

    liveConnections++

    return streamSSE(ctx, async (stream) => {
      await stream.writeSSE({ data: JSON.stringify({ type: 'connected', sessionId, state: session.value.state }) })

      const dispose = c.broadcast.subscribe(sessionId, (event: BroadcastEvent) => {
        void stream.writeSSE({ data: JSON.stringify(event) })
      })
      const adminStatusDispose = c.broadcast.subscribe('admin_status', (event: BroadcastEvent) => {
        if (event.type === 'admin_status') void stream.writeSSE({ data: JSON.stringify(event) })
      })

      const heartbeat = setInterval(() => {
        void stream.writeSSE({ data: JSON.stringify({ type: 'ping' }) })
      }, SSE_HEARTBEAT_MS)

      const lifetimeTimer = setTimeout(() => stream.close(), c.env.SSE_MAX_LIFETIME_MS)

      let cleaned = false
      const cleanup = (): void => {
        if (cleaned) return
        cleaned = true
        clearInterval(heartbeat)
        clearTimeout(lifetimeTimer)
        dispose()
        adminStatusDispose()
        liveConnections = Math.max(0, liveConnections - 1)
      }

      await new Promise<void>((resolve) => {
        stream.onAbort(() => { cleanup(); resolve() })
      })
    })
  })

  return app
}
