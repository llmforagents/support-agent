import type {
  AdminId, MessageId, Result, SessionId, UsdCents, VisitorId,
  AppError,
} from '@support/shared'
import type { ConversationState, Message, Session } from '../domain/conversation'

// ─── Auth & site ─────────────────────────────────────────────────────
export type AdminRow = Readonly<{
  id: AdminId
  email: string
  passwordHash: string
  createdAt: Date
  lastLoginAt?: Date
}>

export interface AdminStorePort {
  countAdmins(): Promise<Result<number, AppError>>
  insertAdmin(input: { email: string; passwordHash: string }): Promise<Result<AdminRow, AppError>>
  /** Atomic "insert only if no admin exists" — returns null if the race was lost. */
  insertFirstAdmin(input: { email: string; passwordHash: string }): Promise<Result<AdminRow | null, AppError>>
  findByEmail(email: string): Promise<Result<AdminRow | null, AppError>>
  findById(id: AdminId): Promise<Result<AdminRow | null, AppError>>
  touchLastLogin(id: AdminId): Promise<Result<void, AppError>>
}

export type AdminSessionRow = Readonly<{
  id: string
  adminId: AdminId
  expiresAt: Date
  createdAt: Date
}>

export interface AdminSessionStorePort {
  insert(input: { adminId: AdminId; tokenHash: string; expiresAt: Date }): Promise<Result<AdminSessionRow, AppError>>
  findByTokenHash(tokenHash: string): Promise<Result<AdminSessionRow | null, AppError>>
  delete(tokenHash: string): Promise<Result<void, AppError>>
  deleteExpired(): Promise<Result<number, AppError>>
}

export type SiteConfigRow = Readonly<{
  siteKey: string
  siteName: string
  primaryColor: string
  llm4agentsApiKeyEncrypted: string
  agentModel: string
  embeddingModel: string
  embeddingDim: number
  systemPrompt: string
  mcpEnabled: boolean
  handoffPolicy: Readonly<{
    autoOnLowConfidence: boolean
    autoOnFrustrationKeywords: readonly string[]
    timeoutBeforeRevertMs: number
    toolEnabled: boolean
  }>
  adminOnline: boolean
  onboardingStep: number
  onboardingCompleted: boolean
}>

export interface SiteConfigStorePort {
  get(): Promise<Result<SiteConfigRow | null, AppError>>
  upsertOnboarding(input: Partial<SiteConfigRow> & { siteKey: string }): Promise<Result<SiteConfigRow, AppError>>
  setAdminOnline(online: boolean): Promise<Result<void, AppError>>
  setOnboardingStep(step: number, completed: boolean): Promise<Result<void, AppError>>
}

// ─── Sessions & messages ────────────────────────────────────────────
export interface SessionStorePort {
  createSession(input: { visitorId: VisitorId; visitorMeta: Session['visitorMeta'] }): Promise<Result<Session, AppError>>
  getSession(id: SessionId): Promise<Result<Session, AppError>>
  updateState(id: SessionId, state: ConversationState): Promise<Result<void, AppError>>
  appendMessage(input: { sessionId: SessionId; role: Message['role']; content: string; costCents: UsdCents }): Promise<Result<Message, AppError>>
  appendMessageWithId(input: { id: MessageId; sessionId: SessionId; role: Message['role']; content: string; costCents: UsdCents }): Promise<Result<Message, AppError>>
  listMessages(id: SessionId, opts: { limit: number; afterId?: MessageId }): Promise<Result<readonly Message[], AppError>>
  bumpActivity(id: SessionId): Promise<Result<void, AppError>>
  close(id: SessionId, by: 'admin' | 'visitor' | 'timeout'): Promise<Result<void, AppError>>
}

// ─── Broadcast (SSE) ────────────────────────────────────────────────
export type BroadcastChannel = SessionId | 'admin_inbox' | 'admin_status'

export type BroadcastEvent =
  | { type: 'token'; messageId: MessageId; delta: string }
  | { type: 'message'; message: Message }
  | { type: 'state_changed'; from: ConversationState; to: ConversationState }
  | { type: 'tool_start'; toolName: string }
  | { type: 'tool_end'; toolName: string; durationMs: number }
  | { type: 'admin_status'; online: boolean }
  | { type: 'closed'; reason: string }
  | { type: 'error'; error: { code: string; message: string } }

export interface BroadcastPort {
  publish(channel: BroadcastChannel, event: BroadcastEvent): void
  subscribe(channel: BroadcastChannel, handler: (e: BroadcastEvent) => void): () => void
}

// ─── LLM proxy adapter ──────────────────────────────────────────────
export type LlmStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'tool_start'; name: string; argsJson: string }
  | { type: 'tool_end'; name: string; resultText: string; durationMs: number }
  | { type: 'done'; usage: { promptTokens: number; completionTokens: number }; costCents: UsdCents }

export type LlmRequest = Readonly<{
  apiKey: string
  model: string
  system: string
  messages: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>
  abort: AbortSignal
}>

export interface LlmPort {
  chatStream(req: LlmRequest): AsyncGenerator<LlmStreamEvent, void, void>
}
