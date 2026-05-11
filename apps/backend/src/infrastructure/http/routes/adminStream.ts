import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { SSE_HEARTBEAT_MS } from '@support/shared'
import type { Container } from '../../../composition/container'
import type { BroadcastChannel, BroadcastEvent, BroadcastPort } from '../../../application/ports'
import { requireAdmin } from '../middleware/requireAdmin'

// Duck-type narrowing helper: returns the cloudflare-only
// `proxySubscribeRequest` function when the bound adapter is
// `DurableObjectBroadcast`, otherwise `undefined`. Mirrors the helper in
// `widgetStream.ts` — both SSE routes use the same delegation pattern.
type ProxySubscribeRequest = (channel: BroadcastChannel, signal: AbortSignal) => Promise<Response>
type MaybeProxyAware = BroadcastPort & { proxySubscribeRequest?: ProxySubscribeRequest }
function proxySubscribeRequestOn(port: BroadcastPort): ProxySubscribeRequest | undefined {
  const candidate: MaybeProxyAware = port
  return typeof candidate.proxySubscribeRequest === 'function'
    ? candidate.proxySubscribeRequest
    : undefined
}

export function adminStreamRoutes(c: Container): Hono {
  const app = new Hono()
  app.use('*', requireAdmin({
    adminStore: c.adminStore,
    sessionStore: c.adminSessionStore,
    sha256: c.sha256,
  }))

  app.get('/', (ctx) => {
    // Cloudflare path: see widgetStream.ts for the rationale. When the
    // BroadcastPort exposes `proxySubscribeRequest`, the DO owns the SSE
    // stream and we just relay its Response back to the admin client.
    // `requireAdmin` middleware above has already authenticated the
    // request before this handler runs.
    const proxy = proxySubscribeRequestOn(c.broadcast)
    if (proxy !== undefined) {
      return proxy('admin_inbox', ctx.req.raw.signal)
    }
    return streamSSE(ctx, async (stream) => {
      await stream.writeSSE({ data: JSON.stringify({ type: 'connected' }) })

      const dispose = c.broadcast.subscribe('admin_inbox', (event: BroadcastEvent) => {
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
      }

      await new Promise<void>((resolve) => {
        stream.onAbort(() => { cleanup(); resolve() })
      })
    })
  })

  return app
}
