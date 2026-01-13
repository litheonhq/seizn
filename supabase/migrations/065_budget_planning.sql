-- ============================================
-- Budget-aware Planning Schema
-- ============================================
-- Feature #7: Cost Optimization
--
-- Enables users to:
-- - Set budget constraints (daily/monthly/per-query)
-- - Track spending across embedding, reranking, and LLM operations
-- - Get optimized retrieval plans based on budget
-- - Receive alerts when approaching budget limits

-- ============================================
-- User Budget Settings
-- ============================================

CREATE TABLE IF NOT EXISTS retrieval_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Budget settings (USD)
  daily_budget_usd FLOAT DEFAULT 10.0,
  monthly_budget_usd FLOAT DEFAULT 100.0,
  per_query_max_usd FLOAT DEFAULT 0.05,

  -- Current usage tracking
  daily_spent_usd FLOAT DEFAULT 0,
  monthly_spent_usd FLOAT DEFAULT 0,
  last_reset_daily TIMESTAMPTZ DEFAULT NOW(),
  last_reset_monthly TIMESTAMPTZ DEFAULT NOW(),

  -- Alert settings
  alert_at_percent INTEGER DEFAULT 80,
  alert_sent_daily BOOLEAN DEFAULT FALSE,
  alert_sent_monthly BOOLEAN DEFAULT FALSE,

  -- Budget mode
  mode TEXT DEFAULT 'soft' CHECK (mode IN ('soft', 'hard')),
  -- soft: warn but allow queries
  -- hard: reject queries that exceed budget

  -- Fallback behavior when over budget
  fallback_strategy TEXT DEFAULT 'degrade' CHECK (fallback_strategy IN ('degrade', 'reject', 'queue')),
  -- degrade: use cheaper models/less results
  -- reject: return error
  -- queue: queue for later processing

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

-- ============================================
-- Query Cost Tracking
-- ============================================

CREATE TABLE IF NOT EXISTS query_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trace_id UUID,

  -- Cost breakdown (USD)
  embedding_cost FLOAT DEFAULT 0,
  rerank_cost FLOAT DEFAULT 0,
  llm_cost FLOAT DEFAULT 0,
  storage_cost FLOAT DEFAULT 0,
  total_cost FLOAT DEFAULT 0,

  -- Embedding details
  embedding_model TEXT,
  embedding_tokens INTEGER DEFAULT 0,
  embedding_dimensions INTEGER,

  -- Rerank details
  rerank_model TEXT,
  rerank_pairs INTEGER DEFAULT 0,

  -- LLM details
  llm_model TEXT,
  llm_tokens_in INTEGER DEFAULT 0,
  llm_tokens_out INTEGER DEFAULT 0,

  -- Query context
  query_type TEXT, -- 'search', 'rag', 'hybrid', etc.
  result_count INTEGER DEFAULT 0,

  -- Performance
  latency_ms INTEGER,

  -- Budget status at time of query
  was_over_budget BOOLEAN DEFAULT FALSE,
  used_fallback BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Cost-Optimized Plan Cache
-- ============================================

CREATE TABLE IF NOT EXISTS cost_optimized_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Budget tier (max cost per query in USD)
  max_cost FLOAT NOT NULL,

  -- Optimized plan configuration
  plan_config JSONB NOT NULL,
  -- Structure:
  -- {
  --   "embedding_model": "text-embedding-3-small",
  --   "rerank_enabled": false,
  --   "rerank_model": null,
  --   "llm_model": "gpt-4o-mini",
  --   "top_k": 5,
  --   "use_cache": true,
  --   "chunk_strategy": "balanced"
  -- }

  -- Estimates
  estimated_cost FLOAT,
  estimated_quality FLOAT, -- 0-1 quality score
  estimated_latency_ms INTEGER,

  -- Tradeoffs description
  tradeoffs JSONB,
  -- Array of strings describing quality/cost tradeoffs

  -- Validity
  valid_until TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 day'),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, max_cost)
);

-- ============================================
-- Daily Cost Aggregation (for analytics)
-- ============================================

CREATE TABLE IF NOT EXISTS daily_cost_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Totals
  total_queries INTEGER DEFAULT 0,
  total_cost_usd FLOAT DEFAULT 0,

  -- Breakdown
  embedding_cost_usd FLOAT DEFAULT 0,
  rerank_cost_usd FLOAT DEFAULT 0,
  llm_cost_usd FLOAT DEFAULT 0,
  storage_cost_usd FLOAT DEFAULT 0,

  -- Token usage
  total_embedding_tokens INTEGER DEFAULT 0,
  total_llm_tokens_in INTEGER DEFAULT 0,
  total_llm_tokens_out INTEGER DEFAULT 0,

  -- Averages
  avg_cost_per_query FLOAT DEFAULT 0,
  avg_latency_ms FLOAT DEFAULT 0,

  -- Budget metrics
  budget_utilization_pct FLOAT DEFAULT 0,
  over_budget_queries INTEGER DEFAULT 0,
  fallback_queries INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, date)
);

-- ============================================
-- Budget Alerts History
-- ============================================

CREATE TABLE IF NOT EXISTS budget_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Alert type
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'daily_threshold',
    'monthly_threshold',
    'daily_exceeded',
    'monthly_exceeded',
    'query_rejected',
    'fallback_triggered'
  )),

  -- Alert details
  threshold_pct INTEGER,
  current_spent FLOAT,
  budget_limit FLOAT,

  -- Message
  title TEXT NOT NULL,
  message TEXT,

  -- Status
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================

-- Budget lookups
CREATE INDEX IF NOT EXISTS idx_budgets_user ON retrieval_budgets(user_id);

-- Cost tracking
CREATE INDEX IF NOT EXISTS idx_costs_user ON query_costs(user_id);
CREATE INDEX IF NOT EXISTS idx_costs_trace ON query_costs(trace_id);
CREATE INDEX IF NOT EXISTS idx_costs_created ON query_costs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_costs_user_created ON query_costs(user_id, created_at DESC);

-- Plan cache
CREATE INDEX IF NOT EXISTS idx_plans_user ON cost_optimized_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_plans_valid ON cost_optimized_plans(valid_until);

-- Daily summaries
CREATE INDEX IF NOT EXISTS idx_daily_user_date ON daily_cost_summary(user_id, date DESC);

-- Budget alerts
CREATE INDEX IF NOT EXISTS idx_alerts_user ON budget_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_unack ON budget_alerts(user_id, acknowledged) WHERE acknowledged = FALSE;

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE retrieval_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_optimized_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_cost_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_alerts ENABLE ROW LEVEL SECURITY;

-- Policies for retrieval_budgets
CREATE POLICY "Users own budgets" ON retrieval_budgets
  FOR ALL USING (auth.uid() = user_id);

-- Policies for query_costs
CREATE POLICY "Users own costs" ON query_costs
  FOR ALL USING (auth.uid() = user_id);

-- Policies for cost_optimized_plans
CREATE POLICY "Users own plans" ON cost_optimized_plans
  FOR ALL USING (auth.uid() = user_id);

-- Policies for daily_cost_summary
CREATE POLICY "Users own summaries" ON daily_cost_summary
  FOR ALL USING (auth.uid() = user_id);

-- Policies for budget_alerts
CREATE POLICY "Users own alerts" ON budget_alerts
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- Functions
-- ============================================

-- Reset daily budget tracking
CREATE OR REPLACE FUNCTION reset_daily_budget()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if we need to reset (new day)
  IF NEW.last_reset_daily::DATE < CURRENT_DATE THEN
    NEW.daily_spent_usd := 0;
    NEW.last_reset_daily := NOW();
    NEW.alert_sent_daily := FALSE;
  END IF;

  -- Check if we need to reset monthly (new month)
  IF DATE_TRUNC('month', NEW.last_reset_monthly) < DATE_TRUNC('month', NOW()) THEN
    NEW.monthly_spent_usd := 0;
    NEW.last_reset_monthly := NOW();
    NEW.alert_sent_monthly := FALSE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for budget reset
DROP TRIGGER IF EXISTS trigger_reset_daily_budget ON retrieval_budgets;
CREATE TRIGGER trigger_reset_daily_budget
  BEFORE UPDATE ON retrieval_budgets
  FOR EACH ROW
  EXECUTE FUNCTION reset_daily_budget();

-- Update spending and check alerts
CREATE OR REPLACE FUNCTION record_query_cost(
  p_user_id UUID,
  p_trace_id UUID,
  p_embedding_cost FLOAT DEFAULT 0,
  p_rerank_cost FLOAT DEFAULT 0,
  p_llm_cost FLOAT DEFAULT 0,
  p_storage_cost FLOAT DEFAULT 0,
  p_embedding_model TEXT DEFAULT NULL,
  p_embedding_tokens INTEGER DEFAULT 0,
  p_rerank_model TEXT DEFAULT NULL,
  p_rerank_pairs INTEGER DEFAULT 0,
  p_llm_model TEXT DEFAULT NULL,
  p_llm_tokens_in INTEGER DEFAULT 0,
  p_llm_tokens_out INTEGER DEFAULT 0,
  p_query_type TEXT DEFAULT 'search',
  p_result_count INTEGER DEFAULT 0,
  p_latency_ms INTEGER DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_total_cost FLOAT;
  v_budget RECORD;
  v_was_over_budget BOOLEAN := FALSE;
  v_alert_needed TEXT := NULL;
  v_cost_id UUID;
BEGIN
  -- Calculate total cost
  v_total_cost := COALESCE(p_embedding_cost, 0) +
                  COALESCE(p_rerank_cost, 0) +
                  COALESCE(p_llm_cost, 0) +
                  COALESCE(p_storage_cost, 0);

  -- Get or create budget record
  INSERT INTO retrieval_budgets (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO UPDATE
  SET updated_at = NOW()
  RETURNING * INTO v_budget;

  -- Check if over daily budget before recording
  IF v_budget.daily_spent_usd + v_total_cost > v_budget.daily_budget_usd THEN
    v_was_over_budget := TRUE;
  END IF;

  -- Record the cost
  INSERT INTO query_costs (
    user_id, trace_id, embedding_cost, rerank_cost, llm_cost, storage_cost, total_cost,
    embedding_model, embedding_tokens, rerank_model, rerank_pairs,
    llm_model, llm_tokens_in, llm_tokens_out, query_type, result_count, latency_ms,
    was_over_budget
  ) VALUES (
    p_user_id, p_trace_id, p_embedding_cost, p_rerank_cost, p_llm_cost, p_storage_cost, v_total_cost,
    p_embedding_model, p_embedding_tokens, p_rerank_model, p_rerank_pairs,
    p_llm_model, p_llm_tokens_in, p_llm_tokens_out, p_query_type, p_result_count, p_latency_ms,
    v_was_over_budget
  ) RETURNING id INTO v_cost_id;

  -- Update budget spent
  UPDATE retrieval_budgets
  SET
    daily_spent_usd = daily_spent_usd + v_total_cost,
    monthly_spent_usd = monthly_spent_usd + v_total_cost,
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_budget;

  -- Check for daily alert threshold
  IF NOT v_budget.alert_sent_daily AND
     v_budget.daily_spent_usd >= (v_budget.daily_budget_usd * v_budget.alert_at_percent / 100) THEN
    v_alert_needed := 'daily_threshold';

    UPDATE retrieval_budgets
    SET alert_sent_daily = TRUE
    WHERE user_id = p_user_id;

    INSERT INTO budget_alerts (user_id, alert_type, threshold_pct, current_spent, budget_limit, title, message)
    VALUES (
      p_user_id, 'daily_threshold', v_budget.alert_at_percent, v_budget.daily_spent_usd, v_budget.daily_budget_usd,
      'Daily budget threshold reached',
      format('You have used %s%% of your daily budget ($%.4f of $%.2f)',
             v_budget.alert_at_percent, v_budget.daily_spent_usd, v_budget.daily_budget_usd)
    );
  END IF;

  -- Check for monthly alert threshold
  IF NOT v_budget.alert_sent_monthly AND
     v_budget.monthly_spent_usd >= (v_budget.monthly_budget_usd * v_budget.alert_at_percent / 100) THEN
    IF v_alert_needed IS NULL THEN
      v_alert_needed := 'monthly_threshold';
    END IF;

    UPDATE retrieval_budgets
    SET alert_sent_monthly = TRUE
    WHERE user_id = p_user_id;

    INSERT INTO budget_alerts (user_id, alert_type, threshold_pct, current_spent, budget_limit, title, message)
    VALUES (
      p_user_id, 'monthly_threshold', v_budget.alert_at_percent, v_budget.monthly_spent_usd, v_budget.monthly_budget_usd,
      'Monthly budget threshold reached',
      format('You have used %s%% of your monthly budget ($%.4f of $%.2f)',
             v_budget.alert_at_percent, v_budget.monthly_spent_usd, v_budget.monthly_budget_usd)
    );
  END IF;

  -- Update daily summary
  INSERT INTO daily_cost_summary (user_id, date, total_queries, total_cost_usd,
    embedding_cost_usd, rerank_cost_usd, llm_cost_usd, storage_cost_usd,
    total_embedding_tokens, total_llm_tokens_in, total_llm_tokens_out)
  VALUES (
    p_user_id, CURRENT_DATE, 1, v_total_cost,
    COALESCE(p_embedding_cost, 0), COALESCE(p_rerank_cost, 0), COALESCE(p_llm_cost, 0), COALESCE(p_storage_cost, 0),
    COALESCE(p_embedding_tokens, 0), COALESCE(p_llm_tokens_in, 0), COALESCE(p_llm_tokens_out, 0)
  )
  ON CONFLICT (user_id, date) DO UPDATE SET
    total_queries = daily_cost_summary.total_queries + 1,
    total_cost_usd = daily_cost_summary.total_cost_usd + v_total_cost,
    embedding_cost_usd = daily_cost_summary.embedding_cost_usd + COALESCE(p_embedding_cost, 0),
    rerank_cost_usd = daily_cost_summary.rerank_cost_usd + COALESCE(p_rerank_cost, 0),
    llm_cost_usd = daily_cost_summary.llm_cost_usd + COALESCE(p_llm_cost, 0),
    storage_cost_usd = daily_cost_summary.storage_cost_usd + COALESCE(p_storage_cost, 0),
    total_embedding_tokens = daily_cost_summary.total_embedding_tokens + COALESCE(p_embedding_tokens, 0),
    total_llm_tokens_in = daily_cost_summary.total_llm_tokens_in + COALESCE(p_llm_tokens_in, 0),
    total_llm_tokens_out = daily_cost_summary.total_llm_tokens_out + COALESCE(p_llm_tokens_out, 0),
    over_budget_queries = daily_cost_summary.over_budget_queries + CASE WHEN v_was_over_budget THEN 1 ELSE 0 END,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'cost_id', v_cost_id,
    'total_cost', v_total_cost,
    'daily_spent', v_budget.daily_spent_usd,
    'monthly_spent', v_budget.monthly_spent_usd,
    'daily_budget', v_budget.daily_budget_usd,
    'monthly_budget', v_budget.monthly_budget_usd,
    'was_over_budget', v_was_over_budget,
    'alert_triggered', v_alert_needed
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check budget status
CREATE OR REPLACE FUNCTION check_budget_status(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_budget RECORD;
  v_daily_remaining FLOAT;
  v_monthly_remaining FLOAT;
  v_daily_pct FLOAT;
  v_monthly_pct FLOAT;
BEGIN
  -- Get budget record (auto-reset if needed)
  SELECT * INTO v_budget
  FROM retrieval_budgets
  WHERE user_id = p_user_id;

  IF v_budget IS NULL THEN
    -- Return defaults
    RETURN jsonb_build_object(
      'has_budget', FALSE,
      'daily_budget', 10.0,
      'monthly_budget', 100.0,
      'per_query_max', 0.05,
      'daily_spent', 0,
      'monthly_spent', 0,
      'daily_remaining', 10.0,
      'monthly_remaining', 100.0,
      'daily_usage_pct', 0,
      'monthly_usage_pct', 0,
      'mode', 'soft',
      'is_over_daily', FALSE,
      'is_over_monthly', FALSE
    );
  END IF;

  -- Check for resets
  IF v_budget.last_reset_daily::DATE < CURRENT_DATE THEN
    UPDATE retrieval_budgets
    SET daily_spent_usd = 0, last_reset_daily = NOW(), alert_sent_daily = FALSE
    WHERE user_id = p_user_id
    RETURNING * INTO v_budget;
  END IF;

  IF DATE_TRUNC('month', v_budget.last_reset_monthly) < DATE_TRUNC('month', NOW()) THEN
    UPDATE retrieval_budgets
    SET monthly_spent_usd = 0, last_reset_monthly = NOW(), alert_sent_monthly = FALSE
    WHERE user_id = p_user_id
    RETURNING * INTO v_budget;
  END IF;

  -- Calculate remaining and percentages
  v_daily_remaining := GREATEST(0, v_budget.daily_budget_usd - v_budget.daily_spent_usd);
  v_monthly_remaining := GREATEST(0, v_budget.monthly_budget_usd - v_budget.monthly_spent_usd);
  v_daily_pct := CASE WHEN v_budget.daily_budget_usd > 0
                      THEN (v_budget.daily_spent_usd / v_budget.daily_budget_usd) * 100
                      ELSE 0 END;
  v_monthly_pct := CASE WHEN v_budget.monthly_budget_usd > 0
                        THEN (v_budget.monthly_spent_usd / v_budget.monthly_budget_usd) * 100
                        ELSE 0 END;

  RETURN jsonb_build_object(
    'has_budget', TRUE,
    'daily_budget', v_budget.daily_budget_usd,
    'monthly_budget', v_budget.monthly_budget_usd,
    'per_query_max', v_budget.per_query_max_usd,
    'daily_spent', v_budget.daily_spent_usd,
    'monthly_spent', v_budget.monthly_spent_usd,
    'daily_remaining', v_daily_remaining,
    'monthly_remaining', v_monthly_remaining,
    'daily_usage_pct', v_daily_pct,
    'monthly_usage_pct', v_monthly_pct,
    'mode', v_budget.mode,
    'fallback_strategy', v_budget.fallback_strategy,
    'is_over_daily', v_budget.daily_spent_usd >= v_budget.daily_budget_usd,
    'is_over_monthly', v_budget.monthly_spent_usd >= v_budget.monthly_budget_usd,
    'alert_at_percent', v_budget.alert_at_percent
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION record_query_cost TO authenticated;
GRANT EXECUTE ON FUNCTION check_budget_status TO authenticated;
