/**
 * sseClient.ts — SSE connection to /v1/widget/sessions/:id/stream.
 *
 * Validates each incoming event with Zod, so malformed server frames
 * are discarded rather than crashing the UI.
 */

import { z } from 'zod'
import type { SseEvent } from '../types'

// ─── Zod schema for SSE frames ────────────────────────────────────────────────

const MessageRoleSchema = z.enum(['visitor', 'assistant', 'operator', 'system_event'])

const SseEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('connected'), sessionId: z.string(), state: z.object({ status: z.string() }) }),
  z.object({ type: z.literal('token'), messageId: z.string(), delta: z.string() }),
  z.object({
    type: z.literal('message'),
    message: z.object({
      id: z.string(),
      role: MessageRoleSchema,
      content: z.string(),
      createdAt: z.string(),
    }),
  }),
  z.object({
    type: z.literal('state_changed'),
    from: z.object({ status: z.string() }),
    to: z.object({ status: z.string() }),
  }),
  z.object({ type: z.literal('admin_status'), online: z.boolean() }),
  z.object({ type: z.literal('closed'), reason: z.string() }),
  z.object({ type: z.literal('error'), error: z.object({ code: z.string(), message: z.string() }) }),
  z.object({ type: z.literal('ping') }),
])

// ─── Public API ───────────────────────────────────────────────────────────────

export type SseClientOptions = Readonly<{
  /** Backend origin, e.g. "" for same-origin or "https://api.example.com" */
  baseUrl: string
  sessionId: string
  streamToken: string
  visitorId: string
  onEvent: (event: SseEvent) => void
  onError: (err: unknown) => void
}>

export type SseClient = Readonly<{
  close: () => void
}>

const BASE = '/v1/widget'

export function connectSse(opts: SseClientOptions): SseClient {
  const { baseUrl, sessionId, streamToken, visitorId, onEvent, onError } = opts

  const url = new URL(
    `${BASE}/sessions/${sessionId}/stream`,
    baseUrl !== '' ? baseUrl : window.location.origin,
  )
  url.searchParams.set('token', streamToken)
  // EventSource has no custom-header API, so we ship the visitor id as a
  // query param. The backend reconstructs the stream-token payload as
  // { sessionId, visitorId } and verifies the HMAC against it — a forged
  // visitorId fails signature check and the stream is rejected.
  url.searchParams.set('visitorId', visitorId)

  const es = new EventSource(url.toString())

  es.addEventListener('message', (ev) => {
    let raw: unknown
    try {
      raw = JSON.parse(ev.data) as unknown
    } catch {
      return // ignore non-JSON frames
    }

    const parsed = SseEventSchema.safeParse(raw)
    if (!parsed.success) {
      return // discard malformed frames silently
    }

    onEvent(parsed.data)
  })

  es.addEventListener('error', (ev) => {
    onError(ev)
  })

  return {
    close(): void {
      es.close()
    },
  }
}
