import { Hono } from 'hono'
import { SessionId, MessageId } from '@support/shared'
import type { Container } from '../../../composition/composeContainer'
import { requireAdmin } from '../middleware/requireAdmin'
import { AppHttpError } from '../middleware/errorHandler'
import type { ConversationState } from '../../../domain/conversation'

const STATUS_FILTER = ['active_ai', 'handoff_requested', 'active_operator', 'released_to_ai', 'closed'] as const
type StatusFilter = typeof STATUS_FILTER[number]

export function adminInboxRoutes(c: Container): Hono {
  const app = new Hono()
  app.use('*', requireAdmin({
    adminStore: c.adminStore,
    sessionStore: c.adminSessionStore,
    sha256: c.sha256,
  }))

  // GET /v1/admin/sessions?status=handoff_requested&limit=50
  app.get('/', async (ctx) => {
    const statusRaw = ctx.req.query('status')
    const status: StatusFilter | undefined =
      statusRaw !== undefined && (STATUS_FILTER as readonly string[]).includes(statusRaw)
        ? (statusRaw as StatusFilter)
        : undefined
    const limit = Math.min(100, Math.max(1, Number(ctx.req.query('limit') ?? '50')))
    const r = await c.sessionStore.listSessions({ ...(status !== undefined ? { status: status as ConversationState['status'] } : {}), limit })
    if (!r.ok) throw new AppHttpError(r.error)
    return ctx.json({ sessions: r.value })
  })

  // GET /v1/admin/sessions/:id
  app.get('/:id', async (ctx) => {
    let id: ReturnType<typeof SessionId>
    try { id = SessionId(ctx.req.param('id') ?? '') } catch {
      return ctx.json({ error: 'invalid_id' }, 400)
    }
    const r = await c.sessionStore.getSession(id)
    if (!r.ok) throw new AppHttpError(r.error)
    return ctx.json(r.value)
  })

  // GET /v1/admin/sessions/:id/messages?limit=50&afterId=uuid
  app.get('/:id/messages', async (ctx) => {
    let id: ReturnType<typeof SessionId>
    try { id = SessionId(ctx.req.param('id') ?? '') } catch {
      return ctx.json({ error: 'invalid_id' }, 400)
    }
    const limit = Math.min(200, Math.max(1, Number(ctx.req.query('limit') ?? '50')))
    const afterIdRaw = ctx.req.query('afterId')
    const opts: { limit: number; afterId?: ReturnType<typeof MessageId> } = { limit }
    if (afterIdRaw !== undefined) {
      try { opts.afterId = MessageId(afterIdRaw) } catch { /* ignore invalid afterId */ }
    }
    const r = await c.sessionStore.listMessages(id, opts)
    if (!r.ok) throw new AppHttpError(r.error)
    return ctx.json({ messages: r.value })
  })

  return app
}
