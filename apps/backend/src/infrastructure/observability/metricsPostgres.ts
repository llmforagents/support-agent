// PromClientMetrics — Node-side adapter for MetricsPort, backed by
// `prom-client`. Used by the Postgres composition; exposed via `/metrics`
// for Prometheus scraping.
//
// Cardinality contract: prom-client requires the same set of label KEYS on
// every observation for a given metric. The set is fixed by the FIRST
// `emit()` call for that metric. Subsequent calls with extra keys silently
// drop the new keys; subsequent calls missing some keys substitute an
// empty string. Callers should therefore self-declare the full label-key
// set on their first emit so this drop is non-surprising.
//
// All emit methods are non-throwing — a metrics emission failure must
// NEVER fail a request. The swallowed-catch blocks are deliberate.

import { Counter, Histogram, Gauge, Registry, type LabelValues } from 'prom-client'
import type { MetricsPort, LabelSet } from './metrics'

// Histogram buckets in seconds, suitable for request latency. Override
// with an explicit metric registration if a different scale is needed
// (not exposed yet — add a dedicated method when the first caller asks).
const DEFAULT_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
] as const

type MetricKind = 'counter' | 'histogram' | 'gauge'

type AnyMetric =
  | { kind: 'counter'; metric: Counter<string>; labels: readonly string[] }
  | { kind: 'histogram'; metric: Histogram<string>; labels: readonly string[] }
  | { kind: 'gauge'; metric: Gauge<string>; labels: readonly string[] }

export class PromClientMetrics implements MetricsPort {
  private readonly registry = new Registry()
  private readonly metrics = new Map<string, AnyMetric>()

  counter(name: string, labels: LabelSet = {}, value: number = 1): void {
    try {
      const m = this.lazyGet(name, 'counter', labels)
      if (m.kind !== 'counter') return
      m.metric.inc(this.pickLabels(labels, m.labels), value)
    } catch {
      /* metrics must never fail a request */
    }
  }

  histogram(name: string, value: number, labels: LabelSet = {}): void {
    try {
      const m = this.lazyGet(name, 'histogram', labels)
      if (m.kind !== 'histogram') return
      m.metric.observe(this.pickLabels(labels, m.labels), value)
    } catch {
      /* swallow */
    }
  }

  gauge(name: string, value: number, labels: LabelSet = {}): void {
    try {
      const m = this.lazyGet(name, 'gauge', labels)
      if (m.kind !== 'gauge') return
      m.metric.set(this.pickLabels(labels, m.labels), value)
    } catch {
      /* swallow */
    }
  }

  render(): Promise<string | null> {
    return this.registry.metrics()
  }

  private lazyGet(name: string, kind: MetricKind, labels: LabelSet): AnyMetric {
    const existing = this.metrics.get(name)
    if (existing) return existing
    const labelNames = Object.keys(labels)
    let m: AnyMetric
    switch (kind) {
      case 'counter':
        m = {
          kind,
          metric: new Counter({
            name,
            help: name,
            labelNames,
            registers: [this.registry],
          }),
          labels: labelNames,
        }
        break
      case 'histogram':
        m = {
          kind,
          metric: new Histogram({
            name,
            help: name,
            labelNames,
            buckets: [...DEFAULT_BUCKETS],
            registers: [this.registry],
          }),
          labels: labelNames,
        }
        break
      case 'gauge':
        m = {
          kind,
          metric: new Gauge({
            name,
            help: name,
            labelNames,
            registers: [this.registry],
          }),
          labels: labelNames,
        }
        break
    }
    this.metrics.set(name, m)
    return m
  }

  /**
   * Project a caller-supplied LabelSet onto the label keys registered for
   * a given metric. Unknown keys are dropped (prom-client throws otherwise),
   * and values are stringified for prom-client's `LabelValues` shape.
   */
  private pickLabels(input: LabelSet, allowed: readonly string[]): LabelValues<string> {
    const out: Record<string, string> = {}
    for (const k of allowed) {
      const v = input[k]
      if (v !== undefined) out[k] = String(v)
    }
    return out
  }
}
