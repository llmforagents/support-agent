import type { MetricsPort, LabelSet } from '../../src/infrastructure/observability/metrics'

export type RecordedCall = Readonly<{
  kind: 'counter' | 'histogram' | 'gauge'
  name: string
  value: number
  labels: LabelSet
}>

/**
 * In-memory MetricsPort that retains every emit call for inspection by
 * tests. Used in lieu of a real adapter so tests can assert against the
 * metric stream without running prom-client or AE.
 */
export class RecordingMetrics implements MetricsPort {
  readonly calls: RecordedCall[] = []

  counter(name: string, labels: LabelSet = {}, value: number = 1): void {
    this.calls.push({ kind: 'counter', name, value, labels })
  }

  histogram(name: string, value: number, labels: LabelSet = {}): void {
    this.calls.push({ kind: 'histogram', name, value, labels })
  }

  gauge(name: string, value: number, labels: LabelSet = {}): void {
    this.calls.push({ kind: 'gauge', name, value, labels })
  }

  render(): Promise<string | null> {
    return Promise.resolve(null)
  }
}

// Re-export the production noop so test code can grab it from the same
// helper module when it doesn't need to assert against the recorded stream.
export { noopMetrics } from '../../src/infrastructure/observability/metrics'
