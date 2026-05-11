// Per-channel SSE fan-out as a Durable Object.
//
// One DO instance per logical channel (the caller derives the id with
// `env.HUB.idFromName('session:abc')` or `idFromName('admin_inbox')`).
//
// HTTP contract (DO-internal — never exposed to the public worker):
//   POST /publish    body = raw event payload  → fanned out to every subscriber
//   GET  /subscribe                            → text/event-stream until disconnect
//
// Lifecycle notes:
//
//   - `subscribers` is in-memory state on the DO. It survives across requests
//     to the same DO id as long as the isolate isn't evicted. That's exactly
//     the semantic the in-process hub had on Node — we just trade
//     `setInterval` + in-memory Set on the worker for `idFromName` + Set on
//     the DO.
//
//   - Dead-writer detection happens INSIDE `publish`. `request.signal.aborted`
//     fires only "eventually" on Workers and isn't reliable for cleanup, so
//     we wrap every `writer.write` in try/catch and sweep failed writers from
//     the Set after each fan-out. The abort listener is still useful for the
//     fast-path (graceful client close) but `publish`'s catch-then-sweep is
//     the real safety net.
//
// Replaces `InProcessSseHub` for the Cloudflare deployment.
import { DurableObject } from 'cloudflare:workers'

type Subscriber = Readonly<{ writer: WritableStreamDefaultWriter<Uint8Array> }>

export class BroadcastHubDurableObject extends DurableObject {
  private readonly subscribers = new Set<Subscriber>()
  private readonly encoder = new TextEncoder()

  override async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    if (req.method === 'POST' && url.pathname === '/publish') {
      const raw = await req.text()
      const chunk = this.encoder.encode(`data: ${raw}\n\n`)
      const dead: Subscriber[] = []
      for (const sub of this.subscribers) {
        try {
          await sub.writer.write(chunk)
        } catch {
          dead.push(sub)
        }
      }
      for (const d of dead) this.subscribers.delete(d)
      return new Response('ok', { status: 200 })
    }

    if (req.method === 'GET' && url.pathname === '/subscribe') {
      const stream = new TransformStream<Uint8Array, Uint8Array>()
      const writer = stream.writable.getWriter()
      const sub: Subscriber = { writer }
      this.subscribers.add(sub)

      // Initial SSE comment flushes headers and confirms the connection for
      // EventSource clients waiting on the open event.
      await writer.write(this.encoder.encode(': connected\n\n'))

      req.signal.addEventListener('abort', () => {
        this.subscribers.delete(sub)
        writer.close().catch(() => undefined)
      })

      return new Response(stream.readable, {
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        },
      })
    }

    return new Response('not found', { status: 404 })
  }
}
