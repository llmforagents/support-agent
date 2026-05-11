import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { SSE_HEARTBEAT_MS } from '@support/shared'
import type { Container } from '../../../composition/container'
import type { BroadcastEvent } from '../../../application/ports'
import { requireAdmin } from '../middleware/requireAdmin'

export function adminStreamRoutes(c: Container): Hono {
  const app = new Hono()
  app.use('*', requireAdmin({
    adminStore: c.adminStore,
    sessionStore: c.adminSessionStore,
    sha256: c.sha256,
  }))

  app.get('/', (ctx) => {
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
