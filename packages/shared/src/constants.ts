export const MIN_PASSWORD_LEN = 12
export const MAX_VISITOR_MESSAGE_LEN = 4000
export const MAX_HISTORY_TURNS = 20
export const SSE_HEARTBEAT_MS = 25_000
export const ADMIN_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000   // 30 days
export const STREAM_TOKEN_TTL_MS = 2 * 60 * 60 * 1000           // 2 hours
export const HANDOFF_TIMEOUT_MS = 90_000

export const VISITOR_RATE_LIMIT_MSG_PER_MIN = 30
export const VISITOR_RATE_LIMIT_MSG_PER_HOUR = 60
export const ADMIN_LOGIN_RATE_LIMIT_PER_HOUR = 10

export const DEFAULT_AGENT_MODEL = 'anthropic/claude-sonnet-4'
export const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-small'
export const DEFAULT_EMBEDDING_DIM = 1536
export const DEFAULT_PRIMARY_COLOR = '#4f46e5'
export const DEFAULT_SYSTEM_PROMPT = `Sos el asistente de soporte de {{siteName}}. Respondé en español neutro, conciso y profesional. Si no podés ayudar tras 2 intentos, ofrecé escalar a un humano.`
