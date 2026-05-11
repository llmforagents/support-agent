// `/metrics` — Prometheus exposition endpoint.
//
// Only mounted on the Postgres deploy (see `createApp.ts`). The Cloudflare
// deploy emits to Analytics Engine via `AnalyticsEngineMetrics`, which has
// no scrape endpoint; querying AE goes through Cloudflare's REST API.
//
// Authentication: NONE by default. In production, gate this behind a
// reverse-proxy basic-auth, VPN, or firewall rule. Prometheus scrape targets
// should not be publicly reachable.
import { Hono } from 'hono'
import type { Container } from '../../../composition/container'

export function metricsRoutes(c: Container): Hono {
  const app = new Hono()
  app.get('/', async (ctx) => {
    const out = await c.metrics.render()
    if (out === null) {
      // Either the adapter has no scrape endpoint (AE) or the route was
      // mounted on a driver that hasn't wired prom-client. The createApp
      // guard already excludes Cloudflare; this is a belt-and-suspenders
      // case for misconfigured Postgres deploys.
      return ctx.json({ error: 'metrics_not_exposed_on_driver' }, 404)
    }
    return new Response(out, {
      status: 200,
      headers: { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' },
    })
  })
  return app
}
