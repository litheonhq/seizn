-- Fix Summer DB Issues
-- Migration: 029_fix_summer_db_issues.sql
--
-- Fixes:
-- 1. ON CONFLICT error: Add proper unique constraint for (collection_id, external_id)
-- 2. Type mismatch: Change FLOAT to DOUBLE PRECISION in search functions

-- ===========================================
-- 1. Fix ON CONFLICT issue
-- ===========================================

-- Drop the partial unique index (it doesn't work with ON CONFLICT)
DROP INDEX IF EXISTS idx_summer_documents_collection_external;

-- Add a proper unique constraint (allows NULL external_id, unique when not null)
-- We use a unique index with NULLS NOT DISTINCT to handle this properly
-- But for ON CONFLICT to work, we need a different approach

-- Option A: Make external_id NOT NULL with a default UUID (not ideal)
-- Option B: Use a composite unique constraint with COALESCE
-- Option C: Handle upsert logic in application code

-- We'll use a regular unique index that covers the common case
-- and handle NULL external_id separately in the application
CREATE UNIQUE INDEX IF NOT EXISTS idx_summer_documents_upsert
ON summer_documents(collection_id, external_id)
WHERE external_id IS NOT NULL;

-- Also add a constraint for documents with external_id
-- This allows ON CONFLICT to work when external_id is provided
ALTER TABLE summer_documents
DROP CONSTRAINT IF EXISTS summer_documents_collection_external_unique;

ALTER TABLE summer_documents
ADD CONSTRAINT summer_documents_collection_external_unique
UNIQUE (collection_id, external_id);

-- ===========================================
-- 2. Fix Type mismatch in search functions
-- ===========================================

-- Recreate summer_search_chunks with explicit DOUBLE PRECISION
CREATE OR REPLACE FUNCTION summer_search_chunks(
  query_embedding vector(1024),
  match_user_id TEXT,
  match_collection_id UUID,
  match_count INT DEFAULT 10,
  match_threshold DOUBLE PRECISION DEFAULT 0.5,
  search_ef INT DEFAULT 40
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  content TEXT,
  metadata JSONB,
  similarity DOUBLE PRECISION,
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
    (1 - (c.embedding <=> query_embedding))::DOUBLE PRECISION AS similarity,
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

-- Recreate summer_keyword_search_chunks with explicit DOUBLE PRECISION
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
  rank DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS chunk_id,
    c.document_id,
    c.content,
    c.metadata,
    ts_rank_cd(c.content_tsv, plainto_tsquery('simple', query_text))::DOUBLE PRECISION AS rank,
    c.created_at
  FROM summer_chunks c
  WHERE c.user_id = match_user_id
    AND c.collection_id = match_collection_id
    AND c.content_tsv @@ plainto_tsquery('simple', query_text)
  ORDER BY rank DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate summer_hybrid_search_chunks with explicit DOUBLE PRECISION
CREATE OR REPLACE FUNCTION summer_hybrid_search_chunks(
  query_text TEXT,
  query_embedding vector(1024),
  match_user_id TEXT,
  match_collection_id UUID,
  match_count INT DEFAULT 10,
  match_threshold DOUBLE PRECISION DEFAULT 0.5,
  keyword_weight DOUBLE PRECISION DEFAULT 0.3,
  vector_weight DOUBLE PRECISION DEFAULT 0.7,
  search_ef INT DEFAULT 40
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  content TEXT,
  metadata JSONB,
  similarity DOUBLE PRECISION,
  keyword_rank DOUBLE PRECISION,
  combined_score DOUBLE PRECISION,
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
      (1 - (c.embedding <=> query_embedding))::DOUBLE PRECISION AS vec_similarity,
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
      ts_rank_cd(c.content_tsv, plainto_tsquery('simple', query_text))::DOUBLE PRECISION AS kw_rank,
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
      COALESCE(v.vec_similarity, 0::DOUBLE PRECISION) AS similarity,
      COALESCE(kw.kw_rank, 0::DOUBLE PRECISION) AS keyword_rank,
      (
        vector_weight * (1.0 / (k + COALESCE(v.vec_rank, match_count * 2))) +
        keyword_weight * (1.0 / (k + COALESCE(kw.kw_row_rank, match_count * 2)))
      )::DOUBLE PRECISION AS combined_score
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
-- 3. Add index for better upsert performance
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_summer_documents_external_id
ON summer_documents(external_id)
WHERE external_id IS NOT NULL;
