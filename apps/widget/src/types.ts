/**
 * types.ts — widget domain types.
 *
 * Intentionally self-contained: no workspace dependency on @support/shared
 * since the widget is bundled as a standalone artifact.
 */

// ─── Result ──────────────────────────────────────────────────────────────────

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error })

export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`)
}

// ─── Chat domain ──────────────────────────────────────────────────────────────

export type MessageRole = 'visitor' | 'assistant' | 'operator' | 'system_event'

export type ChatMessage = Readonly<{
  id: string
  role: MessageRole
  content: string
  createdAt: Date
}>

// SSE event shapes (subset we care about in the widget)
export type SseEvent =
  | { type: 'connected'; sessionId: string; state: { status: string } }
  | { type: 'token'; messageId: string; delta: string }
  | { type: 'message'; message: { id: string; role: MessageRole; content: string; createdAt: string } }
  | { type: 'state_changed'; from: { status: string }; to: { status: string } }
  | { type: 'admin_status'; online: boolean }
  | { type: 'closed'; reason: string }
  | { type: 'error'; error: { code: string; message: string } }
  | { type: 'ping' }

// ─── Widget config ────────────────────────────────────────────────────────────

export type WidgetConfig = Readonly<{
  siteKey: string
  siteName: string
  primaryColor: string
  adminOnline: boolean
}>

// ─── Visitor ID ───────────────────────────────────────────────────────────────

const VISITOR_ID_KEY = 'llm4agents_visitor_id'

function uuidV4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function getOrCreateVisitorId(): string {
  const stored = localStorage.getItem(VISITOR_ID_KEY)
  if (stored) return stored
  const id = uuidV4()
  localStorage.setItem(VISITOR_ID_KEY, id)
  return id
}
