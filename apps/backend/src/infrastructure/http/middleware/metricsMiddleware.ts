import type { MiddlewareHandler } from 'hono'
import type { Container } from '../../../composition/container'

// Strip UUIDs from the path so we don't blow up label cardinality.
// e.g. "/v1/sessions/aabbccdd-1234-..." becomes "/v1/sessions/:id".
const UUID_RE = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g

/**
 * Hono middleware that emits two metrics per request:
 *   * `http_requests_total{method,route,status}` — monotonic counter
 *   * `http_request_duration_seconds{method,route}` — latency histogram
 *
 * Mounted globally in `createApp` after request-id (so durations cover the
 * whole pipeline) and before auth (so we still count 401/403). All emits are
 * non-throwing — the adapter swallows internally.
 */
export function metricsMiddleware(c: Container): MiddlewareHandler {
  return async (ctx, next) => {
    const start = performance.now()
    const method = ctx.req.method
    // Prefer the matched route pattern (e.g. `/v1/widget/sessions/:id`) so the
    // label has stable cardinality. Fall back to the raw path for unmatched
    // routes (catch-all 404), and strip UUIDs either way as a safety net.
    const rawRoute = ctx.req.routePath ?? ctx.req.path
    const route = rawRoute.replace(UUID_RE, ':id')

    await next()

    const durationS = (performance.now() - start) / 1000
    const status = String(ctx.res.status)
    c.metrics.counter('http_requests_total', { method, route, status })
    c.metrics.histogram('http_request_duration_seconds', durationS, { method, route })
  }
}
