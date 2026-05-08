-- apps/backend/migrations/0001_init.sql

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version  TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admins (
  id            UUID PRIMARY KEY,
  email         CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE admin_sessions (
  id          UUID PRIMARY KEY,
  admin_id    UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX admin_sessions_token_idx ON admin_sessions(token_hash);
CREATE INDEX admin_sessions_expiry_idx ON admin_sessions(expires_at);

CREATE TABLE site_config (
  id                              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  site_key                        TEXT UNIQUE NOT NULL,
  site_name                       TEXT NOT NULL,
  primary_color                   TEXT NOT NULL DEFAULT '#4f46e5',
  llm4agents_api_key_encrypted    TEXT NOT NULL,
  agent_model                     TEXT NOT NULL DEFAULT 'anthropic/claude-sonnet-4',
  embedding_model                 TEXT NOT NULL DEFAULT 'openai/text-embedding-3-small',
  embedding_dim                   INT  NOT NULL DEFAULT 1536,
  system_prompt                   TEXT NOT NULL,
  mcp_enabled                     BOOLEAN NOT NULL DEFAULT FALSE,
  handoff_policy                  JSONB NOT NULL,
  admin_online                    BOOLEAN NOT NULL DEFAULT FALSE,
  onboarding_step                 INT  NOT NULL DEFAULT 1,
  onboarding_completed            BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
  id                UUID PRIMARY KEY,
  visitor_id        UUID NOT NULL,
  state             JSONB NOT NULL,
  visitor_meta      JSONB NOT NULL DEFAULT '{}',
  total_cost_cents  INT  NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at         TIMESTAMPTZ
);
CREATE INDEX sessions_visitor_idx ON sessions(visitor_id);
CREATE INDEX sessions_active_idx ON sessions(last_activity_at DESC) WHERE closed_at IS NULL;

CREATE TABLE messages (
  id           UUID PRIMARY KEY,
  session_id   UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('visitor','assistant','operator','system_event')),
  content      TEXT NOT NULL,
  tool_calls   JSONB,
  rag_hits     JSONB,
  cost_cents   INT  NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX messages_session_idx ON messages(session_id, created_at);

CREATE TABLE conversation_events (
  id          UUID PRIMARY KEY,
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event       JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
