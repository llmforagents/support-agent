import { describe, it, expect, beforeEach } from 'vitest'
import { PromClientMetrics } from './metricsPostgres'

describe('PromClientMetrics', () => {
  let m: PromClientMetrics
  beforeEach(() => {
    m = new PromClientMetrics()
  })

  it('counter increments and renders Prometheus exposition format', async () => {
    m.counter('http_requests_total', { method: 'GET', status: '200' })
    m.counter('http_requests_total', { method: 'GET', status: '200' })
    const out = await m.render()
    expect(out).toContain('# TYPE http_requests_total counter')
    expect(out).toContain('http_requests_total{method="GET",status="200"} 2')
  })

  it('histogram records observations with default buckets', async () => {
    m.histogram('http_request_duration_seconds', 0.05, { route: '/v1/sessions' })
    m.histogram('http_request_duration_seconds', 0.15, { route: '/v1/sessions' })
    const out = await m.render()
    expect(out).toContain('http_request_duration_seconds_bucket')
    expect(out).toContain('http_request_duration_seconds_count{route="/v1/sessions"} 2')
    expect(out).toContain('http_request_duration_seconds_sum')
  })

  it('gauge can be set up and down', async () => {
    m.gauge('active_sessions', 3, { tenant: 'a' })
    m.gauge('active_sessions', 5, { tenant: 'a' })
    const out = await m.render()
    expect(out).toContain('active_sessions{tenant="a"} 5')
  })

  it('lazily creates metrics on first use', async () => {
    m.counter('first_seen_counter', { tag: 'a' })
    m.counter('first_seen_counter', { tag: 'b' })
    const out = await m.render()
    expect(out).toContain('first_seen_counter{tag="a"} 1')
    expect(out).toContain('first_seen_counter{tag="b"} 1')
  })

  it('silently drops labels not present in the first call (prom-client cardinality contract)', async () => {
    m.counter('foo', { a: '1' })
    // Adding a new label key after registration is unsupported by
    // prom-client; the adapter must NOT throw. The extra label is dropped.
    expect(() => m.counter('foo', { a: '1', b: '2' })).not.toThrow()
    const out = await m.render()
    expect(out).toContain('foo{a="1"} 2')
    expect(out).not.toContain('b="2"')
  })

  it('does not throw when emit is called with no labels', async () => {
    expect(() => m.counter('untagged')).not.toThrow()
    expect(() => m.histogram('untagged_h', 0.1)).not.toThrow()
    expect(() => m.gauge('untagged_g', 1)).not.toThrow()
    const out = await m.render()
    expect(out).toContain('untagged 1')
  })
})
