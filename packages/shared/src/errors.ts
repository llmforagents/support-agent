import type { AdminId, SessionId } from './branded'

export type AuthError =
  | { kind: 'auth_invalid_credentials' }
  | { kind: 'auth_session_expired' }
  | { kind: 'auth_no_session' }
  | { kind: 'auth_already_onboarded' }
  | { kind: 'auth_rate_limited'; retryAfterSec: number }

export type ConversationError =
  | { kind: 'session_not_found'; sessionId: SessionId }
  | { kind: 'session_closed'; sessionId: SessionId }
  | { kind: 'invalid_state_transition'; from: string; to: string }
  | { kind: 'session_already_claimed'; operatorId: AdminId }

export type ProviderError =
  | { kind: 'llm_insufficient_balance' }
  | { kind: 'llm_unavailable'; cause: string }
  | { kind: 'llm_invalid_response'; cause: string }

export type RateLimitError = { kind: 'rate_limit_exceeded'; retryAfterSec: number }

export type InfrastructureError =
  | { kind: 'infra_db_error'; cause: string }
  | { kind: 'infra_unexpected'; cause: string }

export type IngestError =
  | { kind: 'pdf_encrypted' }
  | { kind: 'pdf_parse_failed'; reason: string }
  | { kind: 'embedding_provider_failed'; cause: string }
  | { kind: 'chunk_too_large'; chunkIndex: number; tokens: number }
  | { kind: 'unsupported_file_type'; mime: string }
  | { kind: 'file_read_failed'; cause: string }
  | { kind: 'source_not_found' }
  | { kind: 'source_invalid_state'; current: string; required: readonly string[] }

export type AppError =
  | AuthError
  | ConversationError
  | ProviderError
  | RateLimitError
  | InfrastructureError
  | IngestError
