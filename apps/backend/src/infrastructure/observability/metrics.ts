// MetricsPort — the application-side interface for emitting telemetry.
//
// Two adapters implement this interface:
//   * PromClientMetrics (Node + Postgres deploy) — backed by `prom-client`,
//     exposed via `/metrics` for Prometheus scraping.
//   * AnalyticsEngineMetrics (Cloudflare deploy) — writes data points to a
//     bound Analytics Engine dataset. Queryable via the AE REST API. No
//     scrape endpoint (render() returns null).
//
// Application code emits the same calls regardless of driver — the
// composition root picks the adapter based on STORAGE_DRIVER.
//
// All emit methods are non-throwing by contract: a metrics failure must
// NEVER fail a request.

// Labels are flat string/number values. Prometheus requires fixed label
// keys per metric; prom-client throws if a new key appears after
// registration. The Node adapter silently drops unknown keys; the CF
// adapter folds them into AE blobs. Either way, callers should self-declare
// the full label-key set on their first emit for a given metric.
export type LabelSet = Readonly<Record<string, string | number>>

export interface MetricsPort {
  /** Monotonic counter — request count, error count, etc. */
  counter(name: string, labels?: LabelSet, value?: number): void

  /** Distribution — request latency seconds, LLM cost cents, etc. */
  histogram(name: string, value: number, labels?: LabelSet): void

  /** Point-in-time — active session count, queue depth, etc. */
  gauge(name: string, value: number, labels?: LabelSet): void

  /**
   * Render the registry in Prometheus exposition format.
   * Returns null when the adapter has no scrape endpoint (e.g. Cloudflare AE).
   */
  render(): Promise<string | null>
}

/**
 * No-op MetricsPort. Used by the Cloudflare composition when no Analytics
 * Engine binding is configured (dev/test) and by tests that don't care
 * about metric assertions.
 */
export const noopMetrics: MetricsPort = {
  counter: () => undefined,
  histogram: () => undefined,
  gauge: () => undefined,
  render: () => Promise.resolve(null),
}
