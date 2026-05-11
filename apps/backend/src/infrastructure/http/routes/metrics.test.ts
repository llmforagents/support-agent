import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { metricsRoutes } from './metrics'
import { PromClientMetrics } from '../../observability/metricsPostgres'
import { RecordingMetrics } from '../../../../tests/helpers/recordingMetrics'
import { buildTestApp } from '../../../../tests/helpers/testApp'
import type { Container } from '../../../composition/container'

function makeContainerWithMetrics(metrics: PromClientMetrics): Container {
  // The route only touches c.metrics.render(); cast through unknown so we
  // don't have to fabricate the full Container surface.
  return { metrics } as unknown as Container
}

describe('GET /metrics', () => {
  it('returns prometheus exposition format when adapter renders text', async () => {
    const metrics = new PromClientMetrics()
    metrics.counter('http_requests_total', { method: 'GET', route: '/healthz', status: '200' })
    metrics.histogram('http_request_duration_seconds', 0.01, { method: 'GET', route: '/healthz' })

    const app = new Hono()
    app.route('/metrics', metricsRoutes(makeContainerWithMetrics(metrics)))

    const r = await app.request('/metrics')
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toContain('text/plain')
    const body = await r.text()
    expect(body).toContain('http_requests_total')
    expect(body).toContain('http_request_duration_seconds')
  })

  it('returns 404 when the adapter has no scrape endpoint (render() returns null)', async () => {
    // RecordingMetrics.render() resolves to null — simulates the AE path.
    const app = new Hono()
    app.route('/metrics', metricsRoutes(
      { metrics: new RecordingMetrics() } as unknown as Container,
    ))
    const r = await app.request('/metrics')
    expect(r.status).toBe(404)
  })

  it('createApp does NOT register /metrics on the cloudflare driver', async () => {
    const { app } = buildTestApp({ driver: 'cloudflare' })
    const r = await app.request('/metrics')
    expect(r.status).toBe(404)
  })

  it('createApp registers /metrics on the postgres driver (defaults to RecordingMetrics → 404 body)', async () => {
    // The default test app injects RecordingMetrics whose render() is null,
    // so the route handler returns 404. The point of this test is to prove
    // the createApp branch *did* register the route — a different driver
    // would not even reach the handler.
    const { app } = buildTestApp({ driver: 'postgres' })
    const r = await app.request('/metrics')
    expect(r.status).toBe(404)
    const body = await r.json() as { error: string }
    expect(body.error).toBe('metrics_not_exposed_on_driver')
  })
})
