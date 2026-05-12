import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { SessionId, VisitorId, SSE_HEARTBEAT_MS } from '@support/shared'
import type { Container } from '../../../composition/container'
import { verifyStreamToken } from '../../crypto/streamToken'
import type { BroadcastChannel, BroadcastEvent, BroadcastPort } from '../../../application/ports'

// Duck-type narrowing helper: returns the cloudflare-only
// `proxySubscribeRequest` function when the bound adapter is
// `DurableObjectBroadcast`, otherwise `undefined`. Centralised here so the
// route stays single-source-of-truth across both deployments.
type ProxySubscribeRequest = (channel: BroadcastChannel, signal: AbortSignal) => Promise<Response>
type MaybeProxyAware = BroadcastPort & { proxySubscribeRequest?: ProxySubscribeRequest }
function proxySubscribeRequestOn(port: BroadcastPort): ProxySubscribeRequest | undefined {
  const candidate: MaybeProxyAware = port
  return typeof candidate.proxySubscribeRequest === 'function'
    ? candidate.proxySubscribeRequest
    : undefined
}

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
    // EventSource can't set custom headers, so the widget passes visitorId
    // as a query param. Accept either source — header takes precedence for
    // any future fetch-based caller.
    const visitorIdRaw = ctx.req.header('X-Visitor-Id') ?? ctx.req.query('visitorId') ?? ''
    let visitorId
    try { visitorId = VisitorId(visitorIdRaw) } catch {
      return ctx.json({ error: 'missing_visitor_id' }, 400)
    }
    const v = verifyStreamToken(token, { sessionId, visitorId }, c.env.STREAM_TOKEN_SECRET)
    if (!v.ok) return ctx.json({ error: 'invalid_token', detail: v.error }, 401)

    const session = await c.sessionStore.getSession(sessionId)
    if (!session.ok) return ctx.json({ error: 'session_not_found' }, 404)

    // Cloudflare path: when the bound BroadcastPort exposes
    // `proxySubscribeRequest` (i.e. the DurableObjectBroadcast adapter),
    // hand the SSE stream straight off to the per-channel DO and return
    // its Response. The DO owns the long-lived stream, so the worker
    // isolate is free to terminate after this fetch returns. Auth and
    // session validation above still apply because we only reach here
    // after they pass. The in-process pubsub bridge below is kept for
    // the Node + Postgres deployment, which uses `InProcessSseHub`.
    const proxy = proxySubscribeRequestOn(c.broadcast)
    if (proxy !== undefined) {
      return proxy(sessionId, ctx.req.raw.signal)
    }

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

      const lifetimeTimer = setTimeout(() => { void stream.close() }, c.env.SSE_MAX_LIFETIME_MS)

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
