import { Hono } from 'hono'
import type { Context } from 'hono'
import { CreateSessionSchema, PostMessageSchema, VisitorId, SessionId, VISITOR_RATE_LIMIT_MSG_PER_MIN, VISITOR_RATE_LIMIT_MSG_PER_HOUR } from '@support/shared'
import type { Container } from '../../../composition/composeContainer'
import type { Session } from '../../../domain/conversation'
import { handleVisitorMessage } from '../../../application/chat/handleVisitorMessage'
import { signStreamToken } from '../../crypto/streamToken'
import { AppHttpError } from '../middleware/errorHandler'
import { rateLimit } from '../middleware/rateLimit'

function clientIp(ctx: Context): string {
  return ctx.req.header('cf-connecting-ip')
    ?? ctx.req.header('x-real-ip')
    ?? ctx.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown'
}

export function widgetSessionRoutes(c: Container): Hono {
  const app = new Hono()

  app.use('/', rateLimit({ windowMs: 60_000, max: 10, key: clientIp }))
  app.use('/:id/messages', rateLimit({
    windowMs: 60_000, max: VISITOR_RATE_LIMIT_MSG_PER_MIN,
    key: (ctx) => ctx.req.param('id') ?? '',
  }))
  app.use('/:id/messages', rateLimit({
    windowMs: 60 * 60_000, max: VISITOR_RATE_LIMIT_MSG_PER_HOUR,
    key: (ctx) => `${ctx.req.header('X-Visitor-Id') ?? ''}-hour`,
  }))

  app.post('/', async (ctx) => {
    const visitorIdHeader = ctx.req.header('X-Visitor-Id')
    if (!visitorIdHeader) return ctx.json({ error: 'missing_visitor_id' }, 400)
    let visitorId
    try { visitorId = VisitorId(visitorIdHeader) } catch { return ctx.json({ error: 'bad_visitor_id' }, 400) }
    const parsed = CreateSessionSchema.parse(await ctx.req.json().catch(() => ({})))
    const visitorMeta: Session['visitorMeta'] = {
      ...(parsed.url !== undefined ? { url: parsed.url } : {}),
      ...(parsed.userAgent !== undefined ? { userAgent: parsed.userAgent } : {}),
      ...(parsed.language !== undefined ? { language: parsed.language } : {}),
    }
    const r = await c.sessionStore.createSession({ visitorId, visitorMeta })
    if (!r.ok) throw new AppHttpError(r.error)
    const streamToken = signStreamToken({ sessionId: r.value.id, visitorId }, c.env.STREAM_TOKEN_SECRET)
    return ctx.json({ sessionId: r.value.id, streamToken })
  })

  app.post('/:id/messages', async (ctx) => {
    const visitorIdHeader = ctx.req.header('X-Visitor-Id')
    if (!visitorIdHeader) return ctx.json({ error: 'missing_visitor_id' }, 400)
    let visitorId, sessionId
    try {
      visitorId = VisitorId(visitorIdHeader)
      sessionId = SessionId(ctx.req.param('id') ?? '')
    } catch { return ctx.json({ error: 'bad_id' }, 400) }
    let body
    try { body = PostMessageSchema.parse(await ctx.req.json()) } catch { return ctx.json({ error: 'bad_request' }, 400) }
    const r = await handleVisitorMessage(
      {
        sessionStore: c.sessionStore,
        siteConfigStore: c.siteConfigStore,
        broadcast: c.broadcast,
        llm: c.llm,
        embedder: c.embedder,
        vectorStore: c.vectorStore,
        decrypt: c.decrypt,
      },
      { sessionId, content: body.content },
    )
    if (!r.ok) throw new AppHttpError(r.error)
    const streamToken = signStreamToken({ sessionId, visitorId }, c.env.STREAM_TOKEN_SECRET)
    return ctx.json({ ok: true, streamToken })
  })

  app.post('/:id/close', async (ctx) => {
    let sessionId
    try { sessionId = SessionId(ctx.req.param('id') ?? '') } catch { return ctx.json({ error: 'bad_id' }, 400) }
    const r = await c.sessionStore.close(sessionId, 'visitor')
    if (!r.ok) throw new AppHttpError(r.error)
    c.broadcast.publish(sessionId, { type: 'closed', reason: 'visitor_closed' })
    return ctx.json({ ok: true })
  })

  return app
}
