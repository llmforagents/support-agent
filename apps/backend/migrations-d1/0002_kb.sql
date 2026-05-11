-- apps/backend/migrations-d1/0002_kb.sql
-- D1/SQLite parallel of migrations/0002_kb.sql.
-- Notes:
--   * pgvector's VECTOR(1536) column is deliberately omitted; in the Cloudflare
--     deployment, vectors live in a Vectorize index keyed by chunks.id.
--   * Postgres has an HNSW index on embedding and an expression index
--     `sources_active_ready_idx ON sources(active, (state->>'status'))`. D1
--     supports neither; we keep only a plain index on `active`, and the future
--     D1Sources store filters by status in the application layer (small N).

CREATE TABLE sources (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  source_type  TEXT NOT NULL CHECK (source_type IN ('pdf','md','txt','mysql_query')),
  config       TEXT NOT NULL,          -- JSON
  state        TEXT NOT NULL,          -- JSON discriminated union { status, ... }
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX sources_active_idx ON sources(active);

CREATE TABLE chunks (
  id                 TEXT PRIMARY KEY,
  source_id          TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  chunk_index        INTEGER NOT NULL,
  text               TEXT NOT NULL,
  token_count        INTEGER NOT NULL,
  ingest_generation  INTEGER NOT NULL,
  metadata           TEXT NOT NULL DEFAULT '{}',
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_id, chunk_index, ingest_generation)
);
CREATE INDEX chunks_source_gen_idx ON chunks(source_id, ingest_generation);
