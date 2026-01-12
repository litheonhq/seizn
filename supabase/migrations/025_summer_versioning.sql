-- Seizn Summer - Ingestion/Chunking Standardization + Versioned Index (MVP)
-- Migration: 025_summer_versioning.sql

-- ===========================================
-- 1) Add versioning columns (safe, optional)
-- ===========================================
ALTER TABLE IF EXISTS summer_documents
  ADD COLUMN IF NOT EXISTS current_version INT NOT NULL DEFAULT 1;

ALTER TABLE IF EXISTS summer_documents
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE IF EXISTS summer_documents
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

ALTER TABLE IF EXISTS summer_chunks
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE IF EXISTS summer_chunks
  ADD COLUMN IF NOT EXISTS chunk_hash TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_summer_chunks_document_version
ON summer_chunks(document_id, version, chunk_index);

-- ===========================================
-- 2) Ingestion jobs (async workers)
-- ===========================================
CREATE TABLE IF NOT EXISTS summer_ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES summer_collections(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'queued', -- queued|running|success|failed
  source_type TEXT NOT NULL DEFAULT 'api', -- api|upload|url|connector
  source_ref TEXT NULL,

  request JSONB NOT NULL DEFAULT '{}'::JSONB,
  result JSONB NOT NULL DEFAULT '{}'::JSONB,

  requested_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  error TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_summer_ingestion_jobs_user_created
ON summer_ingestion_jobs(user_id, requested_at DESC);

-- ===========================================
-- 3) Version history tables (optional)
-- ===========================================
CREATE TABLE IF NOT EXISTS summer_document_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES summer_documents(id) ON DELETE CASCADE,

  version INT NOT NULL,
  content_hash TEXT NOT NULL,

  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_summer_document_versions_unique
ON summer_document_versions(document_id, version);

CREATE TABLE IF NOT EXISTS summer_chunk_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chunk_id UUID NOT NULL REFERENCES summer_chunks(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES summer_documents(id) ON DELETE CASCADE,

  version INT NOT NULL,
  chunk_hash TEXT NOT NULL,

  content TEXT NOT NULL,
  token_count INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_summer_chunk_versions_document_version
ON summer_chunk_versions(document_id, version);

-- ===========================================
-- 4) RLS
-- ===========================================
ALTER TABLE summer_ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE summer_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE summer_chunk_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own summer_ingestion_jobs"
  ON summer_ingestion_jobs FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own summer_ingestion_jobs"
  ON summer_ingestion_jobs FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

-- Version history is typically read-only for users (written by service role).
CREATE POLICY "Users can view summer_document_versions via own documents"
  ON summer_document_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM summer_documents d
      WHERE d.id = summer_document_versions.document_id AND d.user_id = auth.uid()::TEXT
    )
  );

CREATE POLICY "Users can view summer_chunk_versions via own documents"
  ON summer_chunk_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM summer_documents d
      WHERE d.id = summer_chunk_versions.document_id AND d.user_id = auth.uid()::TEXT
    )
  );
