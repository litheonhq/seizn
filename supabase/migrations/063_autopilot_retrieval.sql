-- Seizn Autopilot Retrieval - Automatic Strategy Selection
-- Migration: 063_autopilot_retrieval.sql
--
-- Tables:
-- - autopilot_retrieval_configs: User/collection autopilot settings
-- - autopilot_retrieval_decisions: Strategy decisions and outcomes
-- - autopilot_strategy_stats: Cached strategy performance statistics

-- ===========================================
-- 1) Autopilot Retrieval Configurations
-- ===========================================
CREATE TABLE IF NOT EXISTS autopilot_retrieval_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  collection_id UUID REFERENCES summer_collections(id) ON DELETE CASCADE,

  -- Mode settings
  enabled BOOLEAN DEFAULT TRUE,
  mode TEXT DEFAULT 'balanced' CHECK (mode IN ('conservative', 'balanced', 'aggressive', 'experimental')),

  -- Constraints
  max_latency_ms INTEGER DEFAULT 2000,
  max_cost_per_query FLOAT DEFAULT 0.01,
  min_relevance_threshold FLOAT DEFAULT 0.5,

  -- Strategy weights (learned via multi-armed bandit)
  -- Format: {"vector": 0.4, "hybrid": 0.4, "keyword": 0.1, "multi_query": 0.05, "hyde": 0.05}
  strategy_weights JSONB DEFAULT '{
    "vector": 0.3,
    "hybrid": 0.4,
    "keyword": 0.15,
    "multi_query": 0.1,
    "hyde": 0.05
  }'::JSONB,

  -- Learning settings
  exploration_rate FLOAT DEFAULT 0.1,  -- % of queries to try new strategies (epsilon)
  learning_rate FLOAT DEFAULT 0.05,    -- How fast to update weights
  min_samples_before_learning INTEGER DEFAULT 100,  -- Minimum samples before learning kicks in

  -- Advanced settings
  use_thompson_sampling BOOLEAN DEFAULT FALSE,  -- Use Thompson Sampling instead of UCB
  decay_factor FLOAT DEFAULT 0.99,  -- Decay old rewards (for non-stationary environments)

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one config per user-collection pair (NULL collection = global user config)
  UNIQUE(user_id, collection_id)
);

-- ===========================================
-- 2) Autopilot Retrieval Decisions
-- ===========================================
CREATE TABLE IF NOT EXISTS autopilot_retrieval_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES autopilot_retrieval_configs(id) ON DELETE CASCADE,
  trace_id UUID REFERENCES fall_retrieval_traces(id) ON DELETE SET NULL,

  -- Decision context
  query_text TEXT NOT NULL,
  query_length INTEGER,
  query_type TEXT,  -- detected: keyword_like, semantic, complex, etc.

  -- Strategy chosen
  chosen_strategy TEXT NOT NULL CHECK (chosen_strategy IN ('vector', 'hybrid', 'keyword', 'multi_query', 'hyde')),
  strategy_params JSONB,  -- Parameters used for the strategy
  decision_reason TEXT,   -- Why this strategy was chosen
  was_exploration BOOLEAN DEFAULT FALSE,  -- True if this was an exploration (vs exploitation)

  -- Pre-decision state (for debugging)
  pre_decision_weights JSONB,  -- Strategy weights before decision

  -- Outcome metrics (filled after execution)
  latency_ms FLOAT,
  relevance_score FLOAT,
  cost FLOAT,
  result_count INTEGER,

  -- User feedback (optional, filled later)
  user_feedback TEXT CHECK (user_feedback IN ('positive', 'negative', 'neutral', NULL)),
  feedback_at TIMESTAMPTZ,

  -- Calculated reward (used for learning)
  reward FLOAT,
  reward_components JSONB,  -- Breakdown: {"relevance": 0.8, "latency": 0.9, "cost": 0.95, "feedback": 0.5}

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- 3) Strategy Performance Statistics (Cache)
-- ===========================================
CREATE TABLE IF NOT EXISTS autopilot_strategy_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES autopilot_retrieval_configs(id) ON DELETE CASCADE,
  strategy TEXT NOT NULL CHECK (strategy IN ('vector', 'hybrid', 'keyword', 'multi_query', 'hyde')),

  -- Lifetime stats
  total_uses INTEGER DEFAULT 0,
  total_successes INTEGER DEFAULT 0,  -- reward > 0.5
  avg_latency_ms FLOAT DEFAULT 0,
  avg_relevance FLOAT DEFAULT 0,
  avg_cost FLOAT DEFAULT 0,
  avg_reward FLOAT DEFAULT 0,
  success_rate FLOAT DEFAULT 0,

  -- Time-windowed stats (last 24 hours, for trend detection)
  recent_uses INTEGER DEFAULT 0,
  recent_avg_relevance FLOAT DEFAULT 0,
  recent_avg_reward FLOAT DEFAULT 0,
  recent_success_rate FLOAT DEFAULT 0,

  -- Thompson Sampling parameters (Beta distribution)
  beta_alpha FLOAT DEFAULT 1.0,  -- Prior successes
  beta_beta FLOAT DEFAULT 1.0,  -- Prior failures

  -- UCB parameters
  ucb_value FLOAT DEFAULT 0,

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(config_id, strategy)
);

-- ===========================================
-- 4) Indexes
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_autopilot_retrieval_configs_user
  ON autopilot_retrieval_configs(user_id);

CREATE INDEX IF NOT EXISTS idx_autopilot_retrieval_configs_collection
  ON autopilot_retrieval_configs(collection_id)
  WHERE collection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_autopilot_retrieval_decisions_config
  ON autopilot_retrieval_decisions(config_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_autopilot_retrieval_decisions_trace
  ON autopilot_retrieval_decisions(trace_id)
  WHERE trace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_autopilot_retrieval_decisions_strategy
  ON autopilot_retrieval_decisions(chosen_strategy, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_autopilot_retrieval_decisions_feedback
  ON autopilot_retrieval_decisions(config_id, user_feedback)
  WHERE user_feedback IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_autopilot_strategy_stats_config
  ON autopilot_strategy_stats(config_id);

-- ===========================================
-- 5) RLS Policies
-- ===========================================
ALTER TABLE autopilot_retrieval_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE autopilot_retrieval_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE autopilot_strategy_stats ENABLE ROW LEVEL SECURITY;

-- Configs: Users own their configs
CREATE POLICY "Users own autopilot_retrieval_configs"
  ON autopilot_retrieval_configs FOR ALL
  USING (auth.uid()::TEXT = user_id);

-- Decisions: Access via config ownership
CREATE POLICY "Users access decisions via configs"
  ON autopilot_retrieval_decisions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM autopilot_retrieval_configs
      WHERE id = config_id AND user_id = auth.uid()::TEXT
    )
  );

-- Stats: Access via config ownership
CREATE POLICY "Users access stats via configs"
  ON autopilot_strategy_stats FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM autopilot_retrieval_configs
      WHERE id = config_id AND user_id = auth.uid()::TEXT
    )
  );

-- ===========================================
-- 6) Helper Functions
-- ===========================================

-- Get or create autopilot config for user (optionally collection-specific)
CREATE OR REPLACE FUNCTION get_or_create_autopilot_retrieval_config(
  p_user_id TEXT,
  p_collection_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_config_id UUID;
BEGIN
  -- Try to find existing config
  SELECT id INTO v_config_id
  FROM autopilot_retrieval_configs
  WHERE user_id = p_user_id
    AND (
      (p_collection_id IS NULL AND collection_id IS NULL) OR
      (collection_id = p_collection_id)
    );

  -- Create if not exists
  IF v_config_id IS NULL THEN
    INSERT INTO autopilot_retrieval_configs (user_id, collection_id)
    VALUES (p_user_id, p_collection_id)
    RETURNING id INTO v_config_id;

    -- Initialize strategy stats
    INSERT INTO autopilot_strategy_stats (config_id, strategy)
    VALUES
      (v_config_id, 'vector'),
      (v_config_id, 'hybrid'),
      (v_config_id, 'keyword'),
      (v_config_id, 'multi_query'),
      (v_config_id, 'hyde');
  END IF;

  RETURN v_config_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record a decision with outcome
CREATE OR REPLACE FUNCTION record_autopilot_decision(
  p_config_id UUID,
  p_trace_id UUID,
  p_query_text TEXT,
  p_chosen_strategy TEXT,
  p_strategy_params JSONB,
  p_decision_reason TEXT,
  p_was_exploration BOOLEAN,
  p_pre_decision_weights JSONB,
  p_latency_ms FLOAT,
  p_relevance_score FLOAT,
  p_cost FLOAT,
  p_result_count INTEGER,
  p_reward FLOAT,
  p_reward_components JSONB
)
RETURNS UUID AS $$
DECLARE
  v_decision_id UUID;
  v_query_length INTEGER;
BEGIN
  v_query_length := LENGTH(p_query_text);

  INSERT INTO autopilot_retrieval_decisions (
    config_id, trace_id, query_text, query_length,
    chosen_strategy, strategy_params, decision_reason, was_exploration,
    pre_decision_weights, latency_ms, relevance_score, cost, result_count,
    reward, reward_components
  )
  VALUES (
    p_config_id, p_trace_id, p_query_text, v_query_length,
    p_chosen_strategy, p_strategy_params, p_decision_reason, p_was_exploration,
    p_pre_decision_weights, p_latency_ms, p_relevance_score, p_cost, p_result_count,
    p_reward, p_reward_components
  )
  RETURNING id INTO v_decision_id;

  RETURN v_decision_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update strategy stats after a decision
CREATE OR REPLACE FUNCTION update_autopilot_strategy_stats(
  p_config_id UUID,
  p_strategy TEXT,
  p_latency_ms FLOAT,
  p_relevance FLOAT,
  p_cost FLOAT,
  p_reward FLOAT
)
RETURNS VOID AS $$
DECLARE
  v_is_success BOOLEAN;
BEGIN
  v_is_success := p_reward > 0.5;

  UPDATE autopilot_strategy_stats
  SET
    total_uses = total_uses + 1,
    total_successes = total_successes + (CASE WHEN v_is_success THEN 1 ELSE 0 END),
    avg_latency_ms = (avg_latency_ms * total_uses + p_latency_ms) / (total_uses + 1),
    avg_relevance = (avg_relevance * total_uses + p_relevance) / (total_uses + 1),
    avg_cost = (avg_cost * total_uses + p_cost) / (total_uses + 1),
    avg_reward = (avg_reward * total_uses + p_reward) / (total_uses + 1),
    success_rate = (total_successes + (CASE WHEN v_is_success THEN 1 ELSE 0 END))::FLOAT / (total_uses + 1),
    -- Update Thompson Sampling parameters
    beta_alpha = beta_alpha + (CASE WHEN v_is_success THEN 1 ELSE 0 END),
    beta_beta = beta_beta + (CASE WHEN NOT v_is_success THEN 1 ELSE 0 END),
    updated_at = NOW()
  WHERE config_id = p_config_id AND strategy = p_strategy;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update strategy weights after learning
CREATE OR REPLACE FUNCTION update_autopilot_strategy_weights(
  p_config_id UUID,
  p_new_weights JSONB
)
RETURNS VOID AS $$
BEGIN
  UPDATE autopilot_retrieval_configs
  SET
    strategy_weights = p_new_weights,
    updated_at = NOW()
  WHERE id = p_config_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record user feedback for a decision
CREATE OR REPLACE FUNCTION record_autopilot_feedback(
  p_decision_id UUID,
  p_feedback TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE autopilot_retrieval_decisions
  SET
    user_feedback = p_feedback,
    feedback_at = NOW()
  WHERE id = p_decision_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get strategy stats summary for a config
CREATE OR REPLACE FUNCTION get_autopilot_strategy_summary(
  p_config_id UUID
)
RETURNS TABLE (
  strategy TEXT,
  total_uses INTEGER,
  success_rate FLOAT,
  avg_reward FLOAT,
  avg_latency_ms FLOAT,
  avg_relevance FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.strategy,
    s.total_uses,
    s.success_rate,
    s.avg_reward,
    s.avg_latency_ms,
    s.avg_relevance
  FROM autopilot_strategy_stats s
  WHERE s.config_id = p_config_id
  ORDER BY s.avg_reward DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refresh recent stats (call periodically)
CREATE OR REPLACE FUNCTION refresh_autopilot_recent_stats(
  p_config_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE autopilot_strategy_stats s
  SET
    recent_uses = subq.cnt,
    recent_avg_relevance = subq.avg_rel,
    recent_avg_reward = subq.avg_rew,
    recent_success_rate = subq.success_rate,
    updated_at = NOW()
  FROM (
    SELECT
      d.chosen_strategy AS strategy,
      COUNT(*)::INTEGER AS cnt,
      AVG(d.relevance_score) AS avg_rel,
      AVG(d.reward) AS avg_rew,
      AVG(CASE WHEN d.reward > 0.5 THEN 1.0 ELSE 0.0 END) AS success_rate
    FROM autopilot_retrieval_decisions d
    WHERE d.config_id = p_config_id
      AND d.created_at > NOW() - INTERVAL '24 hours'
    GROUP BY d.chosen_strategy
  ) subq
  WHERE s.config_id = p_config_id
    AND s.strategy = subq.strategy;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 7) Triggers
-- ===========================================

-- Auto-update updated_at on configs
CREATE OR REPLACE FUNCTION update_autopilot_retrieval_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_autopilot_retrieval_config_updated
  ON autopilot_retrieval_configs;

CREATE TRIGGER trigger_autopilot_retrieval_config_updated
  BEFORE UPDATE ON autopilot_retrieval_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_autopilot_retrieval_config_timestamp();

-- ===========================================
-- 8) Comments
-- ===========================================
COMMENT ON TABLE autopilot_retrieval_configs IS 'Autopilot retrieval configuration per user/collection with learned strategy weights';
COMMENT ON TABLE autopilot_retrieval_decisions IS 'Record of autopilot strategy decisions with outcomes for learning';
COMMENT ON TABLE autopilot_strategy_stats IS 'Cached performance statistics per strategy for fast decision making';

COMMENT ON COLUMN autopilot_retrieval_configs.mode IS 'Autopilot mode: conservative (exploit more), balanced, aggressive (explore more), experimental (high exploration)';
COMMENT ON COLUMN autopilot_retrieval_configs.strategy_weights IS 'Learned weights for each retrieval strategy from multi-armed bandit';
COMMENT ON COLUMN autopilot_retrieval_configs.exploration_rate IS 'Epsilon for epsilon-greedy exploration (0.1 = 10% exploration)';

COMMENT ON COLUMN autopilot_retrieval_decisions.was_exploration IS 'True if strategy was chosen via exploration (vs exploitation of best known)';
COMMENT ON COLUMN autopilot_retrieval_decisions.reward IS 'Calculated reward combining relevance, latency, cost, and feedback';

COMMENT ON COLUMN autopilot_strategy_stats.beta_alpha IS 'Thompson Sampling: Beta distribution alpha parameter (prior successes + 1)';
COMMENT ON COLUMN autopilot_strategy_stats.beta_beta IS 'Thompson Sampling: Beta distribution beta parameter (prior failures + 1)';

COMMENT ON FUNCTION get_or_create_autopilot_retrieval_config IS 'Get existing or create new autopilot config for user/collection';
COMMENT ON FUNCTION record_autopilot_decision IS 'Record a complete autopilot decision with outcome metrics';
COMMENT ON FUNCTION update_autopilot_strategy_stats IS 'Update strategy statistics after a decision';
COMMENT ON FUNCTION record_autopilot_feedback IS 'Record user feedback for a decision';
