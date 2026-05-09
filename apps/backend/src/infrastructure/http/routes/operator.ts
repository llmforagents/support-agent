import { Hono } from 'hono'
import { z } from 'zod'
import { SessionId, MAX_VISITOR_MESSAGE_LEN } from '@support/shared'
import type { Container } from '../../../composition/composeContainer'
import { claimHandoff } from '../../../application/operator/claimHandoff'
import { sendOperatorMessage } from '../../../application/operator/sendOperatorMessage'
import { releaseSession } from '../../../application/operator/releaseSession'
import { closeSession } from '../../../application/operator/closeSession'
import { requireAdmin } from '../middleware/requireAdmin'
import { AppHttpError } from '../middleware/errorHandler'

export function operatorRoutes(c: Container): Hono {
  const app = new Hono()
  app.use('*', requireAdmin({
    adminStore: c.adminStore,
    sessionStore: c.adminSessionStore,
    sha256: c.sha256,
  }))

  // POST /v1/admin/sessions/:id/claim
  app.post('/:id/claim', async (ctx) => {
    let id: ReturnType<typeof SessionId>
    try { id = SessionId(ctx.req.param('id') ?? '') } catch {
      return ctx.json({ error: 'invalid_id' }, 400)
    }
    const admin = ctx.get('admin')
    const r = await claimHandoff({ sessionStore: c.sessionStore, broadcast: c.broadcast }, id, admin.id)
    if (!r.ok) throw new AppHttpError(r.error)
    return ctx.json({ ok: true })
  })

  // POST /v1/admin/sessions/:id/messages
  app.post('/:id/messages', async (ctx) => {
    let id: ReturnType<typeof SessionId>
    try { id = SessionId(ctx.req.param('id') ?? '') } catch {
      return ctx.json({ error: 'invalid_id' }, 400)
    }
    const admin = ctx.get('admin')
    const body = z.object({ content: z.string().min(1).max(MAX_VISITOR_MESSAGE_LEN) }).parse(await ctx.req.json())
    const r = await sendOperatorMessage(
      { sessionStore: c.sessionStore, broadcast: c.broadcast },
      { sessionId: id, operatorId: admin.id, content: body.content },
    )
    if (!r.ok) throw new AppHttpError(r.error)
    return ctx.json({ ok: true })
  })

  // POST /v1/admin/sessions/:id/release
  app.post('/:id/release', async (ctx) => {
    let id: ReturnType<typeof SessionId>
    try { id = SessionId(ctx.req.param('id') ?? '') } catch {
      return ctx.json({ error: 'invalid_id' }, 400)
    }
    const admin = ctx.get('admin')
    const r = await releaseSession(
      { sessionStore: c.sessionStore, broadcast: c.broadcast },
      { sessionId: id, operatorId: admin.id },
    )
    if (!r.ok) throw new AppHttpError(r.error)
    return ctx.json({ ok: true })
  })

  // POST /v1/admin/sessions/:id/close
  app.post('/:id/close', async (ctx) => {
    let id: ReturnType<typeof SessionId>
    try { id = SessionId(ctx.req.param('id') ?? '') } catch {
      return ctx.json({ error: 'invalid_id' }, 400)
    }
    const r = await closeSession(
      { sessionStore: c.sessionStore, broadcast: c.broadcast },
      { sessionId: id, by: 'admin' },
    )
    if (!r.ok) throw new AppHttpError(r.error)
    return ctx.json({ ok: true })
  })

  return app
}
