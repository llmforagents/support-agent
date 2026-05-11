// Alarm-driven sweep that reverts stuck handoff requests back to active_ai.
//
// Singleton DO (caller derives via `env.HANDOFF_TIMER.idFromName('singleton')`).
// Activated by `POST /start` from the worker entrypoint; from then on the
// alarm re-arms itself every `POLL_INTERVAL_MS`.
//
// Sweep semantics — mirrors `HandoffTimeoutScheduler` (Node/Pg deployment):
//
//   * Find every session where `status_kind = 'handoff_requested'` AND
//     `last_activity_at` is older than `HANDOFF_TIMEOUT_MS`. The query hits
//     the `sessions_status_kind_idx` (status_kind, last_activity_at) index
//     from migration 0003.
//   * Compare-and-swap revert: the UPDATE filters on
//     `status_kind = 'handoff_requested'` so if an operator claimed the
//     session between the SELECT and the UPDATE the row is left alone (the
//     operator's `status_kind = 'active_human'` write wins).
//   * `state` JSON, `status_kind`, and `last_activity_at` move atomically in
//     the same UPDATE — the inbox index is keyed on `status_kind`, so any
//     drift between the JSON column and the denormalised column would
//     mis-route the next inbox poll.
//
// Cutoff date format must match what `D1SessionStore` writes into
// `last_activity_at` — SQLite's native `YYYY-MM-DD HH:MM:SS`, produced by
// `toSqliteDatetime` from `./dateUtils.ts`. Mixing ISO-Z and SQLite-format
// strings in a `<` compare sorts correctly today by accident and breaks the
// moment one side gains a fractional part or a `Z` suffix.
//
// Replaces `HandoffTimeoutScheduler` for the Cloudflare deployment.
import { DurableObject } from 'cloudflare:workers'
import { toSqliteDatetime } from './dateUtils'
import { AnalyticsEngineMetrics } from '../../observability/metricsCloudflare'
import { noopMetrics, type MetricsPort } from '../../observability/metrics'

const POLL_INTERVAL_MS = 15_000
const HANDOFF_TIMEOUT_MS = 90_000

// METRICS is optional so local `wrangler dev` without the Analytics Engine
// binding (and vitest-pool-workers, which has no AE pool) keeps working —
// the DO falls back to `noopMetrics` when the binding is absent. The CF
// runtime hands all worker bindings to DOs via `env` by default, so adding
// the field here is sufficient; no extra wrangler.toml entry is required.
type Bindings = Readonly<{ DB: D1Database; METRICS?: AnalyticsEngineDataset }>

export class HandoffTimeoutDurableObject extends DurableObject<Bindings> {
  override async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    if (req.method === 'POST' && url.pathname === '/start') {
      const current = await this.ctx.storage.getAlarm()
      if (current === null) {
        await this.ctx.storage.setAlarm(Date.now() + POLL_INTERVAL_MS)
      }
      return new Response('started', { status: 200 })
    }
    return new Response('not found', { status: 404 })
  }

  override async alarm(): Promise<void> {
    const cutoff = toSqliteDatetime(new Date(Date.now() - HANDOFF_TIMEOUT_MS))
    const rows = await this.env.DB.prepare(
      `SELECT id FROM sessions
        WHERE status_kind = 'handoff_requested'
          AND last_activity_at < ?`,
    )
      .bind(cutoff)
      .all<{ id: string }>()

    let reverted = 0
    for (const row of rows.results) {
      const nextState = JSON.stringify({ status: 'active_ai' })
      // CAS revert — `WHERE status_kind = 'handoff_requested'` ensures an
      // operator who claimed the session in between the SELECT and the
      // UPDATE wins the race.
      const upd = await this.env.DB.prepare(
        `UPDATE sessions
            SET state = ?,
                status_kind = 'active_ai',
                last_activity_at = datetime('now')
          WHERE id = ?
            AND status_kind = 'handoff_requested'`,
      )
        .bind(nextState, row.id)
        .run()
      // Count only rows the CAS actually flipped — operator claims in-flight
      // would land here as `changes === 0`.
      if (upd.meta.changes > 0) reverted++
    }

    if (reverted > 0) {
      const metrics: MetricsPort = this.env.METRICS
        ? new AnalyticsEngineMetrics(this.env.METRICS)
        : noopMetrics
      metrics.counter('handoff_timeout_reverts_total', {}, reverted)
    }

    await this.ctx.storage.setAlarm(Date.now() + POLL_INTERVAL_MS)
  }
}
