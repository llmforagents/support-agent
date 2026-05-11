import { Hono } from 'hono'
import { z } from 'zod'
import type { Container } from '../../../composition/container'
import { requireAdmin } from '../middleware/requireAdmin'
import { AppHttpError } from '../middleware/errorHandler'

const Body = z.object({ enabled: z.boolean() })

export function adminMcpRoutes(c: Container): Hono {
  const app = new Hono()
  app.use('*', requireAdmin({
    adminStore: c.adminStore,
    sessionStore: c.adminSessionStore,
    sha256: c.sha256,
  }))

  // PUT /v1/admin/mcp  { enabled: boolean }
  app.put('/', async (ctx) => {
    const raw: unknown = await ctx.req.json().catch(() => null)
    const parsed = Body.safeParse(raw)
    if (!parsed.success) {
      return ctx.json({ error: 'invalid_body', detail: parsed.error.issues }, 400)
    }
    const r = await c.siteConfigStore.setMcpEnabled(parsed.data.enabled)
    if (!r.ok) throw new AppHttpError(r.error)
    return ctx.json({ mcpEnabled: parsed.data.enabled })
  })

  return app
}
