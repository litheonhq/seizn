-- Seizn Summer - RAG Stack Schema (Embedding + Vector + Rerank)
-- Migration: 021_summer_schema.sql

-- ===========================================
-- 0. Assumptions
-- ===========================================
-- - extensions uuid-ossp and vector are already enabled in 001_initial_schema.sql
-- - This schema is tenant-scoped by user_id (for MVP)
-- - Service-role API can bypass RLS; we still keep policies for safety/consistency

-- ===========================================
-- 1. Collections
-- ===========================================
CREATE TABLE IF NOT EXISTS summer_collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    description TEXT,

    -- Embedding config (versioned in future)
    embedding_provider TEXT NOT NULL DEFAULT 'voyage',
    embedding_model TEXT NOT NULL DEFAULT 'voyage-3',
    embedding_dimensions INT NOT NULL DEFAULT 1024,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_summer_collections_user
ON summer_collections(user_id, updated_at DESC);

-- ===========================================
-- 2. Documents
-- ===========================================
CREATE TABLE IF NOT EXISTS summer_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    collection_id UUID NOT NULL REFERENCES summer_collections(id) ON DELETE CASCADE,

    external_id TEXT,
    title TEXT,
    source TEXT,

    metadata JSONB DEFAULT '{}'::JSONB,
    content_hash TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_summer_documents_collection
ON summer_documents(collection_id, created_at DESC);

-- External id is optional; enforce uniqueness only when present
CREATE UNIQUE INDEX IF NOT EXISTS idx_summer_documents_collection_external
ON summer_documents(collection_id, external_id)
WHERE external_id IS NOT NULL;

-- ===========================================
-- 3. Chunks (vector store)
-- ===========================================
CREATE TABLE IF NOT EXISTS summer_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    collection_id UUID NOT NULL REFERENCES summer_collections(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES summer_documents(id) ON DELETE CASCADE,

    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::JSONB,
    token_count INT DEFAULT 0,

    embedding vector(1024),

    -- Full text search (simple config is more language-agnostic than 'english')
    content_tsv tsvector
      GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_summer_chunks_document
ON summer_chunks(document_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_summer_chunks_collection
ON summer_chunks(collection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_summer_chunks_content_tsv
ON summer_chunks USING GIN (content_tsv);

-- HNSW index for fast vector search
DROP INDEX IF EXISTS idx_summer_chunks_embedding;
CREATE INDEX IF NOT EXISTS idx_summer_chunks_embedding_hnsw
ON summer_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE embedding IS NOT NULL;

-- ===========================================
-- 4. Search functions
-- ===========================================

-- Vector-only search
CREATE OR REPLACE FUNCTION summer_search_chunks(
  query_embedding vector(1024),
  match_user_id TEXT,
  match_collection_id UUID,
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.5,
  search_ef INT DEFAULT 40
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  PERFORM set_config('hnsw.ef_search', search_ef::TEXT, true);

  RETURN QUERY
  SELECT
    c.id AS chunk_id,
    c.document_id,
    c.content,
    c.metadata,
    1 - (c.embedding <=> query_embedding) AS similarity,
    c.created_at
  FROM summer_chunks c
  WHERE c.user_id = match_user_id
    AND c.collection_id = match_collection_id
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Keyword-only search
CREATE OR REPLACE FUNCTION summer_keyword_search_chunks(
  query_text TEXT,
  match_user_id TEXT,
  match_collection_id UUID,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  content TEXT,
  metadata JSONB,
  rank FLOAT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS chunk_id,
    c.document_id,
    c.content,
    c.metadata,
    ts_rank_cd(c.content_tsv, plainto_tsquery('simple', query_text)) AS rank,
    c.created_at
  FROM summer_chunks c
  WHERE c.user_id = match_user_id
    AND c.collection_id = match_collection_id
    AND c.content_tsv @@ plainto_tsquery('simple', query_text)
  ORDER BY rank DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Hybrid search (RRF fusion)
CREATE OR REPLACE FUNCTION summer_hybrid_search_chunks(
  query_text TEXT,
  query_embedding vector(1024),
  match_user_id TEXT,
  match_collection_id UUID,
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.5,
  keyword_weight FLOAT DEFAULT 0.3,
  vector_weight FLOAT DEFAULT 0.7,
  search_ef INT DEFAULT 40
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT,
  keyword_rank FLOAT,
  combined_score FLOAT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  k CONSTANT INT := 60;
BEGIN
  PERFORM set_config('hnsw.ef_search', search_ef::TEXT, true);

  RETURN QUERY
  WITH
  vector_results AS (
    SELECT
      c.id AS chunk_id,
      c.document_id,
      c.content,
      c.metadata,
      1 - (c.embedding <=> query_embedding) AS vec_similarity,
      ROW_NUMBER() OVER (ORDER BY c.embedding <=> query_embedding) AS vec_rank
    FROM summer_chunks c
    WHERE c.user_id = match_user_id
      AND c.collection_id = match_collection_id
      AND c.embedding IS NOT NULL
      AND 1 - (c.embedding <=> query_embedding) > match_threshold
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  keyword_results AS (
    SELECT
      c.id AS chunk_id,
      c.document_id,
      c.content,
      c.metadata,
      ts_rank_cd(c.content_tsv, plainto_tsquery('simple', query_text)) AS kw_rank,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(c.content_tsv, plainto_tsquery('simple', query_text)) DESC
      ) AS kw_row_rank
    FROM summer_chunks c
    WHERE c.user_id = match_user_id
      AND c.collection_id = match_collection_id
      AND c.content_tsv @@ plainto_tsquery('simple', query_text)
    ORDER BY ts_rank_cd(c.content_tsv, plainto_tsquery('simple', query_text)) DESC
    LIMIT match_count * 2
  ),
  combined AS (
    SELECT
      COALESCE(v.chunk_id, kw.chunk_id) AS chunk_id,
      COALESCE(v.document_id, kw.document_id) AS document_id,
      COALESCE(v.content, kw.content) AS content,
      COALESCE(v.metadata, kw.metadata) AS metadata,
      COALESCE(v.vec_similarity, 0) AS similarity,
      COALESCE(kw.kw_rank, 0) AS keyword_rank,
      (
        vector_weight * (1.0 / (k + COALESCE(v.vec_rank, match_count * 2))) +
        keyword_weight * (1.0 / (k + COALESCE(kw.kw_row_rank, match_count * 2)))
      ) AS combined_score
    FROM vector_results v
    FULL OUTER JOIN keyword_results kw ON v.chunk_id = kw.chunk_id
  )
  SELECT
    c.chunk_id,
    c.document_id,
    c.content,
    c.metadata,
    c.similarity,
    c.keyword_rank,
    c.combined_score,
    sc.created_at
  FROM combined c
  JOIN summer_chunks sc ON sc.id = c.chunk_id
  ORDER BY c.combined_score DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 5. RLS policies (optional but recommended)
-- ===========================================
ALTER TABLE summer_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE summer_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE summer_chunks ENABLE ROW LEVEL SECURITY;

-- Collections
CREATE POLICY "Users can view own summer_collections" ON summer_collections
  FOR SELECT USING (auth.uid()::TEXT = user_id);
CREATE POLICY "Users can insert own summer_collections" ON summer_collections
  FOR INSERT WITH CHECK (auth.uid()::TEXT = user_id);
CREATE POLICY "Users can update own summer_collections" ON summer_collections
  FOR UPDATE USING (auth.uid()::TEXT = user_id);

-- Documents
CREATE POLICY "Users can view own summer_documents" ON summer_documents
  FOR SELECT USING (auth.uid()::TEXT = user_id);
CREATE POLICY "Users can insert own summer_documents" ON summer_documents
  FOR INSERT WITH CHECK (auth.uid()::TEXT = user_id);
CREATE POLICY "Users can update own summer_documents" ON summer_documents
  FOR UPDATE USING (auth.uid()::TEXT = user_id);

-- Chunks
CREATE POLICY "Users can view own summer_chunks" ON summer_chunks
  FOR SELECT USING (auth.uid()::TEXT = user_id);
CREATE POLICY "Users can insert own summer_chunks" ON summer_chunks
  FOR INSERT WITH CHECK (auth.uid()::TEXT = user_id);
CREATE POLICY "Users can update own summer_chunks" ON summer_chunks
  FOR UPDATE USING (auth.uid()::TEXT = user_id);
