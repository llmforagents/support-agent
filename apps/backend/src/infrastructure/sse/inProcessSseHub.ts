import type { BroadcastChannel, BroadcastEvent, BroadcastPort } from '../../application/ports'
import type { Logger } from '../observability/logger'

export class InProcessSseHub implements BroadcastPort {
  private subs = new Map<BroadcastChannel, Set<(e: BroadcastEvent) => void>>()
  constructor(private readonly logger?: Logger) {}

  publish(channel: BroadcastChannel, event: BroadcastEvent): void {
    const set = this.subs.get(channel)
    if (!set) return
    for (const fn of set) {
      try { fn(event) } catch (err) { this.logger?.error({ err }, '[sse] handler threw') }
    }
  }

  subscribe(channel: BroadcastChannel, handler: (e: BroadcastEvent) => void): () => void {
    let set = this.subs.get(channel)
    if (!set) { set = new Set(); this.subs.set(channel, set) }
    const finalSet = set
    finalSet.add(handler)
    return () => {
      finalSet.delete(handler)
      if (finalSet.size === 0) this.subs.delete(channel)
    }
  }
}
