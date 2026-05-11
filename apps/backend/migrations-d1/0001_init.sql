-- apps/backend/migrations-d1/0001_init.sql
-- D1/SQLite parallel of migrations/0001_init.sql.
-- Type mapping: UUID -> TEXT, CITEXT -> TEXT COLLATE NOCASE,
-- TIMESTAMPTZ -> TEXT (ISO-8601), JSONB -> TEXT (caller stringifies),
-- BOOLEAN -> INTEGER (0/1). DEFAULT NOW() -> DEFAULT (datetime('now')).
-- The runner sets PRAGMA foreign_keys = ON so ON DELETE CASCADE applies.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE admins (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE admin_sessions (
  id          TEXT PRIMARY KEY,
  admin_id    TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX admin_sessions_token_idx ON admin_sessions(token_hash);
CREATE INDEX admin_sessions_expiry_idx ON admin_sessions(expires_at);

CREATE TABLE site_config (
  id                              INTEGER PRIMARY KEY CHECK (id = 1),
  site_key                        TEXT NOT NULL UNIQUE,
  site_name                       TEXT NOT NULL,
  primary_color                   TEXT NOT NULL DEFAULT '#4f46e5',
  llm4agents_api_key_encrypted    TEXT NOT NULL,
  agent_model                     TEXT NOT NULL DEFAULT 'anthropic/claude-sonnet-4',
  embedding_model                 TEXT NOT NULL DEFAULT 'openai/text-embedding-3-small',
  embedding_dim                   INTEGER NOT NULL DEFAULT 1536,
  system_prompt                   TEXT NOT NULL,
  mcp_enabled                     INTEGER NOT NULL DEFAULT 0,
  handoff_policy                  TEXT NOT NULL,
  admin_online                    INTEGER NOT NULL DEFAULT 0,
  onboarding_step                 INTEGER NOT NULL DEFAULT 1,
  onboarding_completed            INTEGER NOT NULL DEFAULT 0,
  updated_at                      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id                TEXT PRIMARY KEY,
  visitor_id        TEXT NOT NULL,
  state             TEXT NOT NULL,          -- JSON: { status, operatorId?, claimedAt?, ... }
  visitor_meta      TEXT NOT NULL DEFAULT '{}',
  total_cost_cents  INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  last_activity_at  TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at         TEXT
);
CREATE INDEX sessions_visitor_idx ON sessions(visitor_id);
CREATE INDEX sessions_active_idx ON sessions(last_activity_at DESC) WHERE closed_at IS NULL;
CREATE INDEX sessions_last_activity_idx ON sessions(last_activity_at);

CREATE TABLE messages (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('visitor','assistant','operator','system_event')),
  content      TEXT NOT NULL,
  tool_calls   TEXT,
  rag_hits     TEXT,
  cost_cents   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX messages_session_idx ON messages(session_id, created_at);

CREATE TABLE conversation_events (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event       TEXT NOT NULL,          -- JSON discriminated union { kind, ...payload }
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX conversation_events_session_idx ON conversation_events(session_id, created_at);
