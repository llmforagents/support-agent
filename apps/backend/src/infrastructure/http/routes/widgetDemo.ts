// Minimal HTML page that embeds the widget. Exists so the Playwright suite
// has a real DOM context to load the widget into without standing up a
// separate static host. Postgres-only (the route is registered behind a
// `c.driver === 'postgres'` gate in `createApp`) because the underlying
// /widget.js bundle is also Node-disk-only — Cloudflare Workers serves the
// widget through a different surface.
//
// The demo reads the active siteKey from the site config so the script tag
// resolves to a real site instead of a hardcoded placeholder. If no site is
// configured yet (pre-onboarding), the page renders a clear message; tests
// that hit this route must seed onboarding first.
import { Hono } from 'hono'
import type { Container } from '../../../composition/container'

const ESC: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => ESC[ch] ?? ch)
}

export function widgetDemoRoutes(c: Container): Hono {
  const app = new Hono()

  app.get('/', async (_ctx) => {
    const cfg = await c.siteConfigStore.get()
    const siteKey = cfg.ok && cfg.value ? cfg.value.siteKey : null
    const apiBase = c.env.PUBLIC_API_URL
    const scriptTag = siteKey === null
      ? `<p role="alert">No hay un sitio configurado todavía. Completá el onboarding desde el admin antes de cargar este demo.</p>`
      : `<script src="${escapeHtml(apiBase)}/widget.js" data-site-key="${escapeHtml(siteKey)}" async></script>`
    const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Demo — support-llm4agents</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; max-width: 720px; margin: 0 auto; line-height: 1.5; }
    h1 { font-size: 1.5rem; }
    p { color: #444; }
  </style>
</head>
<body>
  <header>
    <h1>Demo de soporte</h1>
  </header>
  <main>
    <p>Esta página existe para los tests E2E (Playwright + axe-core). El widget debe aparecer abajo a la derecha.</p>
    ${scriptTag}
  </main>
</body>
</html>`
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  })

  return app
}
