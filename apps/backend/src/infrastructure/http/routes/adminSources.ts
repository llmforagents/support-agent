import { Hono } from 'hono'
import { z } from 'zod'
import { SourceId } from '@support/shared'
import type { Container } from '../../../composition/container'
import type { SourceConfig } from '../../../domain/source'
import { ingestSource } from '../../../application/kb/ingestSource'
import { extractChunks } from '../../parsers'
import { requireAdmin } from '../middleware/requireAdmin'
import { AppHttpError } from '../middleware/errorHandler'

const SOURCE_TYPES = ['pdf', 'md', 'txt'] as const
type FileSourceType = (typeof SOURCE_TYPES)[number]

function inferContentType(t: FileSourceType): string {
  return t === 'pdf' ? 'application/pdf' : 'text/plain'
}

function buildIngestDeps(c: Container) {
  return {
    knowledgeStore: c.knowledgeStore,
    vectorStore: c.vectorStore,
    fileStore: c.fileStore,
    embedder: c.embedder,
    broadcast: c.broadcast,
    siteConfigStore: c.siteConfigStore,
    mysqlConnectionStore: c.mysqlConnectionStore,
    decrypt: c.decrypt,
    extractChunks,
    logger: c.logger,
  }
}

export function adminSourcesRoutes(c: Container): Hono {
  const app = new Hono()
  app.use('*', requireAdmin({
    adminStore: c.adminStore,
    sessionStore: c.adminSessionStore,
    sha256: c.sha256,
  }))

  // GET /v1/admin/sources
  app.get('/', async (ctx) => {
    const r = await c.knowledgeStore.listSources()
    if (!r.ok) throw new AppHttpError(r.error)
    return ctx.json({ sources: r.value })
  })

  // GET /v1/admin/sources/:id
  app.get('/:id', async (ctx) => {
    let id: ReturnType<typeof SourceId>
    try { id = SourceId(ctx.req.param('id') ?? '') } catch {
      return ctx.json({ error: 'invalid_id' }, 400)
    }
    const r = await c.knowledgeStore.getSource(id)
    if (!r.ok) throw new AppHttpError(r.error)
    return ctx.json(r.value)
  })

  // POST /v1/admin/sources  (JSON for mysql_query, multipart for file types)
  app.post('/', async (ctx) => {
    const ct = ctx.req.header('content-type') ?? ''

    if (ct.includes('application/json')) {
      // mysql_query branch — only available on the Postgres driver. The
      // Cloudflare deployment has no outbound MySQL path (Workers can't
      // open arbitrary TCP), so the JSON ingest source type is gated here.
      // The 422 must fire BEFORE the Zod schema runs so callers don't get
      // a schema-validation error message that masks the real reason.
      if (c.driver === 'cloudflare') {
        return ctx.json({
          error: 'mysql_unsupported_on_driver',
          detail: 'mysql_query sources are only supported with STORAGE_DRIVER=postgres',
        }, 422)
      }
      // mysql_query branch
      const MysqlSourceSchema = z.object({
        name: z.string().min(1).max(100),
        sourceType: z.literal('mysql_query'),
        connectionId: z.string().min(1),
        query: z.string().min(1),
        rowTemplate: z.string().min(1),
        refreshCronSpec: z.string().optional(),
      })
      const body = MysqlSourceSchema.parse(await ctx.req.json())
      const config: SourceConfig = {
        sourceType: 'mysql_query',
        connectionRef: body.connectionId,
        query: body.query,
        rowTemplate: body.rowTemplate,
        refreshCronSpec: body.refreshCronSpec ?? '@daily',
      }
      const sourceRes = await c.knowledgeStore.createSource({
        name: body.name,
        sourceType: 'mysql_query',
        config,
      })
      if (!sourceRes.ok) throw new AppHttpError(sourceRes.error)
      void ingestSource(buildIngestDeps(c), sourceRes.value.id).catch((err: unknown) => {
        c.logger.error({ err, sourceId: sourceRes.value.id }, 'mysql ingest crashed')
      })
      return ctx.json(sourceRes.value, 201)
    }

    // multipart branch (file types)
    const body = await ctx.req.parseBody()
    const file = body['file']
    const name = body['name']
    const sourceType = body['type']
    if (typeof name !== 'string' || name.length === 0) return ctx.json({ error: 'missing_name' }, 400)
    if (typeof sourceType !== 'string' || !(SOURCE_TYPES as readonly string[]).includes(sourceType)) {
      return ctx.json({ error: 'unsupported_source_type', detail: { allowed: SOURCE_TYPES } }, 415)
    }
    if (!(file instanceof File) && !(file instanceof Blob)) {
      return ctx.json({ error: 'missing_file' }, 400)
    }
    const fileType = sourceType as FileSourceType
    const buf = new Uint8Array(await file.arrayBuffer())
    const fileKey = crypto.randomUUID()
    const fileRes = await c.fileStore.put(fileKey, buf, inferContentType(fileType))
    if (!fileRes.ok) throw new AppHttpError(fileRes.error)
    const fileRef = fileRes.value.ref
    const config: SourceConfig = fileType === 'pdf'
      ? { sourceType: 'pdf', fileRef }
      : fileType === 'md'
        ? { sourceType: 'md', fileRef }
        : { sourceType: 'txt', fileRef }
    const sourceRes = await c.knowledgeStore.createSource({ name, sourceType: fileType, config })
    if (!sourceRes.ok) throw new AppHttpError(sourceRes.error)
    // Fire-and-forget ingest. Errors land in source.state.
    void ingestSource(buildIngestDeps(c), sourceRes.value.id).catch((err: unknown) => {
      c.logger.error({ err, sourceId: sourceRes.value.id }, 'ingest crashed')
    })
    return ctx.json(sourceRes.value, 201)
  })

  // POST /v1/admin/sources/:id/reindex
  app.post('/:id/reindex', (ctx) => {
    let id: ReturnType<typeof SourceId>
    try { id = SourceId(ctx.req.param('id') ?? '') } catch {
      return ctx.json({ error: 'invalid_id' }, 400)
    }
    void ingestSource(buildIngestDeps(c), id).catch((err: unknown) => {
      c.logger.error({ err, sourceId: id }, 'reindex crashed')
    })
    return ctx.json({ ok: true, message: 'reindex started' })
  })

  // PUT /v1/admin/sources/:id/active
  app.put('/:id/active', async (ctx) => {
    let id: ReturnType<typeof SourceId>
    try { id = SourceId(ctx.req.param('id') ?? '') } catch {
      return ctx.json({ error: 'invalid_id' }, 400)
    }
    const body = z.object({ active: z.boolean() }).parse(await ctx.req.json())
    const r = await c.knowledgeStore.setActive(id, body.active)
    if (!r.ok) throw new AppHttpError(r.error)
    return ctx.json({ ok: true })
  })

  // DELETE /v1/admin/sources/:id
  app.delete('/:id', async (ctx) => {
    let id: ReturnType<typeof SourceId>
    try { id = SourceId(ctx.req.param('id') ?? '') } catch {
      return ctx.json({ error: 'invalid_id' }, 400)
    }
    const r = await c.knowledgeStore.deleteSource(id)
    if (!r.ok) throw new AppHttpError(r.error)
    return ctx.json({ ok: true })
  })

  // GET /v1/admin/sources/:id/preview?n=5
  app.get('/:id/preview', async (ctx) => {
    let id: ReturnType<typeof SourceId>
    try { id = SourceId(ctx.req.param('id') ?? '') } catch {
      return ctx.json({ error: 'invalid_id' }, 400)
    }
    const n = Math.min(20, Math.max(1, Number(ctx.req.query('n') ?? '5')))
    const r = await c.vectorStore.previewBySource(id, n)
    if (!r.ok) throw new AppHttpError(r.error)
    return ctx.json({ chunks: r.value })
  })

  return app
}
