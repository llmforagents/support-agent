import { Hono } from 'hono'
import { readFile } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Container } from '../../../composition/composeContainer'

const here = dirname(fileURLToPath(import.meta.url))
const WIDGET_DIST = join(here, '../../../../../widget/dist')

const SITE_KEY_RE = /^[A-Za-z0-9_-]{20}$/
const ASSET_FILE_RE = /^[A-Za-z0-9._-]+$/

async function readAsset(name: string): Promise<Buffer | null> {
  try { return await readFile(join(WIDGET_DIST, name)) } catch { return null }
}

export function widgetAssetRoutes(_c: Container): Hono {
  const app = new Hono()

  app.get('/widget.js', async (ctx) => {
    const buf = await readAsset('widget.js')
    if (!buf) return ctx.json({ error: 'widget bundle not built' }, 503)
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=60, must-revalidate',
      },
    })
  })

  app.get('/embed/:siteKey', async (ctx) => {
    const requested = ctx.req.param('siteKey') ?? ''
    if (!SITE_KEY_RE.test(requested)) return ctx.json({ error: 'bad_site_key' }, 400)
    const cfg = await _c.siteConfigStore.get()
    if (!cfg.ok || !cfg.value || cfg.value.siteKey !== requested) {
      return ctx.json({ error: 'unknown_site_key' }, 404)
    }
    const html = await readAsset('embed.html')
    if (!html) return ctx.json({ error: 'embed not built' }, 503)
    const safeKey = JSON.stringify(requested)
    const replaced = html.toString('utf8').replace('"{{siteKey}}"', safeKey)
    return new Response(replaced, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "frame-ancestors *",
        'Cache-Control': 'no-store',
      },
    })
  })

  app.get('/embed/assets/:file', async (ctx) => {
    const file = ctx.req.param('file') ?? ''
    if (!ASSET_FILE_RE.test(file) || basename(file) !== file) return ctx.json({ error: 'not found' }, 404)
    const buf = await readAsset(`assets/${file}`)
    if (!buf) return ctx.json({ error: 'not found' }, 404)
    const ct = file.endsWith('.js') ? 'application/javascript'
      : file.endsWith('.css') ? 'text/css'
      : 'application/octet-stream'
    return new Response(buf, { headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=31536000, immutable' } })
  })

  return app
}
