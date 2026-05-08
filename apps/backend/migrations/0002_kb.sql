-- apps/backend/migrations/0002_kb.sql

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE sources (
  id           UUID PRIMARY KEY,
  name         TEXT NOT NULL,
  source_type  TEXT NOT NULL CHECK (source_type IN ('pdf','md','txt','mysql_query')),
  config       JSONB NOT NULL,
  state        JSONB NOT NULL,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX sources_active_ready_idx ON sources(active, (state->>'status'));

CREATE TABLE chunks (
  id                 UUID PRIMARY KEY,
  source_id          UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  chunk_index        INT  NOT NULL,
  text               TEXT NOT NULL,
  token_count        INT  NOT NULL,
  embedding          VECTOR(1536) NOT NULL,
  ingest_generation  BIGINT NOT NULL,
  metadata           JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX chunks_source_gen_idx ON chunks(source_id, ingest_generation);
