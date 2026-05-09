-- apps/backend/migrations/0003_handoff_mysql.sql

CREATE TABLE mysql_connections (
  id                  UUID PRIMARY KEY,
  name                TEXT NOT NULL,
  host_encrypted      TEXT NOT NULL,
  port                INT  NOT NULL,
  database_encrypted  TEXT NOT NULL,
  user_encrypted      TEXT NOT NULL,
  password_encrypted  TEXT NOT NULL,
  ssl                 BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conversation_events_session_idx ON conversation_events(session_id, created_at);
