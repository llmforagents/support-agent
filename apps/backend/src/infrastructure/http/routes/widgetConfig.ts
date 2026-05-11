import { Hono } from 'hono'
import type { Container } from '../../../composition/container'

export function widgetConfigRoutes(c: Container): Hono {
  const app = new Hono()
  app.get('/', async (ctx) => {
    const siteKey = ctx.req.query('siteKey')
    const r = await c.siteConfigStore.get()
    if (!r.ok || !r.value || !r.value.onboardingCompleted) return ctx.json({ error: 'not_found' }, 404)
    if (siteKey && siteKey !== r.value.siteKey) return ctx.json({ error: 'site_key_mismatch' }, 404)
    return ctx.json({
      siteKey: r.value.siteKey,
      siteName: r.value.siteName,
      primaryColor: r.value.primaryColor,
      adminOnline: r.value.adminOnline,
    })
  })
  return app
}
