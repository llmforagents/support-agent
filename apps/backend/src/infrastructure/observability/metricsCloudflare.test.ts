import { describe, it, expect, vi } from 'vitest'
import { AnalyticsEngineMetrics } from './metricsCloudflare'

type WriteArg = Readonly<{
  blobs: readonly string[]
  doubles: readonly number[]
  indexes: readonly string[]
}>

function makeDs(): { writeDataPoint: ReturnType<typeof vi.fn> } {
  return { writeDataPoint: vi.fn() }
}

function lastCall(ds: { writeDataPoint: ReturnType<typeof vi.fn> }): WriteArg {
  const calls = ds.writeDataPoint.mock.calls
  const first = calls[0]
  if (!first) throw new Error('writeDataPoint was not called')
  return first[0] as WriteArg
}

describe('AnalyticsEngineMetrics', () => {
  it('counter writes a data point with name + labels in blobs and value in doubles', () => {
    const ds = makeDs()
    const m = new AnalyticsEngineMetrics(ds as unknown as AnalyticsEngineDataset)
    m.counter('http_requests_total', { method: 'GET', status: '200' })
    expect(ds.writeDataPoint).toHaveBeenCalledTimes(1)
    const arg = lastCall(ds)
    expect(arg.blobs[0]).toBe('http_requests_total')
    expect(arg.blobs).toContain('counter')
    expect(arg.blobs.some((b) => b.includes('method=GET'))).toBe(true)
    expect(arg.doubles[0]).toBe(1)
    expect(arg.indexes[0]).toBe('http_requests_total')
  })

  it('histogram puts the observation value in doubles[0]', () => {
    const ds = makeDs()
    const m = new AnalyticsEngineMetrics(ds as unknown as AnalyticsEngineDataset)
    m.histogram('llm_latency_seconds', 0.42, { provider: 'openai' })
    const arg = lastCall(ds)
    expect(arg.doubles[0]).toBeCloseTo(0.42)
  })

  it('gauge writes a single point', () => {
    const ds = makeDs()
    const m = new AnalyticsEngineMetrics(ds as unknown as AnalyticsEngineDataset)
    m.gauge('active_sessions', 7)
    const arg = lastCall(ds)
    expect(arg.doubles[0]).toBe(7)
    expect(arg.blobs).toContain('gauge')
  })

  it('render returns null (AE has no scrape endpoint)', async () => {
    const ds = makeDs()
    const m = new AnalyticsEngineMetrics(ds as unknown as AnalyticsEngineDataset)
    expect(await m.render()).toBeNull()
  })

  it('swallows writeDataPoint errors so metric emit never throws', () => {
    const ds = {
      writeDataPoint: vi.fn().mockImplementation(() => {
        throw new Error('AE down')
      }),
    }
    const m = new AnalyticsEngineMetrics(ds as unknown as AnalyticsEngineDataset)
    expect(() => m.counter('x')).not.toThrow()
  })

  it('caps blobs at 20 (AE limit)', () => {
    const ds = makeDs()
    const m = new AnalyticsEngineMetrics(ds as unknown as AnalyticsEngineDataset)
    const labels: Record<string, string> = {}
    for (let i = 0; i < 30; i++) labels[`k${i}`] = String(i)
    m.counter('many_labels', labels)
    const arg = lastCall(ds)
    expect(arg.blobs.length).toBeLessThanOrEqual(20)
  })
})
