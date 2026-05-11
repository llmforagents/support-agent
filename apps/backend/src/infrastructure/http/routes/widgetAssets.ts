// Serves the widget bundle from disk. The disk-read paths use `node:fs`,
// which is unavailable on the Workers runtime — therefore the Node `fs`
// import is lazy (inside an `import()`) so the module body itself loads on
// both runtimes. The CF compose disables this route at registration time
// (driver-gated in `createApp`), so the dynamic import in production only
// fires under the Node (postgres) deployment.
//
// Section H of P4 will replace this with a Workers-native asset binding
// or KV cache — kept for the Node deployment to avoid a behaviour gap.
import { Hono } from 'hono'
import type * as NodeFs from 'node:fs/promises'
import type * as NodePath from 'node:path'
import type * as NodeUrl from 'node:url'
import type { Container } from '../../../composition/container'

const SITE_KEY_RE = /^[A-Za-z0-9_-]{20}$/
const ASSET_FILE_RE = /^[A-Za-z0-9._-]+$/

async function resolveFsAdapter(): Promise<{
  readFile: typeof NodeFs.readFile
  join: typeof NodePath.join
  basename: typeof NodePath.basename
  widgetDist: string
}> {
  const fs: typeof NodeFs = await import('node:fs/promises')
  const path: typeof NodePath = await import('node:path')
  const url: typeof NodeUrl = await import('node:url')
  const here = path.dirname(url.fileURLToPath(import.meta.url))
  const widgetDist = path.join(here, '../../../../../widget/dist')
  return { readFile: fs.readFile, join: path.join, basename: path.basename, widgetDist }
}

async function readAsset(name: string): Promise<Buffer | null> {
  const ad = await resolveFsAdapter()
  try {
    return await ad.readFile(ad.join(ad.widgetDist, name))
  } catch {
    return null
  }
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
    const ad = await resolveFsAdapter()
    if (!ASSET_FILE_RE.test(file) || ad.basename(file) !== file) {
      return ctx.json({ error: 'not found' }, 404)
    }
    const buf = await readAsset(`assets/${file}`)
    if (!buf) return ctx.json({ error: 'not found' }, 404)
    const ct = file.endsWith('.js') ? 'application/javascript'
      : file.endsWith('.css') ? 'text/css'
      : 'application/octet-stream'
    return new Response(buf, { headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=31536000, immutable' } })
  })

  return app
}
