import type {
  AdminId, MessageId, Result, SessionId, SourceId, UsdCents, VisitorId,
  AppError,
} from '@support/shared'
import type { ConversationState, HandoffReason, Message, MessageRagHit, Session } from '../domain/conversation'
import type { ChunkHit, ChunkInsert, Source, SourceConfig, SourceState, SourceType } from '../domain/source'

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
  /** Atomic conditional update: only writes if the current state.status matches expectedStatus. */
  updateStateIf(id: SessionId, expectedStatus: ConversationState['status'], next: ConversationState): Promise<Result<{ updated: boolean }, AppError>>
  /** List sessions, optionally filtered by state status, sorted by lastActivityAt DESC. */
  listSessions(opts: { status?: ConversationState['status']; limit: number; cursor?: SessionId }): Promise<Result<readonly Session[], AppError>>
  appendMessage(input: { sessionId: SessionId; role: Message['role']; content: string; costCents: UsdCents }): Promise<Result<Message, AppError>>
  appendMessageWithId(input: { id: MessageId; sessionId: SessionId; role: Message['role']; content: string; costCents: UsdCents; ragHits?: ReadonlyArray<MessageRagHit> }): Promise<Result<Message, AppError>>
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
  | { type: 'source_progress'; sourceId: SourceId; processed: number; total: number }
  | { type: 'source_state'; sourceId: SourceId; status: string }
  | { type: 'new_handoff'; sessionId: SessionId; reason: HandoffReason }
  | { type: 'session_claimed'; sessionId: SessionId; operatorId: AdminId }
  | { type: 'session_released'; sessionId: SessionId }

export interface BroadcastPort {
  publish(channel: BroadcastChannel, event: BroadcastEvent): void
  subscribe(channel: BroadcastChannel, handler: (e: BroadcastEvent) => void): () => void
}

// ─── Knowledge base (sources) ────────────────────────────────────────
export interface KnowledgeStorePort {
  createSource(input: { name: string; sourceType: SourceType; config: SourceConfig }): Promise<Result<Source, AppError>>
  getSource(id: SourceId): Promise<Result<Source, AppError>>
  listSources(): Promise<Result<readonly Source[], AppError>>
  updateSourceState(id: SourceId, state: SourceState): Promise<Result<void, AppError>>
  setActive(id: SourceId, active: boolean): Promise<Result<void, AppError>>
  deleteSource(id: SourceId): Promise<Result<void, AppError>>
}

// ─── Vector store (chunks) ────────────────────────────────────────────
export type SearchOpts = Readonly<{ topK: number; minScore: number; activeSourceIds?: readonly SourceId[] }>

export interface VectorStorePort {
  upsertChunks(chunks: readonly ChunkInsert[]): Promise<Result<void, AppError>>
  deleteBySourceBelowGeneration(sourceId: SourceId, generation: number): Promise<Result<void, AppError>>
  search(query: readonly number[], opts: SearchOpts): Promise<Result<readonly ChunkHit[], AppError>>
  previewBySource(sourceId: SourceId, limit: number): Promise<Result<readonly ChunkHit[], AppError>>
}

// ─── File store ───────────────────────────────────────────────────────
export interface FileStorePort {
  put(key: string, data: Uint8Array, contentType: string): Promise<Result<{ ref: string }, AppError>>
  get(ref: string): Promise<Result<Uint8Array, AppError>>
  delete(ref: string): Promise<Result<void, AppError>>
}

// ─── MySQL connections ───────────────────────────────────────────────
export type MysqlConnectionRow = Readonly<{
  id: string
  name: string
  host: string
  port: number
  database: string
  user: string
  ssl: boolean
  createdAt: Date
  updatedAt: Date
}>

export interface MysqlConnectionStorePort {
  createConnection(input: { name: string; host: string; port: number; database: string; user: string; password: string; ssl: boolean }): Promise<Result<MysqlConnectionRow, AppError>>
  listConnections(): Promise<Result<readonly MysqlConnectionRow[], AppError>>
  getConnection(id: string): Promise<Result<MysqlConnectionRow, AppError>>
  /** Returns full credentials. NEVER expose via public route. */
  getCredentials(id: string): Promise<Result<{ host: string; port: number; database: string; user: string; password: string; ssl: boolean }, AppError>>
  deleteConnection(id: string): Promise<Result<void, AppError>>
}

// ─── Embedder ─────────────────────────────────────────────────────────
export interface EmbedderPort {
  embed(texts: readonly string[], apiKey: string): Promise<Result<readonly (readonly number[])[], AppError>>
  readonly dimension: number
}

// ─── LLM proxy adapter ──────────────────────────────────────────────
export type LlmStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'tool_start'; name: string; argsJson: string }
  | { type: 'tool_end'; name: string; resultText: string; durationMs: number }
  | { type: 'done'; usage: { promptTokens: number; completionTokens: number }; costCents: UsdCents }

/**
 * Minimal tool definition shape that any LLM adapter must accept.
 * HandoffTool (from handoffPrompt.ts) is structurally assignable to this.
 */
export type LlmTool = Readonly<{
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Readonly<Record<string, unknown>>
  }
}>

export type LlmRequest = Readonly<{
  apiKey: string
  model: string
  system: string
  messages: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>
  tools?: readonly LlmTool[]
  abort: AbortSignal
}>

export interface LlmPort {
  chatStream(req: LlmRequest): AsyncGenerator<LlmStreamEvent, void, void>
}
