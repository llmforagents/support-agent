import { HANDOFF_TIMEOUT_MS } from '@support/shared'
import { timeoutRevert } from '../../application/chat/conversationTransitions'
import type { SessionStorePort, BroadcastPort } from '../../application/ports'
import type { Logger } from '../observability/logger'
import type { MetricsPort } from '../observability/metrics'
import { noopMetrics } from '../observability/metrics'

const POLL_INTERVAL_MS = 15_000

/**
 * Lifecycle handle held by the Container. Both the Node-side polling scheduler
 * (this file) and the Cloudflare DO-based equivalent satisfy it; routes never
 * read it directly — only compose `shutdown()` calls `stop()`.
 */
export interface HandoffTimeoutSchedulerHandle {
  start(): void
  stop(): void
}

export class HandoffTimeoutScheduler implements HandoffTimeoutSchedulerHandle {
  private timer: NodeJS.Timeout | null = null
  private readonly metrics: MetricsPort

  constructor(
    private readonly sessionStore: SessionStorePort,
    private readonly broadcast: BroadcastPort,
    private readonly logger?: Logger,
    private readonly pollIntervalMs: number = POLL_INTERVAL_MS,
    metrics: MetricsPort = noopMetrics,
  ) {
    this.metrics = metrics
  }

  start(): void {
    if (this.timer) return  // already running
    this.timer = setInterval(() => {
      void this.tick().catch((err: unknown) => {
        this.logger?.warn({ err }, 'handoffTimeoutScheduler: tick threw')
      })
    }, this.pollIntervalMs)
    if (this.timer.unref) this.timer.unref()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Exposed for tests — runs a single tick and resolves when done. */
  async tick(): Promise<void> {
    const now = Date.now()
    const r = await this.sessionStore.listSessions({ status: 'handoff_requested', limit: 100 })
    if (!r.ok) {
      this.logger?.warn({ err: r.error }, 'handoffTimeoutScheduler: listSessions failed')
      return
    }
    let reverted = 0
    for (const sess of r.value) {
      if (sess.state.status !== 'handoff_requested') continue
      const requestedAt = new Date(sess.state.requestedAt).getTime()
      const age = now - requestedAt
      if (age < HANDOFF_TIMEOUT_MS) continue
      const trans = timeoutRevert(sess.state)
      if (!trans.ok) continue
      const upd = await this.sessionStore.updateStateIf(sess.id, 'handoff_requested', trans.next)
      if (!upd.ok) {
        this.logger?.warn({ err: upd.error, sessionId: sess.id }, 'handoffTimeoutScheduler: updateStateIf failed')
        continue
      }
      if (!upd.value.updated) continue   // race lost — admin claimed in between
      this.broadcast.publish(sess.id, { type: 'state_changed', from: sess.state, to: trans.next })
      this.logger?.info({ sessionId: sess.id, ageMs: age }, 'handoff timeout reverted')
      reverted++
    }
    if (reverted > 0) {
      this.metrics.counter('handoff_timeout_reverts_total', {}, reverted)
    }
  }
}
