import { Hono } from 'hono'
import type { Container } from '../../../composition/composeContainer'
import { requireAdmin } from '../middleware/requireAdmin'

export function adminConfigRoutes(c: Container): Hono {
  const app = new Hono()
  app.use('*', requireAdmin({ adminStore: c.adminStore, sessionStore: c.adminSessionStore, sha256: c.sha256 }))

  app.get('/', async (ctx) => {
    const r = await c.siteConfigStore.get()
    if (!r.ok) return ctx.json({ error: 'db' }, 500)
    if (!r.value) return ctx.json({ onboardingCompleted: false }, 200)
    const { llm4agentsApiKeyEncrypted: _omit, ...safe } = r.value
    return ctx.json(safe)
  })

  app.put('/online', async (ctx) => {
    const body = await ctx.req.json() as { online: boolean }
    await c.siteConfigStore.setAdminOnline(body.online === true)
    c.broadcast.publish('admin_status', { type: 'admin_status', online: body.online === true })
    return ctx.json({ ok: true })
  })

  return app
}
