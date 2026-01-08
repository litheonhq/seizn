-- Hybrid Search (BM25 + Vector) for Seizn
-- Combines keyword-based full-text search with semantic vector search

-- Add tsvector column for full-text search
ALTER TABLE memories
ADD COLUMN IF NOT EXISTS content_tsv tsvector
GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- Create GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_memories_content_tsv
ON memories USING GIN (content_tsv);

-- Hybrid search function combining BM25 and vector similarity
-- Uses Reciprocal Rank Fusion (RRF) to combine scores
CREATE OR REPLACE FUNCTION hybrid_search_memories(
  query_text TEXT,
  query_embedding vector(1024),
  match_user_id UUID,
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.5,
  match_namespace TEXT DEFAULT NULL,
  keyword_weight FLOAT DEFAULT 0.3,  -- Weight for BM25 (0-1)
  vector_weight FLOAT DEFAULT 0.7    -- Weight for vector (0-1)
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  memory_type TEXT,
  tags TEXT[],
  namespace TEXT,
  importance INT,
  similarity FLOAT,
  keyword_rank FLOAT,
  combined_score FLOAT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  k CONSTANT INT := 60;  -- RRF constant
BEGIN
  RETURN QUERY
  WITH
  -- Vector search results
  vector_results AS (
    SELECT
      m.id,
      m.content,
      m.memory_type,
      m.tags,
      m.namespace,
      m.importance,
      1 - (m.embedding <=> query_embedding) AS vec_similarity,
      ROW_NUMBER() OVER (ORDER BY m.embedding <=> query_embedding) AS vec_rank
    FROM memories m
    WHERE m.user_id = match_user_id
      AND m.is_deleted = false
      AND (match_namespace IS NULL OR m.namespace = match_namespace)
      AND 1 - (m.embedding <=> query_embedding) > match_threshold
    ORDER BY m.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  -- Keyword search results (BM25-like using ts_rank)
  keyword_results AS (
    SELECT
      m.id,
      m.content,
      m.memory_type,
      m.tags,
      m.namespace,
      m.importance,
      ts_rank_cd(m.content_tsv, plainto_tsquery('english', query_text)) AS kw_rank,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(m.content_tsv, plainto_tsquery('english', query_text)) DESC
      ) AS kw_row_rank
    FROM memories m
    WHERE m.user_id = match_user_id
      AND m.is_deleted = false
      AND (match_namespace IS NULL OR m.namespace = match_namespace)
      AND m.content_tsv @@ plainto_tsquery('english', query_text)
    ORDER BY ts_rank_cd(m.content_tsv, plainto_tsquery('english', query_text)) DESC
    LIMIT match_count * 2
  ),
  -- Combine results using Reciprocal Rank Fusion
  combined AS (
    SELECT
      COALESCE(v.id, kw.id) AS id,
      COALESCE(v.content, kw.content) AS content,
      COALESCE(v.memory_type, kw.memory_type) AS memory_type,
      COALESCE(v.tags, kw.tags) AS tags,
      COALESCE(v.namespace, kw.namespace) AS namespace,
      COALESCE(v.importance, kw.importance) AS importance,
      COALESCE(v.vec_similarity, 0) AS similarity,
      COALESCE(kw.kw_rank, 0) AS keyword_rank,
      -- RRF score calculation
      (
        vector_weight * (1.0 / (k + COALESCE(v.vec_rank, match_count * 2))) +
        keyword_weight * (1.0 / (k + COALESCE(kw.kw_row_rank, match_count * 2)))
      ) AS combined_score
    FROM vector_results v
    FULL OUTER JOIN keyword_results kw ON v.id = kw.id
  )
  SELECT
    c.id,
    c.content,
    c.memory_type,
    c.tags,
    c.namespace,
    c.importance,
    c.similarity,
    c.keyword_rank,
    c.combined_score,
    m.created_at
  FROM combined c
  JOIN memories m ON c.id = m.id
  ORDER BY c.combined_score DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Simple keyword-only search (for testing)
CREATE OR REPLACE FUNCTION keyword_search_memories(
  query_text TEXT,
  match_user_id UUID,
  match_count INT DEFAULT 10,
  match_namespace TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  memory_type TEXT,
  tags TEXT[],
  namespace TEXT,
  importance INT,
  rank FLOAT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    m.memory_type,
    m.tags,
    m.namespace,
    m.importance,
    ts_rank_cd(m.content_tsv, plainto_tsquery('english', query_text)) AS rank,
    m.created_at
  FROM memories m
  WHERE m.user_id = match_user_id
    AND m.is_deleted = false
    AND (match_namespace IS NULL OR m.namespace = match_namespace)
    AND m.content_tsv @@ plainto_tsquery('english', query_text)
  ORDER BY rank DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
