-- ===========================================
-- Spring Memory HNSW Optimization
-- Migration: 20260205_spring_memory_hnsw_optimization.sql
--
-- Implements pgvector tuning playbook:
-- - HNSW index replacement for IVFFlat
-- - Iterative scan support for filtered queries
-- - 2-stage query pattern (oversample + filter)
-- - Dynamic ef_search tuning
-- ===========================================

-- ===========================================
-- 1. Check pgvector version and capabilities
-- ===========================================

-- Helper to check if iterative scan is supported (pgvector >= 0.8.0)
CREATE OR REPLACE FUNCTION check_pgvector_version()
RETURNS TABLE (
  version TEXT,
  supports_iterative_scan BOOLEAN,
  supports_hnsw BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_version TEXT;
  v_major INT;
  v_minor INT;
BEGIN
  -- Get pgvector version from extension
  SELECT extversion INTO v_version
  FROM pg_extension
  WHERE extname = 'vector';

  IF v_version IS NULL THEN
    RETURN QUERY SELECT 'not installed'::TEXT, FALSE, FALSE;
    RETURN;
  END IF;

  -- Parse version (e.g., '0.8.0' -> major=0, minor=8)
  v_major := split_part(v_version, '.', 1)::INT;
  v_minor := split_part(v_version, '.', 2)::INT;

  RETURN QUERY SELECT
    v_version,
    (v_major > 0 OR (v_major = 0 AND v_minor >= 8)),  -- iterative scan: 0.8.0+
    (v_major > 0 OR (v_major = 0 AND v_minor >= 5));  -- hnsw: 0.5.0+
END;
$$;

-- ===========================================
-- 2. Replace IVFFlat with HNSW for spring_memory_notes
-- ===========================================

-- Drop existing IVFFlat index
DROP INDEX IF EXISTS idx_spring_notes_embedding;

-- Create HNSW index with optimized parameters
-- m = 24: connections per node (higher than default 16 for better recall)
-- ef_construction = 100: build-time quality (higher = better graph, slower build)
-- Partial index: only active notes with embeddings
CREATE INDEX idx_spring_notes_embedding_hnsw
  ON spring_memory_notes
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 24, ef_construction = 100)
  WHERE status = 'active' AND embedding IS NOT NULL;

-- Also create index for entities if not already HNSW
DROP INDEX IF EXISTS idx_spring_entities_embedding;

CREATE INDEX idx_spring_entities_embedding_hnsw
  ON spring_entities
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

-- ===========================================
-- 3. Composite indexes for filtered vector search
-- ===========================================

-- For user + scope filtered searches (common pattern)
CREATE INDEX IF NOT EXISTS idx_spring_notes_user_scope_status
  ON spring_memory_notes(user_id, scope, status)
  WHERE status = 'active';

-- For user + note_type filtered searches
CREATE INDEX IF NOT EXISTS idx_spring_notes_user_type_status
  ON spring_memory_notes(user_id, note_type, status)
  WHERE status = 'active';

-- For workspace-scoped searches
CREATE INDEX IF NOT EXISTS idx_spring_notes_workspace_status
  ON spring_memory_notes(workspace_id, status)
  WHERE workspace_id IS NOT NULL AND status = 'active';

-- ===========================================
-- 4. Optimized search function with HNSW + iterative scan
-- ===========================================

-- Drop old function to replace
DROP FUNCTION IF EXISTS search_spring_memory_notes(
  VECTOR(1536), TEXT, TEXT, TEXT, INTEGER, FLOAT
);

-- Create optimized search function with 2-stage pattern
CREATE OR REPLACE FUNCTION search_spring_memory_notes_v4(
  p_query_embedding VECTOR(1536),
  p_user_id TEXT,
  p_scope TEXT DEFAULT NULL,
  p_note_type TEXT DEFAULT NULL,
  p_match_count INTEGER DEFAULT 10,
  p_match_threshold FLOAT DEFAULT 0.7,
  p_ef_search INTEGER DEFAULT 100,           -- Tunable HNSW parameter
  p_oversample_factor INTEGER DEFAULT 3,     -- For 2-stage pattern
  p_use_iterative_scan BOOLEAN DEFAULT TRUE  -- Enable iterative scan
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  note_type TEXT,
  scope TEXT,
  payload_json JSONB,
  confidence FLOAT,
  importance INTEGER,
  similarity FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_filters BOOLEAN;
  v_oversample_limit INTEGER;
BEGIN
  -- Set HNSW search parameter
  PERFORM set_config('hnsw.ef_search', p_ef_search::TEXT, true);

  -- Check if we have post-ANN filters
  v_has_filters := (p_scope IS NOT NULL OR p_note_type IS NOT NULL);

  -- Calculate oversample limit for 2-stage pattern
  v_oversample_limit := CASE
    WHEN v_has_filters THEN p_match_count * p_oversample_factor
    ELSE p_match_count
  END;

  -- Enable iterative scan for filtered queries if supported
  IF p_use_iterative_scan AND v_has_filters THEN
    BEGIN
      PERFORM set_config('hnsw.iterative_scan', 'relaxed_order', true);
    EXCEPTION WHEN OTHERS THEN
      -- Iterative scan not supported, continue without it
      NULL;
    END;
  END IF;

  RETURN QUERY
  WITH oversample AS (
    -- Stage 1: Oversample with loose filters
    SELECT
      n.id,
      n.content,
      n.note_type,
      n.scope,
      n.payload_json,
      n.confidence,
      n.importance,
      1 - (n.embedding <=> p_query_embedding) AS similarity,
      n.created_at
    FROM spring_memory_notes n
    WHERE n.user_id = p_user_id
      AND n.status = 'active'
      AND n.embedding IS NOT NULL
      AND 1 - (n.embedding <=> p_query_embedding) > p_match_threshold
    ORDER BY n.embedding <=> p_query_embedding
    LIMIT v_oversample_limit
  )
  -- Stage 2: Apply strict filters and limit
  SELECT
    o.id,
    o.content,
    o.note_type,
    o.scope,
    o.payload_json,
    o.confidence,
    o.importance,
    o.similarity,
    o.created_at
  FROM oversample o
  WHERE (p_scope IS NULL OR o.scope = p_scope)
    AND (p_note_type IS NULL OR o.note_type = p_note_type)
  ORDER BY o.similarity DESC
  LIMIT p_match_count;
END;
$$;

-- ===========================================
-- 5. Hybrid search with HNSW optimization
-- ===========================================

CREATE OR REPLACE FUNCTION hybrid_search_spring_memory_notes(
  p_query_text TEXT,
  p_query_embedding VECTOR(1536),
  p_user_id TEXT,
  p_scope TEXT DEFAULT NULL,
  p_note_type TEXT DEFAULT NULL,
  p_match_count INTEGER DEFAULT 10,
  p_match_threshold FLOAT DEFAULT 0.5,
  p_keyword_weight FLOAT DEFAULT 0.3,
  p_vector_weight FLOAT DEFAULT 0.7,
  p_ef_search INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  note_type TEXT,
  scope TEXT,
  payload_json JSONB,
  confidence FLOAT,
  importance INTEGER,
  semantic_score FLOAT,
  keyword_score FLOAT,
  combined_score FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k CONSTANT INT := 60;  -- RRF constant
  v_oversample INT := p_match_count * 3;
BEGIN
  -- Set HNSW search parameter
  PERFORM set_config('hnsw.ef_search', p_ef_search::TEXT, true);

  RETURN QUERY
  WITH
  -- Vector search results (oversampled)
  vector_results AS (
    SELECT
      n.id,
      n.content,
      n.note_type,
      n.scope,
      n.payload_json,
      n.confidence,
      n.importance,
      n.created_at,
      1 - (n.embedding <=> p_query_embedding) AS vec_similarity,
      ROW_NUMBER() OVER (ORDER BY n.embedding <=> p_query_embedding) AS vec_rank
    FROM spring_memory_notes n
    WHERE n.user_id = p_user_id
      AND n.status = 'active'
      AND n.embedding IS NOT NULL
      AND 1 - (n.embedding <=> p_query_embedding) > p_match_threshold
      AND (p_scope IS NULL OR n.scope = p_scope)
      AND (p_note_type IS NULL OR n.note_type = p_note_type)
    ORDER BY n.embedding <=> p_query_embedding
    LIMIT v_oversample
  ),
  -- Keyword search using full-text search on content
  keyword_results AS (
    SELECT
      n.id,
      n.content,
      n.note_type,
      n.scope,
      n.payload_json,
      n.confidence,
      n.importance,
      n.created_at,
      ts_rank_cd(to_tsvector('english', n.content), plainto_tsquery('english', p_query_text)) AS kw_rank,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(to_tsvector('english', n.content), plainto_tsquery('english', p_query_text)) DESC
      ) AS kw_row_rank
    FROM spring_memory_notes n
    WHERE n.user_id = p_user_id
      AND n.status = 'active'
      AND to_tsvector('english', n.content) @@ plainto_tsquery('english', p_query_text)
      AND (p_scope IS NULL OR n.scope = p_scope)
      AND (p_note_type IS NULL OR n.note_type = p_note_type)
    ORDER BY kw_rank DESC
    LIMIT v_oversample
  ),
  -- Combine using Reciprocal Rank Fusion
  combined AS (
    SELECT
      COALESCE(v.id, kw.id) AS id,
      COALESCE(v.content, kw.content) AS content,
      COALESCE(v.note_type, kw.note_type) AS note_type,
      COALESCE(v.scope, kw.scope) AS scope,
      COALESCE(v.payload_json, kw.payload_json) AS payload_json,
      COALESCE(v.confidence, kw.confidence) AS confidence,
      COALESCE(v.importance, kw.importance) AS importance,
      COALESCE(v.created_at, kw.created_at) AS created_at,
      COALESCE(v.vec_similarity, 0) AS semantic_score,
      COALESCE(kw.kw_rank, 0) AS keyword_score,
      (
        p_vector_weight * (1.0 / (k + COALESCE(v.vec_rank, v_oversample))) +
        p_keyword_weight * (1.0 / (k + COALESCE(kw.kw_row_rank, v_oversample)))
      ) AS combined_score
    FROM vector_results v
    FULL OUTER JOIN keyword_results kw ON v.id = kw.id
  )
  SELECT
    c.id,
    c.content,
    c.note_type,
    c.scope,
    c.payload_json,
    c.confidence,
    c.importance,
    c.semantic_score,
    c.keyword_score,
    c.combined_score,
    c.created_at
  FROM combined c
  ORDER BY c.combined_score DESC
  LIMIT p_match_count;
END;
$$;

-- ===========================================
-- 6. ef_search tuning helper
-- ===========================================

-- Recommend ef_search based on result set characteristics
CREATE OR REPLACE FUNCTION recommend_spring_ef_search(
  p_user_id TEXT,
  p_top_k INT DEFAULT 10,
  p_recall_mode TEXT DEFAULT 'balanced',  -- 'fast', 'balanced', 'high_recall'
  p_has_filters BOOLEAN DEFAULT FALSE
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_note_count BIGINT;
  v_base_ef INT;
BEGIN
  -- Get active note count for user
  SELECT COUNT(*)
  INTO v_note_count
  FROM spring_memory_notes
  WHERE user_id = p_user_id
    AND status = 'active'
    AND embedding IS NOT NULL;

  -- Base ef_search: 4x top_k minimum
  v_base_ef := GREATEST(40, p_top_k * 4);

  -- Adjust based on collection size
  IF v_note_count > 100000 THEN
    v_base_ef := v_base_ef * 1.5;
  ELSIF v_note_count > 10000 THEN
    v_base_ef := v_base_ef * 1.25;
  END IF;

  -- Adjust for filters (need more candidates to filter from)
  IF p_has_filters THEN
    v_base_ef := v_base_ef * 1.5;
  END IF;

  -- Adjust based on recall mode
  CASE p_recall_mode
    WHEN 'fast' THEN
      v_base_ef := GREATEST(32, v_base_ef * 0.6)::INT;
    WHEN 'high_recall' THEN
      v_base_ef := LEAST(400, v_base_ef * 2)::INT;
    ELSE  -- balanced
      v_base_ef := v_base_ef;
  END CASE;

  -- Clamp to valid range
  RETURN GREATEST(16, LEAST(400, v_base_ef));
END;
$$;

-- ===========================================
-- 7. Filtered vector search with iterative scan
-- ===========================================

-- Optimized function for filtered searches using iterative scan
CREATE OR REPLACE FUNCTION search_spring_notes_filtered(
  p_query_embedding VECTOR(1536),
  p_user_id TEXT,
  p_filters JSONB DEFAULT '{}',        -- Flexible filter object
  p_match_count INTEGER DEFAULT 10,
  p_match_threshold FLOAT DEFAULT 0.7,
  p_ef_search INTEGER DEFAULT NULL     -- Auto-calculate if NULL
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  note_type TEXT,
  scope TEXT,
  payload_json JSONB,
  confidence FLOAT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ef_search INT;
  v_scope TEXT;
  v_note_type TEXT;
  v_min_confidence FLOAT;
  v_min_importance INT;
  v_tags TEXT[];
  v_has_filters BOOLEAN;
BEGIN
  -- Extract filters from JSONB
  v_scope := p_filters->>'scope';
  v_note_type := p_filters->>'note_type';
  v_min_confidence := (p_filters->>'min_confidence')::FLOAT;
  v_min_importance := (p_filters->>'min_importance')::INT;
  v_tags := ARRAY(SELECT jsonb_array_elements_text(p_filters->'tags'));

  -- Check if we have any filters
  v_has_filters := (
    v_scope IS NOT NULL OR
    v_note_type IS NOT NULL OR
    v_min_confidence IS NOT NULL OR
    v_min_importance IS NOT NULL OR
    array_length(v_tags, 1) > 0
  );

  -- Auto-calculate ef_search if not provided
  IF p_ef_search IS NULL THEN
    v_ef_search := recommend_spring_ef_search(p_user_id, p_match_count, 'balanced', v_has_filters);
  ELSE
    v_ef_search := p_ef_search;
  END IF;

  -- Set HNSW parameters
  PERFORM set_config('hnsw.ef_search', v_ef_search::TEXT, true);

  -- Enable iterative scan for filtered queries
  IF v_has_filters THEN
    BEGIN
      PERFORM set_config('hnsw.iterative_scan', 'relaxed_order', true);
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- Not supported, continue
    END;
  END IF;

  RETURN QUERY
  SELECT
    n.id,
    n.content,
    n.note_type,
    n.scope,
    n.payload_json,
    n.confidence,
    1 - (n.embedding <=> p_query_embedding) AS similarity
  FROM spring_memory_notes n
  WHERE n.user_id = p_user_id
    AND n.status = 'active'
    AND n.embedding IS NOT NULL
    AND 1 - (n.embedding <=> p_query_embedding) > p_match_threshold
    -- Apply optional filters
    AND (v_scope IS NULL OR n.scope = v_scope)
    AND (v_note_type IS NULL OR n.note_type = v_note_type)
    AND (v_min_confidence IS NULL OR n.confidence >= v_min_confidence)
    AND (v_min_importance IS NULL OR n.importance >= v_min_importance)
    AND (v_tags IS NULL OR array_length(v_tags, 1) IS NULL OR
         EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(n.payload_json->'tags') t
           WHERE t = ANY(v_tags)
         ))
  ORDER BY n.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

-- ===========================================
-- 8. Query stats tracking for tuning
-- ===========================================

-- Table to track vector search performance
CREATE TABLE IF NOT EXISTS spring_vector_search_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,

  -- Query info
  query_type TEXT NOT NULL,  -- 'semantic', 'hybrid', 'filtered'
  ef_search INT,
  top_k INT,

  -- Filters used
  had_scope_filter BOOLEAN DEFAULT FALSE,
  had_type_filter BOOLEAN DEFAULT FALSE,
  filter_count INT DEFAULT 0,

  -- Results
  results_count INT,
  avg_similarity FLOAT,
  min_similarity FLOAT,
  max_similarity FLOAT,

  -- Performance
  execution_time_ms FLOAT,
  used_iterative_scan BOOLEAN DEFAULT FALSE,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for analytics
CREATE INDEX IF NOT EXISTS idx_vector_search_stats_user_time
  ON spring_vector_search_stats(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vector_search_stats_type
  ON spring_vector_search_stats(query_type, created_at DESC);

-- RLS
ALTER TABLE spring_vector_search_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own search stats"
  ON spring_vector_search_stats FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Service role has full access to search stats"
  ON spring_vector_search_stats FOR ALL
  USING (
    (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role'
  );

-- ===========================================
-- 9. Backward compatibility aliases
-- ===========================================

-- Keep old function name working but redirect to v4
CREATE OR REPLACE FUNCTION search_spring_memory_notes(
  p_query_embedding VECTOR(1536),
  p_user_id TEXT,
  p_scope TEXT DEFAULT NULL,
  p_note_type TEXT DEFAULT NULL,
  p_match_count INTEGER DEFAULT 10,
  p_match_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  note_type TEXT,
  scope TEXT,
  payload_json JSONB,
  confidence FLOAT,
  importance INTEGER,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.content,
    r.note_type,
    r.scope,
    r.payload_json,
    r.confidence,
    r.importance,
    r.similarity
  FROM search_spring_memory_notes_v4(
    p_query_embedding,
    p_user_id,
    p_scope,
    p_note_type,
    p_match_count,
    p_match_threshold,
    100,  -- default ef_search
    3,    -- default oversample
    TRUE  -- use iterative scan
  ) r;
END;
$$;

-- ===========================================
-- 10. Index health monitoring extension
-- ===========================================

-- Extend hnsw_index_health view for spring tables
CREATE OR REPLACE VIEW spring_hnsw_index_health AS
SELECT
  i.indexrelname AS index_name,
  t.relname AS table_name,
  t.n_live_tup AS live_tuples,
  t.n_dead_tup AS dead_tuples,
  CASE
    WHEN t.n_dead_tup > t.n_live_tup * 0.1 THEN 'needs_vacuum'
    WHEN i.idx_scan = 0 AND t.n_live_tup > 100 THEN 'unused'
    ELSE 'healthy'
  END AS status,
  pg_size_pretty(pg_relation_size(i.indexrelid::regclass)) AS index_size,
  pg_relation_size(i.indexrelid::regclass) AS index_size_bytes,
  i.idx_scan AS total_scans,
  i.idx_tup_read AS tuples_read,
  i.idx_tup_fetch AS tuples_fetched,
  CASE
    WHEN i.idx_tup_read > 0 THEN
      ROUND((i.idx_tup_fetch::NUMERIC / i.idx_tup_read) * 100, 2)
    ELSE 0
  END AS fetch_efficiency_pct
FROM pg_stat_user_indexes i
JOIN pg_stat_user_tables t ON i.relid = t.relid
WHERE t.relname IN ('spring_memory_notes', 'spring_entities')
  AND (i.indexrelname LIKE '%hnsw%' OR i.indexrelname LIKE '%embedding%');

-- Grant access
GRANT SELECT ON spring_hnsw_index_health TO authenticated;

-- ===========================================
-- 11. Comments
-- ===========================================

COMMENT ON INDEX idx_spring_notes_embedding_hnsw IS
  'HNSW index for spring_memory_notes. m=24, ef_construction=100. Use ef_search 40-200 depending on recall needs.';

COMMENT ON INDEX idx_spring_entities_embedding_hnsw IS
  'HNSW index for spring_entities. m=16, ef_construction=64. Smaller than notes index due to fewer entities.';

COMMENT ON FUNCTION search_spring_memory_notes_v4 IS
  'Optimized vector search with HNSW tuning, iterative scan, and 2-stage query pattern.';

COMMENT ON FUNCTION recommend_spring_ef_search IS
  'Dynamically recommend ef_search based on collection size, filters, and recall mode.';

COMMENT ON FUNCTION search_spring_notes_filtered IS
  'Flexible filtered search with automatic ef_search tuning and iterative scan support.';

COMMENT ON TABLE spring_vector_search_stats IS
  'Track vector search performance for tuning and analytics.';

COMMENT ON VIEW spring_hnsw_index_health IS
  'Monitor HNSW index health for spring memory tables.';
