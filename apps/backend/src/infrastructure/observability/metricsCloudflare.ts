// AnalyticsEngineMetrics — Cloudflare adapter for MetricsPort.
//
// Cloudflare Analytics Engine takes "data points" with up to 20 string
// blobs + 20 doubles + 1 index. Each `emit()` call becomes one
// `writeDataPoint` call on the bound dataset:
//   * blobs[0]     = metric name
//   * blobs[1]     = kind ('counter' | 'histogram' | 'gauge')
//   * blobs[2..]   = label strings encoded as 'key=value' (truncated to
//                    stay within the 20-blob AE limit)
//   * doubles[0]   = observation value
//   * indexes[0]   = metric name (cheap dataset queries by metric)
//
// AE has no scrape endpoint — `render()` returns `null`. Query data via
// the Cloudflare Analytics Engine REST API.
//
// `writeDataPoint` is fire-and-forget on Cloudflare's side; failures
// surface as thrown errors only if the binding itself is misconfigured.
// We still swallow throws — a metrics emission failure must NEVER fail
// a request.

import type { MetricsPort, LabelSet } from './metrics'

// AE caps each data point at 20 blobs total. We use 2 for name+kind, so
// up to 18 label slots remain; extra labels are silently dropped.
const MAX_BLOBS = 20

type MetricKind = 'counter' | 'histogram' | 'gauge'

export class AnalyticsEngineMetrics implements MetricsPort {
  constructor(private readonly ds: AnalyticsEngineDataset) {}

  counter(name: string, labels: LabelSet = {}, value: number = 1): void {
    this.write(name, 'counter', value, labels)
  }

  histogram(name: string, value: number, labels: LabelSet = {}): void {
    this.write(name, 'histogram', value, labels)
  }

  gauge(name: string, value: number, labels: LabelSet = {}): void {
    this.write(name, 'gauge', value, labels)
  }

  render(): Promise<string | null> {
    return Promise.resolve(null)
  }

  private write(name: string, kind: MetricKind, value: number, labels: LabelSet): void {
    const blobs: string[] = [name, kind]
    for (const [k, v] of Object.entries(labels)) {
      if (blobs.length >= MAX_BLOBS) break
      blobs.push(`${k}=${String(v)}`)
    }
    try {
      this.ds.writeDataPoint({ blobs, doubles: [value], indexes: [name] })
    } catch {
      /* AE failures must never break a request */
    }
  }
}
