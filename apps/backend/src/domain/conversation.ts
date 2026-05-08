import type { AdminId, ChunkId, MessageId, SessionId, SourceId, UsdCents, VisitorId } from '@support/shared'

export type ConversationState =
  | { readonly status: 'active_ai' }
  | { readonly status: 'handoff_requested'; readonly reason: HandoffReason; readonly requestedAt: Date }
  | { readonly status: 'active_operator'; readonly operatorId: AdminId; readonly claimedAt: Date }
  | { readonly status: 'released_to_ai'; readonly releasedAt: Date }
  | { readonly status: 'closed'; readonly closedBy: 'admin' | 'visitor' | 'timeout'; readonly closedAt: Date }

export type HandoffReason =
  | { readonly kind: 'visitor_intent'; readonly phrase: string }
  | { readonly kind: 'low_confidence'; readonly ragHits: number }
  | { readonly kind: 'ai_decision'; readonly toolReason: string; readonly category: HandoffCategory }
  | { readonly kind: 'frustration_signal'; readonly pattern: string }

export type HandoffCategory =
  | 'user_request' | 'frustration' | 'out_of_scope'
  | 'sensitive_topic' | 'repeated_failure'

export type MessageRole = 'visitor' | 'assistant' | 'operator' | 'system_event'

export type MessageRagHit = Readonly<{
  id: ChunkId
  sourceId: SourceId
  score: number
}>

export type Message = Readonly<{
  id: MessageId
  sessionId: SessionId
  role: MessageRole
  content: string
  costCents: UsdCents
  createdAt: Date
  ragHits?: ReadonlyArray<MessageRagHit>
}>

export type Session = Readonly<{
  id: SessionId
  visitorId: VisitorId
  state: ConversationState
  visitorMeta: Readonly<{ url?: string; userAgent?: string; language?: string }>
  totalCostCents: UsdCents
  createdAt: Date
  lastActivityAt: Date
  closedAt?: Date
}>
