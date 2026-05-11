import { Hono } from 'hono'
import { CompleteOnboardingSchema } from '@support/shared'
import type { Container } from '../../../composition/container'
import { completeOnboarding } from '../../../application/onboarding/completeOnboarding'
import { requireAdmin } from '../middleware/requireAdmin'
import { AppHttpError } from '../middleware/errorHandler'

export function adminOnboardingRoutes(c: Container): Hono {
  const app = new Hono()
  app.use('*', requireAdmin({ adminStore: c.adminStore, sessionStore: c.adminSessionStore, sha256: c.sha256 }))

  app.post('/complete', async (ctx) => {
    const body = CompleteOnboardingSchema.parse(await ctx.req.json())
    const r = await completeOnboarding(
      { siteConfigStore: c.siteConfigStore, encrypt: c.encrypt },
      body,
    )
    if (!r.ok) throw new AppHttpError(r.error)
    const embedSnippet = `<script src="${c.env.PUBLIC_API_URL}/widget.js" data-site-key="${r.value.siteKey}"></script>`
    return ctx.json({ siteKey: r.value.siteKey, embedSnippet })
  })

  app.put('/step', async (ctx) => {
    const body = await ctx.req.json() as { step: number; completed?: boolean }
    if (typeof body.step !== 'number') throw new AppHttpError({ kind: 'infra_unexpected', cause: 'bad step' })
    await c.siteConfigStore.setOnboardingStep(body.step, body.completed === true)
    return ctx.json({ ok: true })
  })

  return app
}
