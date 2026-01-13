-- Seizn Fall - Flight Recorder MVP Enhancement
-- Migration: 040_flight_recorder.sql
--
-- Extends fall_retrieval_traces with:
-- - Enhanced trace structure (spans, cost, result_stats)
-- - Replay tracking
-- - Better indexing for filtering and search

-- ===========================================
-- 1) Add new columns to fall_retrieval_traces
-- ===========================================

-- Add replay_of column to track trace replay chains
ALTER TABLE fall_retrieval_traces
ADD COLUMN IF NOT EXISTS replay_of UUID REFERENCES fall_retrieval_traces(id) ON DELETE SET NULL;

-- Add source column to track where the request originated
ALTER TABLE fall_retrieval_traces
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'api';

-- Add client_version column for SDK version tracking
ALTER TABLE fall_retrieval_traces
ADD COLUMN IF NOT EXISTS client_version TEXT;

-- ===========================================
-- 2) Create indexes for common query patterns
-- ===========================================

-- Index for finding replays of a trace
CREATE INDEX IF NOT EXISTS idx_fall_traces_replay_of
ON fall_retrieval_traces(replay_of)
WHERE replay_of IS NOT NULL;

-- Index for filtering by error
CREATE INDEX IF NOT EXISTS idx_fall_traces_error
ON fall_retrieval_traces(user_id, created_at DESC)
WHERE error IS NOT NULL;

-- Index for experiment filtering
CREATE INDEX IF NOT EXISTS idx_fall_traces_experiment
ON fall_retrieval_traces(experiment_id, created_at DESC)
WHERE experiment_id IS NOT NULL;

-- Index for full-text search on query_text
CREATE INDEX IF NOT EXISTS idx_fall_traces_query_text_gin
ON fall_retrieval_traces USING GIN (to_tsvector('english', COALESCE(query_text, '')));

-- ===========================================
-- 3) Create trace statistics view
-- ===========================================

CREATE OR REPLACE VIEW fall_trace_stats AS
SELECT
  user_id,
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*) AS trace_count,
  COUNT(*) FILTER (WHERE error IS NOT NULL) AS error_count,
  AVG((timings_ms->>'total')::NUMERIC) AS avg_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (timings_ms->>'total')::NUMERIC) AS p95_latency_ms,
  SUM((trace->'cost'->>'total')::NUMERIC) AS total_cost_usd
FROM fall_retrieval_traces
WHERE sampled = true
GROUP BY user_id, DATE_TRUNC('day', created_at);

-- ===========================================
-- 4) Create function to get replay chain
-- ===========================================

CREATE OR REPLACE FUNCTION get_trace_replay_chain(
  p_trace_id UUID,
  p_user_id TEXT
)
RETURNS TABLE (
  id UUID,
  request_id UUID,
  created_at TIMESTAMPTZ,
  replay_of UUID,
  timings_ms JSONB,
  results_count INT,
  effective_config JSONB,
  trace JSONB,
  is_root BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_root_id UUID;
BEGIN
  -- Find the root trace (the one without replay_of or the ultimate parent)
  WITH RECURSIVE chain AS (
    -- Start with the given trace
    SELECT t.id, t.replay_of, 0 AS depth
    FROM fall_retrieval_traces t
    WHERE t.id = p_trace_id AND t.user_id = p_user_id

    UNION ALL

    -- Recursively find parents
    SELECT t.id, t.replay_of, c.depth + 1
    FROM fall_retrieval_traces t
    JOIN chain c ON t.id = c.replay_of
    WHERE t.user_id = p_user_id AND c.depth < 10 -- Prevent infinite loops
  )
  SELECT c.id INTO v_root_id
  FROM chain c
  WHERE c.replay_of IS NULL
  LIMIT 1;

  -- If no root found, use the original trace
  IF v_root_id IS NULL THEN
    v_root_id := p_trace_id;
  END IF;

  -- Return all traces in the chain (root + all its replays)
  RETURN QUERY
  SELECT
    t.id,
    t.request_id,
    t.created_at,
    t.replay_of,
    t.timings_ms,
    t.results_count,
    t.effective_config,
    t.trace,
    (t.id = v_root_id) AS is_root
  FROM fall_retrieval_traces t
  WHERE t.user_id = p_user_id
    AND (t.id = v_root_id OR t.replay_of = v_root_id)
  ORDER BY t.created_at ASC;
END;
$$;

-- ===========================================
-- 5) Create function to compare traces
-- ===========================================

CREATE OR REPLACE FUNCTION compare_traces(
  p_trace_id_a UUID,
  p_trace_id_b UUID,
  p_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trace_a RECORD;
  v_trace_b RECORD;
  v_result_ids_a TEXT[];
  v_result_ids_b TEXT[];
  v_overlap TEXT[];
  v_only_a TEXT[];
  v_only_b TEXT[];
BEGIN
  -- Fetch both traces
  SELECT * INTO v_trace_a
  FROM fall_retrieval_traces
  WHERE id = p_trace_id_a AND user_id = p_user_id;

  SELECT * INTO v_trace_b
  FROM fall_retrieval_traces
  WHERE id = p_trace_id_b AND user_id = p_user_id;

  IF v_trace_a IS NULL OR v_trace_b IS NULL THEN
    RETURN NULL;
  END IF;

  -- Extract result IDs from traces
  SELECT ARRAY_AGG(doc_id) INTO v_result_ids_a
  FROM jsonb_array_elements_text(
    COALESCE(v_trace_a.trace->'result_stats'->'documentIds', '[]'::JSONB)
  ) AS doc_id;

  SELECT ARRAY_AGG(doc_id) INTO v_result_ids_b
  FROM jsonb_array_elements_text(
    COALESCE(v_trace_b.trace->'result_stats'->'documentIds', '[]'::JSONB)
  ) AS doc_id;

  -- Calculate overlap
  v_overlap := COALESCE(v_result_ids_a, '{}') & COALESCE(v_result_ids_b, '{}');
  v_only_a := COALESCE(v_result_ids_a, '{}') - COALESCE(v_result_ids_b, '{}');
  v_only_b := COALESCE(v_result_ids_b, '{}') - COALESCE(v_result_ids_a, '{}');

  RETURN jsonb_build_object(
    'trace_a', jsonb_build_object(
      'id', v_trace_a.id,
      'created_at', v_trace_a.created_at,
      'results_count', v_trace_a.results_count,
      'timings_ms', v_trace_a.timings_ms
    ),
    'trace_b', jsonb_build_object(
      'id', v_trace_b.id,
      'created_at', v_trace_b.created_at,
      'results_count', v_trace_b.results_count,
      'timings_ms', v_trace_b.timings_ms
    ),
    'results', jsonb_build_object(
      'overlap_count', COALESCE(array_length(v_overlap, 1), 0),
      'only_in_a_count', COALESCE(array_length(v_only_a, 1), 0),
      'only_in_b_count', COALESCE(array_length(v_only_b, 1), 0)
    ),
    'latency_delta_ms', (
      COALESCE((v_trace_b.timings_ms->>'total')::NUMERIC, 0) -
      COALESCE((v_trace_a.timings_ms->>'total')::NUMERIC, 0)
    ),
    'cost_delta_usd', (
      COALESCE((v_trace_b.trace->'cost'->>'total')::NUMERIC, 0) -
      COALESCE((v_trace_a.trace->'cost'->>'total')::NUMERIC, 0)
    )
  );
END;
$$;

-- ===========================================
-- 6) Add RLS policy for replay_of access
-- ===========================================

-- Allow users to read traces they replay from (even if not their own user_id in edge cases)
-- This is already covered by the existing policy since we check user_id

-- ===========================================
-- 7) Create cleanup function for old traces
-- ===========================================

CREATE OR REPLACE FUNCTION cleanup_old_traces(
  p_retention_days INT DEFAULT 30,
  p_batch_size INT DEFAULT 1000
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INT;
BEGIN
  WITH deleted AS (
    DELETE FROM fall_retrieval_traces
    WHERE created_at < NOW() - (p_retention_days || ' days')::INTERVAL
      AND id IN (
        SELECT id FROM fall_retrieval_traces
        WHERE created_at < NOW() - (p_retention_days || ' days')::INTERVAL
        LIMIT p_batch_size
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$;

-- ===========================================
-- 8) Create trace search function
-- ===========================================

CREATE OR REPLACE FUNCTION search_traces(
  p_user_id TEXT,
  p_query TEXT DEFAULT NULL,
  p_collection_id UUID DEFAULT NULL,
  p_has_error BOOLEAN DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  request_id UUID,
  query_text TEXT,
  collection_id UUID,
  effective_config JSONB,
  timings_ms JSONB,
  results_count INT,
  error TEXT,
  trace JSONB,
  created_at TIMESTAMPTZ,
  replay_of UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.request_id,
    t.query_text,
    t.collection_id,
    t.effective_config,
    t.timings_ms,
    t.results_count,
    t.error,
    t.trace,
    t.created_at,
    t.replay_of
  FROM fall_retrieval_traces t
  WHERE t.user_id = p_user_id
    AND (p_query IS NULL OR t.query_text ILIKE '%' || p_query || '%')
    AND (p_collection_id IS NULL OR t.collection_id = p_collection_id)
    AND (p_has_error IS NULL OR (p_has_error = TRUE AND t.error IS NOT NULL) OR (p_has_error = FALSE AND t.error IS NULL))
    AND (p_start_date IS NULL OR t.created_at >= p_start_date)
    AND (p_end_date IS NULL OR t.created_at <= p_end_date)
  ORDER BY t.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- ===========================================
-- 9) Grant permissions
-- ===========================================

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_trace_replay_chain(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION compare_traces(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION search_traces(TEXT, TEXT, UUID, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) TO authenticated;

-- Grant select on the stats view
GRANT SELECT ON fall_trace_stats TO authenticated;

-- ===========================================
-- 10) Comments for documentation
-- ===========================================

COMMENT ON COLUMN fall_retrieval_traces.replay_of IS 'Reference to the original trace this was replayed from';
COMMENT ON COLUMN fall_retrieval_traces.source IS 'Source of the request: api, sdk, dashboard, playground';
COMMENT ON COLUMN fall_retrieval_traces.client_version IS 'Client SDK version for debugging';

COMMENT ON FUNCTION get_trace_replay_chain(UUID, TEXT) IS 'Get all traces in a replay chain (original + all replays)';
COMMENT ON FUNCTION compare_traces(UUID, UUID, TEXT) IS 'Compare two traces and return diff summary';
COMMENT ON FUNCTION search_traces(TEXT, TEXT, UUID, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) IS 'Search traces with filters';
COMMENT ON FUNCTION cleanup_old_traces(INT, INT) IS 'Delete traces older than retention period';

COMMENT ON VIEW fall_trace_stats IS 'Daily aggregated trace statistics per user';
