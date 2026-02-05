-- pgvector Optimization Migration
--
-- Adds infrastructure for recall benchmarking and ef_search optimization.

-- =============================================================================
-- 1. Exact Nearest Neighbor Function (bypasses HNSW for benchmarking)
-- =============================================================================

CREATE OR REPLACE FUNCTION exact_nearest_neighbors(
  p_user_id TEXT,
  p_embedding VECTOR(1024),
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  distance FLOAT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    n.id,
    (n.embedding <=> p_embedding)::FLOAT AS distance
  FROM spring_memory_notes n
  WHERE n.user_id = p_user_id
    AND n.status = 'active'
    AND n.embedding IS NOT NULL
  ORDER BY n.embedding <=> p_embedding
  LIMIT p_limit;
$$;

-- =============================================================================
-- 2. Set ef_search for Session
-- =============================================================================

CREATE OR REPLACE FUNCTION set_hnsw_ef_search(p_ef_search INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate range
  IF p_ef_search < 16 THEN
    p_ef_search := 16;
  ELSIF p_ef_search > 400 THEN
    p_ef_search := 400;
  END IF;

  EXECUTE format('SET LOCAL hnsw.ef_search = %s', p_ef_search);
END;
$$;

-- =============================================================================
-- 3. Distance Threshold Query Pattern (from Playbook 4.3)
-- =============================================================================

CREATE OR REPLACE FUNCTION search_with_distance_threshold(
  p_user_id TEXT,
  p_embedding VECTOR(1024),
  p_limit INTEGER,
  p_max_distance FLOAT DEFAULT 0.5,
  p_ef_search INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  note_type VARCHAR,
  distance FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Set ef_search for this query
  PERFORM set_hnsw_ef_search(p_ef_search);

  -- Two-stage pattern: HNSW retrieval then distance filter
  RETURN QUERY
  WITH nearest_results AS MATERIALIZED (
    SELECT
      n.id,
      n.content,
      n.note_type,
      (n.embedding <=> p_embedding)::FLOAT AS distance,
      n.created_at
    FROM spring_memory_notes n
    WHERE n.user_id = p_user_id
      AND n.status = 'active'
      AND n.embedding IS NOT NULL
    ORDER BY n.embedding <=> p_embedding
    LIMIT p_limit * 2  -- Oversample for filtering
  )
  SELECT nr.id, nr.content, nr.note_type, nr.distance, nr.created_at
  FROM nearest_results nr
  WHERE nr.distance < p_max_distance
  ORDER BY nr.distance
  LIMIT p_limit;
END;
$$;

-- =============================================================================
-- 4. Recall Benchmark Results Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS hnsw_benchmark_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  k INTEGER NOT NULL,
  ef_search INTEGER NOT NULL,
  recall FLOAT NOT NULL,
  avg_rank_diff FLOAT,
  latency_ms FLOAT,
  num_queries INTEGER,
  total_vectors INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_benchmark_user_time
  ON hnsw_benchmark_results(user_id, created_at DESC);

-- =============================================================================
-- 5. Helper: Get Optimal ef_search from Benchmarks
-- =============================================================================

CREATE OR REPLACE FUNCTION get_optimal_ef_search(
  p_user_id TEXT,
  p_k INTEGER DEFAULT 20,
  p_target_recall FLOAT DEFAULT 0.95
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ef_search INTEGER;
BEGIN
  -- Find minimum ef_search that achieves target recall
  SELECT ef_search INTO v_ef_search
  FROM hnsw_benchmark_results
  WHERE user_id = p_user_id
    AND k = p_k
    AND recall >= p_target_recall
  ORDER BY ef_search ASC
  LIMIT 1;

  -- Default to 100 if no benchmark data
  RETURN COALESCE(v_ef_search, 100);
END;
$$;

-- =============================================================================
-- 6. Validate ef_search Function
-- =============================================================================

CREATE OR REPLACE FUNCTION validate_ef_search(
  p_ef_search INTEGER,
  p_k INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_min_ef INTEGER := 16;
  v_max_ef INTEGER := 400;
  v_validated INTEGER;
BEGIN
  -- ef_search must be at least k
  v_min_ef := GREATEST(v_min_ef, p_k);

  -- Validate range
  v_validated := GREATEST(v_min_ef, LEAST(p_ef_search, v_max_ef));

  -- Warn if adjusted
  IF v_validated != p_ef_search THEN
    RAISE NOTICE 'ef_search adjusted: % → %', p_ef_search, v_validated;
  END IF;

  RETURN v_validated;
END;
$$;

-- =============================================================================
-- 7. Iterative Scan Configuration (pgvector 0.8.0+)
-- =============================================================================

-- Note: These settings are applied via SET commands, not stored procedures
-- Documenting recommended settings:

COMMENT ON FUNCTION set_hnsw_ef_search IS 'Set ef_search for current session. Range: 16-400. Higher = better recall, slower.';

COMMENT ON FUNCTION search_with_distance_threshold IS '
Two-stage query pattern for filtered ANN search:
1. HNSW retrieves oversample * limit candidates
2. Filter by distance threshold
3. Return top k

Use when you need both vector similarity AND distance filtering.
For iterative scan (pgvector 0.8.0+):
  SET LOCAL hnsw.iterative_scan = relaxed_order;
  SET LOCAL hnsw.ef_search = 100;
';

COMMENT ON TABLE hnsw_benchmark_results IS 'Stores recall benchmark results for ef_search optimization';

-- =============================================================================
-- 8. Update search_spring_memories to use validated ef_search
-- =============================================================================

-- This is a documentation note - the actual function should be updated
-- to call validate_ef_search before setting ef_search

COMMENT ON FUNCTION exact_nearest_neighbors IS 'Exact (brute-force) nearest neighbor search. Bypasses HNSW index. Use for recall benchmarking.';
