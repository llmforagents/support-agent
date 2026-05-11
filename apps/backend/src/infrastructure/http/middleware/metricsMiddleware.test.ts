import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { metricsMiddleware } from './metricsMiddleware'
import { RecordingMetrics } from '../../../../tests/helpers/recordingMetrics'
import type { Container } from '../../../composition/container'

function makeStubContainer(metrics: RecordingMetrics): Container {
  // Minimal shape — middleware only touches c.metrics. Cast through unknown
  // since fabricating the full Container surface would not add coverage.
  return { metrics } as unknown as Container
}

describe('metricsMiddleware', () => {
  it('emits counter + histogram for every request with method, route, status', async () => {
    const metrics = new RecordingMetrics()
    const app = new Hono()
    app.use('*', metricsMiddleware(makeStubContainer(metrics)))
    app.get('/healthz', (c) => c.text('ok'))

    const res = await app.request('/healthz', { method: 'GET' })
    expect(res.status).toBe(200)

    const calls = metrics.calls
    const counter = calls.find((c) => c.kind === 'counter' && c.name === 'http_requests_total')
    expect(counter).toBeDefined()
    expect(counter?.labels).toMatchObject({ method: 'GET', status: '200' })

    const hist = calls.find((c) => c.kind === 'histogram' && c.name === 'http_request_duration_seconds')
    expect(hist).toBeDefined()
    expect(hist?.labels).toMatchObject({ method: 'GET' })
    expect(hist?.value ?? -1).toBeGreaterThanOrEqual(0)
  })

  it('strips UUIDs from the route label', async () => {
    const metrics = new RecordingMetrics()
    const app = new Hono()
    app.use('*', metricsMiddleware(makeStubContainer(metrics)))
    app.get('/v1/sessions/:id', (c) => c.text('ok'))

    await app.request('/v1/sessions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    const counter = metrics.calls.find((c) => c.kind === 'counter' && c.name === 'http_requests_total')
    // Hono populates routePath = '/v1/sessions/:id' — no UUID survives. The
    // fallback path (no routePath) would also be cleaned by UUID_RE.
    expect(String(counter?.labels['route'] ?? '')).not.toMatch(/[a-f0-9]{8}-/)
  })

  it('records error responses (status 5xx) too', async () => {
    const metrics = new RecordingMetrics()
    const app = new Hono()
    app.use('*', metricsMiddleware(makeStubContainer(metrics)))
    app.get('/boom', () => { throw new Error('oops') })
    // Hono converts uncaught errors to a 500 by default.
    const res = await app.request('/boom')
    expect(res.status).toBe(500)
    const counter = metrics.calls.find((c) => c.kind === 'counter' && c.name === 'http_requests_total')
    expect(counter?.labels['status']).toBe('500')
  })
})
