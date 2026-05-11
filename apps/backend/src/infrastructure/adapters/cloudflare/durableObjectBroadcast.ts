// Cloudflare-side BroadcastPort implementation.
//
// Per channel name we resolve a singleton `BroadcastHubDurableObject`
// (one isolate per logical channel via `idFromName(channel)`). `publish`
// forwards the event payload to the DO; the DO does the fan-out to every
// open SSE subscriber it currently holds.
//
// `subscribe` is intentionally a no-op stub: on Workers we cannot keep an
// in-process listener alive for the duration of an SSE request — the
// isolate may be evicted, or the response stream may outlive the calling
// fetch handler. Instead, SSE route handlers detect (via duck-typing) the
// `proxySubscribeRequest` method below and return the DO's SSE stream
// directly as the route response. That keeps the long-lived stream owned
// by the DO, not the worker.
import type {
  BroadcastChannel,
  BroadcastEvent,
  BroadcastPort,
} from '../../../application/ports'

export class DurableObjectBroadcast implements BroadcastPort {
  constructor(private readonly ns: DurableObjectNamespace) {}

  publish(channel: BroadcastChannel, event: BroadcastEvent): void {
    const stub = this.ns.get(this.ns.idFromName(channel))
    // Fire-and-forget per BroadcastPort contract. The worker isolate may
    // terminate before the DO returns — SSE delivery is best-effort, and
    // the DO sweeps dead writers on its next publish anyway.
    void stub
      .fetch('http://hub/publish', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: { 'content-type': 'application/json' },
      })
      .catch(() => undefined)
  }

  subscribe(_channel: BroadcastChannel, _handler: (e: BroadcastEvent) => void): () => void {
    // No-op on Workers — see file header. SSE routes use
    // `proxySubscribeRequest` instead of an in-process handler.
    return () => undefined
  }

  // Cloudflare-only helper. Not part of `BroadcastPort` — SSE route
  // handlers detect it via duck-typing and return the DO's SSE response
  // directly, so the long-lived stream is owned by the DO.
  proxySubscribeRequest(channel: BroadcastChannel, signal: AbortSignal): Promise<Response> {
    const stub = this.ns.get(this.ns.idFromName(channel))
    return stub.fetch('http://hub/subscribe', { method: 'GET', signal })
  }
}
