import { Hono } from 'hono'
import { z } from 'zod'
import type { Container } from '../../../composition/composeContainer'
import { requireAdmin } from '../middleware/requireAdmin'
import { AppHttpError } from '../middleware/errorHandler'
import { validateSelectQuery } from '../../parsers/sqlSafety'

const CreateConnectionSchema = z.object({
  name: z.string().min(1).max(100),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  database: z.string().min(1).max(100),
  user: z.string().min(1).max(100),
  password: z.string().min(1),
  ssl: z.boolean(),
})

export function adminMysqlRoutes(c: Container): Hono {
  const app = new Hono()
  app.use('*', requireAdmin({
    adminStore: c.adminStore,
    sessionStore: c.adminSessionStore,
    sha256: c.sha256,
  }))

  // POST /v1/admin/mysql-connections
  app.post('/', async (ctx) => {
    const body = CreateConnectionSchema.parse(await ctx.req.json())
    const r = await c.mysqlConnectionStore.createConnection(body)
    if (!r.ok) throw new AppHttpError(r.error)
    return ctx.json(r.value, 201)
  })

  // GET /v1/admin/mysql-connections
  app.get('/', async (ctx) => {
    const r = await c.mysqlConnectionStore.listConnections()
    if (!r.ok) throw new AppHttpError(r.error)
    return ctx.json({ connections: r.value })
  })

  // DELETE /v1/admin/mysql-connections/:id
  app.delete('/:id', async (ctx) => {
    const id = ctx.req.param('id') ?? ''
    const r = await c.mysqlConnectionStore.deleteConnection(id)
    if (!r.ok) throw new AppHttpError(r.error)
    return ctx.json({ ok: true })
  })

  // POST /v1/admin/mysql-connections/:id/test
  app.post('/:id/test', async (ctx) => {
    const id = ctx.req.param('id') ?? ''
    const credsRes = await c.mysqlConnectionStore.getCredentials(id)
    if (!credsRes.ok) throw new AppHttpError(credsRes.error)
    try {
      const { default: mysql } = await import('mysql2/promise')
      const conn = await mysql.createConnection({
        host: credsRes.value.host,
        port: credsRes.value.port,
        database: credsRes.value.database,
        user: credsRes.value.user,
        password: credsRes.value.password,
        connectTimeout: 5_000,
        ...(credsRes.value.ssl ? { ssl: {} as Record<string, never> } : {}),
      } as Parameters<typeof mysql.createConnection>[0])
      await conn.execute('SELECT 1 AS ok')
      await conn.end()
      return ctx.json({ ok: true })
    } catch (err) {
      return ctx.json({ ok: false, error: String(err) }, 502)
    }
  })

  // POST /v1/admin/mysql-connections/:id/validate-query
  app.post('/:id/validate-query', async (ctx) => {
    const body = z.object({ query: z.string().min(1) }).parse(await ctx.req.json())
    const r = validateSelectQuery(body.query)
    if (!r.ok) {
      const reason = r.error.kind === 'mysql_unsafe_query' ? r.error.reason : 'invalid'
      return ctx.json({ ok: false, reason })
    }
    return ctx.json({ ok: true, hasLimit: r.value.hasLimit, safeSql: r.value.safeSql })
  })

  return app
}
