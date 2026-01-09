-- Vector Index Optimization for Seizn
-- Improves search performance with HNSW index and better query patterns

-- ===========================================
-- 1. Add HNSW Index (faster queries, better recall)
-- ===========================================
-- HNSW is superior to IVFFlat for:
-- - Real-time queries (no training needed)
-- - Better recall at same query speed
-- - Dynamic inserts without degradation

-- Drop the existing IVFFlat index
DROP INDEX IF EXISTS idx_memories_embedding;

-- Create HNSW index with optimized parameters
-- m = 16: connections per node (default, good balance)
-- ef_construction = 64: build-time quality (higher = better quality, slower build)
CREATE INDEX idx_memories_embedding_hnsw ON memories
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE NOT is_deleted;

-- ===========================================
-- 2. Composite indexes for filtered searches
-- ===========================================

-- Namespace-specific searches are common, add composite index
CREATE INDEX IF NOT EXISTS idx_memories_user_namespace ON memories(user_id, namespace)
    WHERE NOT is_deleted;

-- Memory type + user for filtered searches
CREATE INDEX IF NOT EXISTS idx_memories_user_type_importance ON memories(user_id, memory_type, importance DESC)
    WHERE NOT is_deleted;

-- Created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_memories_user_created ON memories(user_id, created_at DESC)
    WHERE NOT is_deleted;

-- ===========================================
-- 3. Optimized search function with HNSW
-- ===========================================

-- Update search function with SET LOCAL for HNSW search quality
CREATE OR REPLACE FUNCTION search_memories(
  query_embedding vector(1024),
  match_user_id UUID,
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.7,
  match_namespace TEXT DEFAULT NULL,
  search_ef INT DEFAULT 40  -- Higher = better recall, slower search
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
  -- Set HNSW search quality parameter
  PERFORM set_config('hnsw.ef_search', search_ef::TEXT, true);

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
  WHERE m.user_id = match_user_id
    AND m.is_deleted = false
    AND (match_namespace IS NULL OR m.namespace = match_namespace)
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 4. Optimized hybrid search with HNSW
-- ===========================================

CREATE OR REPLACE FUNCTION hybrid_search_memories(
  query_text TEXT,
  query_embedding vector(1024),
  match_user_id UUID,
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.5,
  match_namespace TEXT DEFAULT NULL,
  keyword_weight FLOAT DEFAULT 0.3,
  vector_weight FLOAT DEFAULT 0.7,
  search_ef INT DEFAULT 40
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
  -- Set HNSW search quality parameter
  PERFORM set_config('hnsw.ef_search', search_ef::TEXT, true);

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

-- ===========================================
-- 5. Fast count function (avoids full scan)
-- ===========================================

CREATE OR REPLACE FUNCTION get_user_memory_count(target_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  count_result INTEGER;
BEGIN
  SELECT memory_count INTO count_result
  FROM profiles
  WHERE id = target_user_id;

  RETURN COALESCE(count_result, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 6. Batch similarity search for efficiency
-- ===========================================

CREATE OR REPLACE FUNCTION batch_search_memories(
  query_embeddings vector(1024)[],
  match_user_id UUID,
  match_count INT DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.7,
  match_namespace TEXT DEFAULT NULL
)
RETURNS TABLE (
  query_index INT,
  memory_id UUID,
  content TEXT,
  memory_type TEXT,
  similarity FLOAT
) AS $$
BEGIN
  -- Set HNSW search quality
  PERFORM set_config('hnsw.ef_search', '40', true);

  RETURN QUERY
  SELECT
    q.idx AS query_index,
    m.id AS memory_id,
    m.content,
    m.memory_type,
    1 - (m.embedding <=> q.emb) AS similarity
  FROM unnest(query_embeddings) WITH ORDINALITY AS q(emb, idx)
  CROSS JOIN LATERAL (
    SELECT mm.id, mm.content, mm.memory_type, mm.embedding
    FROM memories mm
    WHERE mm.user_id = match_user_id
      AND mm.is_deleted = false
      AND (match_namespace IS NULL OR mm.namespace = match_namespace)
      AND 1 - (mm.embedding <=> q.emb) > match_threshold
    ORDER BY mm.embedding <=> q.emb
    LIMIT match_count
  ) m
  ORDER BY q.idx, similarity DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 7. Index maintenance utilities
-- ===========================================

-- Function to check index health
CREATE OR REPLACE FUNCTION check_vector_index_stats()
RETURNS TABLE (
  index_name TEXT,
  index_size TEXT,
  table_rows BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.indexrelname::TEXT AS index_name,
    pg_size_pretty(pg_relation_size(i.indexrelid))::TEXT AS index_size,
    c.reltuples::BIGINT AS table_rows
  FROM pg_stat_user_indexes i
  JOIN pg_class c ON c.oid = i.relid
  WHERE i.relname = 'memories'
    AND i.indexrelname LIKE '%embedding%';
END;
$$ LANGUAGE plpgsql;

-- Comment explaining HNSW vs IVFFlat
COMMENT ON INDEX idx_memories_embedding_hnsw IS 'HNSW index for vector similarity search. Better than IVFFlat for: real-time queries, dynamic inserts, higher recall. ef_search can be tuned per query (default 40, max 400).';
