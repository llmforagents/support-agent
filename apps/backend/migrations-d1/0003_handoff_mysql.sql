-- apps/backend/migrations-d1/0003_handoff_mysql.sql
-- mysql_connections is created for schema parity; the cloudflare driver
-- rejects mysql_query sources at the route layer (see future driverGuard).
-- NAMING DRIFT vs migrations/0003_handoff_mysql.sql (Postgres): the Pg version
-- uses host_encrypted / database_encrypted / user_encrypted plus an `ssl`
-- boolean and an `updated_at` timestamp. The D1 plan only encrypts the
-- password (the rest stay plaintext) and drops ssl/updated_at because the
-- Cloudflare driver never actually opens MySQL connections.
CREATE TABLE mysql_connections (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  host                TEXT NOT NULL,
  port                INTEGER NOT NULL DEFAULT 3306,
  database_name       TEXT NOT NULL,
  user                TEXT NOT NULL,
  password_encrypted  TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- D1/SQLite has no JSON expression indexes, so denormalise status into its
-- own column. The future D1SessionStore mirrors state.status into status_kind
-- on every write, keeping the inbox query (status_kind = 'handoff_requested')
-- indexed.
ALTER TABLE sessions ADD COLUMN status_kind TEXT NOT NULL DEFAULT 'active_ai';
CREATE INDEX sessions_status_kind_idx ON sessions(status_kind, last_activity_at);
