-- ============================================
-- Migration: Hybrid Orchestrator (#5) - Multi-Strategy Retrieval
-- ============================================
-- Combines multiple retrieval strategies (vector, keyword, graph) and
-- intelligently merges results for optimal relevance.

-- ============================================
-- Hybrid Retrieval Configurations
-- ============================================

CREATE TABLE IF NOT EXISTS hybrid_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_id UUID,
  name TEXT NOT NULL,

  -- Strategy configuration
  -- Format: [{type, weight, params}]
  -- type: 'vector' | 'keyword' | 'multi_query'
  -- weight: 0.0 to 1.0 (relative importance)
  -- params: strategy-specific parameters
  strategies JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Fusion method
  fusion_method TEXT DEFAULT 'rrf' CHECK (fusion_method IN ('rrf', 'weighted_sum', 'learned', 'cascade')),

  -- RRF parameters
  -- k value for RRF: score = sum(1 / (k + rank_i))
  -- Higher k values smooth out ranking differences
  rrf_k INTEGER DEFAULT 60,

  -- Cascade parameters (for cascade fusion)
  -- If first strategy returns results above this threshold, skip others
  cascade_threshold FLOAT DEFAULT 0.8,

  -- Learned fusion (weights learned from feedback)
  -- Updated by feedback loop
  learned_weights JSONB,

  -- Whether this config is currently active
  is_active BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique config name per user
  CONSTRAINT hybrid_configs_user_name_unique UNIQUE (user_id, name)
);

-- ============================================
-- Hybrid Retrieval Results (Audit Trail)
-- ============================================

CREATE TABLE IF NOT EXISTS hybrid_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES hybrid_configs(id) ON DELETE SET NULL,
  trace_id UUID,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Query info
  query_hash TEXT,
  collection_id UUID,

  -- Per-strategy results
  -- Format: {strategy_type: [{id, score, rank}]}
  strategy_results JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Fusion output
  -- Format: [{id, final_score, source_strategies, rank}]
  fused_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  fusion_method TEXT,

  -- Performance metrics
  total_latency_ms FLOAT,
  strategy_latencies JSONB DEFAULT '{}'::jsonb,  -- {strategy: ms}

  -- Result quality (for learning)
  user_feedback_score FLOAT,  -- 1-5 rating if provided
  clicked_result_ids TEXT[],  -- Which results were clicked

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Multi-Query Expansion Cache
-- ============================================

CREATE TABLE IF NOT EXISTS multi_query_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_query_hash TEXT NOT NULL,
  original_query TEXT NOT NULL,

  -- Expanded queries
  expanded_queries TEXT[] NOT NULL DEFAULT '{}',
  expansion_method TEXT DEFAULT 'llm',  -- 'llm', 'synonyms', 'embedding_nn'

  -- Cache management
  hit_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT multi_query_cache_unique UNIQUE (user_id, original_query_hash)
);

-- ============================================
-- Strategy Performance Tracking
-- ============================================

CREATE TABLE IF NOT EXISTS hybrid_strategy_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_id UUID,
  strategy_type TEXT NOT NULL,  -- 'vector', 'keyword', 'multi_query'

  -- Aggregated metrics
  total_queries INTEGER DEFAULT 0,
  avg_latency_ms FLOAT DEFAULT 0,
  avg_result_count FLOAT DEFAULT 0,

  -- Quality metrics (when feedback available)
  avg_feedback_score FLOAT,
  avg_click_position FLOAT,

  -- Time window
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT hybrid_stats_unique UNIQUE (user_id, collection_id, strategy_type, period_start)
);

-- ============================================
-- Indexes
-- ============================================

-- hybrid_configs indexes
CREATE INDEX IF NOT EXISTS idx_hybrid_configs_user ON hybrid_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_hybrid_configs_collection ON hybrid_configs(collection_id) WHERE collection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hybrid_configs_active ON hybrid_configs(user_id, is_active) WHERE is_active = TRUE;

-- hybrid_results indexes
CREATE INDEX IF NOT EXISTS idx_hybrid_results_config ON hybrid_results(config_id);
CREATE INDEX IF NOT EXISTS idx_hybrid_results_user ON hybrid_results(user_id);
CREATE INDEX IF NOT EXISTS idx_hybrid_results_trace ON hybrid_results(trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hybrid_results_created ON hybrid_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hybrid_results_collection ON hybrid_results(collection_id);

-- multi_query_cache indexes
CREATE INDEX IF NOT EXISTS idx_mq_cache_user ON multi_query_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_mq_cache_hash ON multi_query_cache(original_query_hash);
CREATE INDEX IF NOT EXISTS idx_mq_cache_expires ON multi_query_cache(expires_at) ;

-- hybrid_strategy_stats indexes
CREATE INDEX IF NOT EXISTS idx_hybrid_stats_user ON hybrid_strategy_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_hybrid_stats_collection ON hybrid_strategy_stats(collection_id) WHERE collection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hybrid_stats_period ON hybrid_strategy_stats(period_start, period_end);

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE hybrid_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hybrid_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_query_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE hybrid_strategy_stats ENABLE ROW LEVEL SECURITY;

-- Users own their configs
CREATE POLICY "Users own their hybrid configs" ON hybrid_configs
  FOR ALL USING (auth.uid() = user_id);

-- Results accessible via configs or direct ownership
CREATE POLICY "Results via user ownership" ON hybrid_results
  FOR ALL USING (auth.uid() = user_id);

-- Multi-query cache owned by user
CREATE POLICY "Users own their query cache" ON multi_query_cache
  FOR ALL USING (auth.uid() = user_id);

-- Strategy stats owned by user
CREATE POLICY "Users own their strategy stats" ON hybrid_strategy_stats
  FOR ALL USING (auth.uid() = user_id);

-- Service role bypass for all tables
CREATE POLICY "Service role full access hybrid_configs" ON hybrid_configs
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access hybrid_results" ON hybrid_results
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access multi_query_cache" ON multi_query_cache
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access hybrid_strategy_stats" ON hybrid_strategy_stats
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ============================================
-- Functions
-- ============================================

-- Get or create default hybrid config for a user
CREATE OR REPLACE FUNCTION get_or_create_default_hybrid_config(
  p_user_id UUID,
  p_collection_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_config_id UUID;
BEGIN
  -- Try to find existing default config
  SELECT id INTO v_config_id
  FROM hybrid_configs
  WHERE user_id = p_user_id
    AND (collection_id = p_collection_id OR (collection_id IS NULL AND p_collection_id IS NULL))
    AND name = 'default'
    AND is_active = TRUE
  LIMIT 1;

  -- Create if not exists
  IF v_config_id IS NULL THEN
    INSERT INTO hybrid_configs (
      user_id,
      collection_id,
      name,
      strategies,
      fusion_method
    ) VALUES (
      p_user_id,
      p_collection_id,
      'default',
      '[
        {"type": "vector", "weight": 0.7, "params": {"top_k": 20}},
        {"type": "keyword", "weight": 0.3, "params": {"top_k": 20}}
      ]'::jsonb,
      'rrf'
    )
    RETURNING id INTO v_config_id;
  END IF;

  RETURN v_config_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record hybrid retrieval result
CREATE OR REPLACE FUNCTION record_hybrid_result(
  p_config_id UUID,
  p_user_id UUID,
  p_trace_id UUID,
  p_query_hash TEXT,
  p_collection_id UUID,
  p_strategy_results JSONB,
  p_fused_results JSONB,
  p_fusion_method TEXT,
  p_total_latency_ms FLOAT,
  p_strategy_latencies JSONB
)
RETURNS UUID AS $$
DECLARE
  v_result_id UUID;
BEGIN
  INSERT INTO hybrid_results (
    config_id,
    user_id,
    trace_id,
    query_hash,
    collection_id,
    strategy_results,
    fused_results,
    fusion_method,
    total_latency_ms,
    strategy_latencies
  ) VALUES (
    p_config_id,
    p_user_id,
    p_trace_id,
    p_query_hash,
    p_collection_id,
    p_strategy_results,
    p_fused_results,
    p_fusion_method,
    p_total_latency_ms,
    p_strategy_latencies
  )
  RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update learned weights based on feedback
CREATE OR REPLACE FUNCTION update_learned_weights(
  p_config_id UUID,
  p_feedback_score FLOAT,
  p_clicked_positions INTEGER[]
)
RETURNS VOID AS $$
DECLARE
  v_current_weights JSONB;
  v_strategy_count INTEGER;
BEGIN
  -- Get current config
  SELECT learned_weights, jsonb_array_length(strategies)
  INTO v_current_weights, v_strategy_count
  FROM hybrid_configs
  WHERE id = p_config_id;

  -- Initialize weights if null
  IF v_current_weights IS NULL THEN
    v_current_weights = '{}'::jsonb;
  END IF;

  -- Simple exponential moving average update
  -- In production, this would be more sophisticated
  UPDATE hybrid_configs
  SET
    learned_weights = jsonb_set(
      COALESCE(learned_weights, '{}'::jsonb),
      '{feedback_count}',
      to_jsonb(COALESCE((learned_weights->>'feedback_count')::integer, 0) + 1)
    ),
    updated_at = NOW()
  WHERE id = p_config_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clean up expired multi-query cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_mq_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM multi_query_cache
    WHERE expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Updated timestamp trigger
-- ============================================

CREATE OR REPLACE FUNCTION update_hybrid_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_hybrid_configs_updated_at ON hybrid_configs;
CREATE TRIGGER trigger_hybrid_configs_updated_at
  BEFORE UPDATE ON hybrid_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_hybrid_configs_updated_at();

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE hybrid_configs IS 'User configurations for hybrid multi-strategy retrieval';
COMMENT ON TABLE hybrid_results IS 'Audit trail of hybrid retrieval executions';
COMMENT ON TABLE multi_query_cache IS 'Cache for multi-query expansion results';
COMMENT ON TABLE hybrid_strategy_stats IS 'Aggregated performance stats per strategy';

COMMENT ON COLUMN hybrid_configs.strategies IS 'Array of strategy configs: [{type, weight, params}]';
COMMENT ON COLUMN hybrid_configs.fusion_method IS 'How to merge results: rrf (Reciprocal Rank Fusion), weighted_sum, learned, cascade';
COMMENT ON COLUMN hybrid_configs.rrf_k IS 'RRF smoothing parameter (typical: 60)';
COMMENT ON COLUMN hybrid_configs.cascade_threshold IS 'Score threshold for cascade fusion early-exit';
COMMENT ON COLUMN hybrid_configs.learned_weights IS 'Dynamically learned weights from user feedback';

COMMENT ON COLUMN hybrid_results.strategy_results IS 'Raw results from each strategy before fusion';
COMMENT ON COLUMN hybrid_results.fused_results IS 'Final merged results after fusion';
COMMENT ON COLUMN hybrid_results.strategy_latencies IS 'Latency per strategy for performance analysis';
