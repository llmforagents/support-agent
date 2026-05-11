import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { randomUUID } from 'node:crypto'
import { SessionId, MessageId } from '@support/shared'
import { DurableObjectBroadcast } from '../../src/infrastructure/adapters/cloudflare/durableObjectBroadcast'

// Tiny helper: returns the next SSE chunk from the DO body decoded as text,
// or `undefined` if the stream closes. `Response.body` in the workers test
// env is `ReadableStream<any>`; this helper localizes the unsafe-assignment
// narrowing into one place so individual tests stay free of `any` plumbing.
async function nextChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
): Promise<string | undefined> {
  const r: ReadableStreamReadResult<Uint8Array> = await reader.read()
  if (r.done) return undefined
  return decoder.decode(r.value, { stream: true })
}

// Sub-typed body reader so eslint's no-unsafe-assignment doesn't trip on
// the workers-test-env's untyped `ReadableStream<any>` body. Tests know the
// DO emits bytes; encoding that knowledge once at the boundary keeps the
// rest of the test body typed.
function readerFor(body: ReadableStream<Uint8Array> | null): ReadableStreamDefaultReader<Uint8Array> {
  if (body === null) throw new Error('SSE response missing body')
  return body.getReader()
}

describe('DurableObjectBroadcast @integration', () => {
  it('publish on channel X delivers SSE chunk to subscriber on channel X', async () => {
    const bcast = new DurableObjectBroadcast(env.HUB)
    const ctrl = new AbortController()
    const channel = SessionId(randomUUID())
    const messageId = MessageId(randomUUID())

    // Open a subscriber stream. proxySubscribeRequest returns the DO's
    // Response — the route handler will eventually return this directly
    // as the SSE response to the visitor's EventSource.
    const resp = await bcast.proxySubscribeRequest(channel, ctrl.signal)
    expect(resp.ok).toBe(true)
    expect(resp.headers.get('content-type')).toContain('text/event-stream')

    const reader = readerFor(resp.body)
    const decoder = new TextDecoder()
    let received = ''

    try {
      // Drain the ": connected" preamble first.
      const first = await nextChunk(reader, decoder)
      if (first !== undefined) received += first
      expect(received).toContain(': connected')

      // Tiny breather so the DO subscriber set is populated before publish.
      // `publish` is fire-and-forget, so we want the subscribe-side fetch
      // to have completed before the publish-side fetch hits the same DO.
      await new Promise((r) => setTimeout(r, 50))

      bcast.publish(channel, { type: 'token', messageId, delta: 'hello' })

      // Read until the data: frame arrives, capped at ~2s.
      const start = Date.now()
      while (!received.includes('"delta":"hello"') && Date.now() - start < 2000) {
        const next = await nextChunk(reader, decoder)
        if (next === undefined) break
        received += next
      }
      expect(received).toContain('data:')
      expect(received).toContain('"delta":"hello"')
    } finally {
      // Cancel the reader first so the DO's TransformStream sees a closed
      // readable side; then abort the request. This order ensures the
      // DO's per-subscriber state is released before vitest-pool-workers
      // tries to snapshot DO storage at end-of-test.
      await reader.cancel().catch(() => undefined)
      ctrl.abort()
      // Yield the event loop so the DO's abort listener has a chance to
      // run before the storage-isolation check fires.
      await new Promise((r) => setTimeout(r, 10))
    }
  })

  it('publish on channel X does NOT reach a subscriber on channel Y', async () => {
    const bcast = new DurableObjectBroadcast(env.HUB)
    const ctrlY = new AbortController()
    const respY = await bcast.proxySubscribeRequest('admin_inbox', ctrlY.signal)
    const reader = readerFor(respY.body)
    const decoder = new TextDecoder()

    try {
      // Drain preamble.
      const preamble = await nextChunk(reader, decoder)
      expect(preamble ?? '').toContain(': connected')

      const otherChannel = SessionId(randomUUID())
      const messageId = MessageId(randomUUID())
      bcast.publish(otherChannel, { type: 'token', messageId, delta: 'leaked' })

      // ~500ms breather; no event should arrive on this channel.
      const racer = new Promise<string | undefined>((resolve) => {
        const t = setTimeout(() => resolve(undefined), 500)
        void nextChunk(reader, decoder).then((chunk) => {
          clearTimeout(t)
          resolve(chunk)
        })
      })
      const chunk = await racer
      expect(chunk ?? '').not.toContain('leaked')
    } finally {
      await reader.cancel().catch(() => undefined)
      ctrlY.abort()
      await new Promise((r) => setTimeout(r, 10))
    }
  })
})
