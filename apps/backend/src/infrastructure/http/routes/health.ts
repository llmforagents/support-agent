import { Hono } from 'hono'
import type { Container } from '../../../composition/container'

export function healthRoutes(c: Container): Hono {
  const app = new Hono()
  app.get('/healthz', (ctx) => ctx.json({ status: 'ok' }))
  app.get('/readyz', async (ctx) => {
    const [db, llm] = await Promise.all([
      c.healthChecks.db().catch(() => false),
      c.healthChecks.llm().catch(() => false),
    ])
    const ok = db && llm
    return ctx.json({ db, llm }, ok ? 200 : 503)
  })
  return app
}
