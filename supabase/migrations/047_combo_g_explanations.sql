-- Seizn Combo G - Retrieval Explanations (Explainable RAG)
-- Migration: 047_combo_g_explanations.sql
--
-- Tables:
-- - retrieval_explanations: Human-readable explanations for retrieval results

-- ===========================================
-- 1) Retrieval Explanations
-- ===========================================
CREATE TABLE IF NOT EXISTS retrieval_explanations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Related entities
  trace_id UUID REFERENCES fall_retrieval_traces(id) ON DELETE SET NULL,
  request_id UUID,
  collection_id UUID REFERENCES summer_collections(id) ON DELETE SET NULL,

  -- Query info
  query_text TEXT,
  query_hash TEXT,

  -- Explanation content
  explanation_type TEXT NOT NULL DEFAULT 'full', -- full, summary, debug

  -- Main explanation
  summary TEXT NOT NULL, -- Brief human-readable summary
  detailed_explanation TEXT, -- Full explanation

  -- Structured explanation data
  steps JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- Example:
  -- [
  --   {"step": "embedding", "description": "Query converted to 1024-dim vector", "duration_ms": 45},
  --   {"step": "vector_search", "description": "Found 50 candidates from HNSW index", "duration_ms": 12},
  --   {"step": "rerank", "description": "Reranked to top 10 using cross-encoder", "duration_ms": 89},
  --   {"step": "filter", "description": "Applied metadata filter: date > 2024-01-01", "duration_ms": 2}
  -- ]

  -- Ranking explanation
  ranking_factors JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Example:
  -- {
  --   "semantic_similarity": 0.6,
  --   "keyword_match": 0.2,
  --   "recency_boost": 0.1,
  --   "metadata_match": 0.1
  -- }

  -- Result explanations
  result_explanations JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- Example:
  -- [
  --   {
  --     "chunk_id": "...",
  --     "rank": 1,
  --     "score": 0.89,
  --     "reason": "Strong semantic match + contains key phrase 'API rate limits'",
  --     "matched_terms": ["API", "rate", "limits"],
  --     "relevance_signals": {"semantic": 0.92, "keyword": 0.85, "recency": 0.7}
  --   }
  -- ]

  -- Alternative explanations (what else could have matched)
  alternatives JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- Example:
  -- [
  --   {"chunk_id": "...", "reason": "Excluded: Low recency score (document from 2019)"},
  --   {"chunk_id": "...", "reason": "Excluded: Filtered by metadata (department != engineering)"}
  -- ]

  -- Confidence and quality
  explanation_confidence FLOAT, -- How confident are we in this explanation
  quality_indicators JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- User interaction
  user_rating INT, -- 1-5 star rating
  user_feedback TEXT,
  feedback_submitted_at TIMESTAMPTZ,

  -- Generation info
  model_used TEXT, -- Model used for explanation generation
  generation_latency_ms INT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retrieval_explanations_user
  ON retrieval_explanations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_retrieval_explanations_trace
  ON retrieval_explanations(trace_id)
  WHERE trace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_retrieval_explanations_request
  ON retrieval_explanations(request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_retrieval_explanations_collection
  ON retrieval_explanations(collection_id, created_at DESC)
  WHERE collection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_retrieval_explanations_rated
  ON retrieval_explanations(user_id, user_rating)
  WHERE user_rating IS NOT NULL;

-- ===========================================
-- 2) RLS Policies
-- ===========================================
ALTER TABLE retrieval_explanations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own retrieval_explanations"
  ON retrieval_explanations FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own retrieval_explanations"
  ON retrieval_explanations FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own retrieval_explanations"
  ON retrieval_explanations FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can delete own retrieval_explanations"
  ON retrieval_explanations FOR DELETE
  USING (auth.uid()::TEXT = user_id);

-- ===========================================
-- 3) Helper Functions
-- ===========================================

-- Get explanation for a trace
CREATE OR REPLACE FUNCTION get_explanation_for_trace(
  p_trace_id UUID,
  p_user_id TEXT
)
RETURNS TABLE (
  id UUID,
  summary TEXT,
  steps JSONB,
  ranking_factors JSONB,
  result_explanations JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.summary,
    e.steps,
    e.ranking_factors,
    e.result_explanations,
    e.created_at
  FROM retrieval_explanations e
  WHERE e.trace_id = p_trace_id
    AND e.user_id = p_user_id
  ORDER BY e.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Submit user feedback for an explanation
CREATE OR REPLACE FUNCTION submit_explanation_feedback(
  p_explanation_id UUID,
  p_user_id TEXT,
  p_rating INT,
  p_feedback TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_updated BOOLEAN;
BEGIN
  -- Validate rating
  IF p_rating < 1 OR p_rating > 5 THEN
    RETURN FALSE;
  END IF;

  UPDATE retrieval_explanations
  SET
    user_rating = p_rating,
    user_feedback = p_feedback,
    feedback_submitted_at = NOW()
  WHERE id = p_explanation_id
    AND user_id = p_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get explanation quality stats
CREATE OR REPLACE FUNCTION get_explanation_quality_stats(
  p_user_id TEXT,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  total_explanations BIGINT,
  rated_explanations BIGINT,
  avg_rating FLOAT,
  rating_distribution JSONB,
  avg_confidence FLOAT,
  avg_latency_ms FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_explanations,
    COUNT(user_rating)::BIGINT AS rated_explanations,
    AVG(user_rating)::FLOAT AS avg_rating,
    jsonb_build_object(
      '1', COUNT(*) FILTER (WHERE user_rating = 1),
      '2', COUNT(*) FILTER (WHERE user_rating = 2),
      '3', COUNT(*) FILTER (WHERE user_rating = 3),
      '4', COUNT(*) FILTER (WHERE user_rating = 4),
      '5', COUNT(*) FILTER (WHERE user_rating = 5)
    ) AS rating_distribution,
    AVG(explanation_confidence)::FLOAT AS avg_confidence,
    AVG(generation_latency_ms)::FLOAT AS avg_latency_ms
  FROM retrieval_explanations
  WHERE user_id = p_user_id
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 4) Views
-- ===========================================

CREATE OR REPLACE VIEW explanation_feedback_summary AS
SELECT
  user_id,
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*) AS total,
  COUNT(user_rating) AS rated,
  AVG(user_rating) AS avg_rating,
  AVG(explanation_confidence) AS avg_confidence
FROM retrieval_explanations
GROUP BY user_id, DATE_TRUNC('day', created_at);

GRANT SELECT ON explanation_feedback_summary TO authenticated;

-- ===========================================
-- 5) Comments
-- ===========================================
COMMENT ON TABLE retrieval_explanations IS 'Human-readable explanations for retrieval results (Explainable RAG)';
COMMENT ON COLUMN retrieval_explanations.summary IS 'Brief human-readable summary of the retrieval process';
COMMENT ON COLUMN retrieval_explanations.steps IS 'Step-by-step breakdown of the retrieval pipeline';
COMMENT ON COLUMN retrieval_explanations.ranking_factors IS 'Weights and factors used in ranking';
COMMENT ON COLUMN retrieval_explanations.result_explanations IS 'Per-result explanations with relevance signals';
COMMENT ON COLUMN retrieval_explanations.alternatives IS 'Explanations for excluded results';
COMMENT ON FUNCTION get_explanation_for_trace IS 'Get the latest explanation for a specific trace';
COMMENT ON FUNCTION submit_explanation_feedback IS 'Submit user feedback for an explanation';
COMMENT ON FUNCTION get_explanation_quality_stats IS 'Get aggregated quality stats for explanations';
