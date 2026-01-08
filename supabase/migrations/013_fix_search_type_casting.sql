-- Fix type casting issue in search functions
-- The REST API passes UUID as text, so we need to accept TEXT and cast

-- Drop ALL versions of keyword_search_memories
DROP FUNCTION IF EXISTS keyword_search_memories(TEXT, UUID, INT, TEXT);
DROP FUNCTION IF EXISTS keyword_search_memories(TEXT, TEXT, INT, TEXT);

CREATE OR REPLACE FUNCTION keyword_search_memories(
  query_text TEXT,
  match_user_id TEXT,  -- Changed from UUID to TEXT
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
  WHERE m.user_id = match_user_id::UUID  -- Explicit cast
    AND m.is_deleted = false
    AND (match_namespace IS NULL OR m.namespace = match_namespace)
    AND m.content_tsv @@ plainto_tsquery('english', query_text)
  ORDER BY rank DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop ALL versions of hybrid_search_memories
DROP FUNCTION IF EXISTS hybrid_search_memories(TEXT, vector(1024), UUID, INT, FLOAT, TEXT, FLOAT, FLOAT);
DROP FUNCTION IF EXISTS hybrid_search_memories(TEXT, vector(1024), TEXT, INT, FLOAT, TEXT, FLOAT, FLOAT);

CREATE OR REPLACE FUNCTION hybrid_search_memories(
  query_text TEXT,
  query_embedding vector(1024),
  match_user_id TEXT,  -- Changed from UUID to TEXT
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.5,
  match_namespace TEXT DEFAULT NULL,
  keyword_weight FLOAT DEFAULT 0.3,
  vector_weight FLOAT DEFAULT 0.7
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
  k CONSTANT INT := 60;
BEGIN
  RETURN QUERY
  WITH
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
    WHERE m.user_id = match_user_id::UUID  -- Explicit cast
      AND m.is_deleted = false
      AND (match_namespace IS NULL OR m.namespace = match_namespace)
      AND 1 - (m.embedding <=> query_embedding) > match_threshold
    ORDER BY m.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
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
    WHERE m.user_id = match_user_id::UUID  -- Explicit cast
      AND m.is_deleted = false
      AND (match_namespace IS NULL OR m.namespace = match_namespace)
      AND m.content_tsv @@ plainto_tsquery('english', query_text)
    ORDER BY ts_rank_cd(m.content_tsv, plainto_tsquery('english', query_text)) DESC
    LIMIT match_count * 2
  ),
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

-- Drop ALL versions of search_memories (vector-only search)
DROP FUNCTION IF EXISTS search_memories(vector(1024), UUID, INT, FLOAT, TEXT);
DROP FUNCTION IF EXISTS search_memories(vector(1024), TEXT, INT, FLOAT, TEXT);

CREATE OR REPLACE FUNCTION search_memories(
  query_embedding vector(1024),
  match_user_id TEXT,  -- Changed from UUID to TEXT
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.7,
  match_namespace TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  memory_type TEXT,
  tags TEXT[],
  namespace TEXT,
  importance INT,
  similarity FLOAT,
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
    1 - (m.embedding <=> query_embedding) AS similarity,
    m.created_at
  FROM memories m
  WHERE m.user_id = match_user_id::UUID  -- Explicit cast
    AND m.is_deleted = false
    AND (match_namespace IS NULL OR m.namespace = match_namespace)
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
