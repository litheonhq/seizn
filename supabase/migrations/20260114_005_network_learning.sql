-- Migration: 071_network_learning.sql
-- Phase C3: Network Learning - Privacy-preserving collective intelligence
-- Enables opt-in anonymous signal sharing for system-wide improvements

-- ============================================
-- PRIVACY NOTICE
-- ============================================
-- This schema implements privacy-by-design principles:
-- 1. User consent is explicit and granular
-- 2. network_signals contains NO PII (no user_id)
-- 3. All signals are anonymized before storage
-- 4. Query patterns are clustered, not stored verbatim
-- 5. Users can revoke consent at any time
-- ============================================

-- ============================================
-- 1. User Consent Table
-- ============================================

CREATE TABLE IF NOT EXISTS network_consent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Consent status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'opted_in',    -- User has opted in
    'opted_out',   -- User has explicitly opted out
    'pending'      -- User hasn't made a choice yet
  )),

  -- Granular consent for different data types
  data_types TEXT[] DEFAULT '{}' CHECK (
    data_types <@ ARRAY[
      'query_pattern',     -- Anonymized query clusters
      'plan_path',         -- Retrieval plan sequences
      'retrieval_metric',  -- Performance metrics
      'feedback'           -- Explicit user feedback
    ]::TEXT[]
  ),

  -- Consent versioning
  version TEXT DEFAULT '1.0',
  terms_accepted_at TIMESTAMPTZ,

  -- Timestamps
  consented_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure logical consistency
  CONSTRAINT consent_status_logic CHECK (
    (status = 'opted_in' AND consented_at IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'opted_out' AND revoked_at IS NOT NULL)
    OR (status = 'pending' AND consented_at IS NULL AND revoked_at IS NULL)
  )
);

-- ============================================
-- 2. Anonymized Signals Table
-- ============================================
-- IMPORTANT: This table contains NO user_id!
-- All data is fully anonymized and cannot be traced back to individuals.

CREATE TABLE IF NOT EXISTS network_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Signal classification
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'query_pattern',     -- Anonymized query cluster
    'plan_path',         -- Retrieval plan sequence
    'retrieval_metric',  -- Performance metric
    'feedback'           -- User feedback score
  )),

  -- Anonymized query representation
  -- NOT the actual query! Just a cluster ID from k-means or similar
  query_cluster TEXT NOT NULL,

  -- Plan execution path (sequence of retrieval strategies used)
  plan_path TEXT[] DEFAULT '{}',

  -- Anonymized metrics
  metrics JSONB NOT NULL DEFAULT '{}', -- {latencyMs, resultsCount, feedbackScore, etc.}

  -- Context (anonymized)
  domain_hint TEXT, -- e.g., 'legal', 'medical', 'technical' - no specifics
  locale TEXT, -- e.g., 'en-US', 'ko-KR'

  -- Timestamp only (no date to prevent time-based correlation attacks)
  hour_of_day INTEGER CHECK (hour_of_day >= 0 AND hour_of_day < 24),
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week < 7),

  created_at TIMESTAMPTZ DEFAULT NOW()

  -- NO user_id column - this is intentional for privacy!
  -- NO collection_id - too identifying
  -- NO IP address - never stored
);

-- ============================================
-- 3. Aggregated Insights Table
-- ============================================
-- Pre-aggregated insights for efficient querying

CREATE TABLE IF NOT EXISTS network_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Aggregation period
  period TEXT NOT NULL CHECK (period IN ('hourly', 'daily', 'weekly', 'monthly')),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Query cluster being analyzed
  query_cluster TEXT NOT NULL,

  -- Aggregated statistics
  sample_count INTEGER NOT NULL CHECK (sample_count >= 0),

  -- Performance metrics (aggregated)
  avg_latency_ms DECIMAL(10, 2),
  p50_latency_ms DECIMAL(10, 2),
  p95_latency_ms DECIMAL(10, 2),
  p99_latency_ms DECIMAL(10, 2),

  avg_results_count DECIMAL(10, 2),
  avg_feedback_score DECIMAL(3, 2),

  -- Plan path analysis
  top_plan_paths JSONB DEFAULT '[]', -- [{path: [...], count: N, avgScore: 0.X}]
  plan_path_distribution JSONB DEFAULT '{}', -- {pathHash: count}

  -- Metadata
  domain_distribution JSONB DEFAULT '{}', -- {domain: count}
  locale_distribution JSONB DEFAULT '{}', -- {locale: count}

  -- Timestamps
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint for upsert
  CONSTRAINT unique_insight_period UNIQUE (period, period_start, query_cluster)
);

-- ============================================
-- 4. Policy Updates Table
-- ============================================
-- Tracks system policy changes derived from network learning

CREATE TABLE IF NOT EXISTS network_policy_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target policy being updated
  target_policy TEXT NOT NULL CHECK (target_policy IN (
    'retrieval_strategy',   -- Which retrieval methods to use
    'ranking_weights',      -- How to weight different signals
    'timeout_thresholds',   -- Latency budgets
    'cache_strategy',       -- What to cache
    'fallback_order',       -- Fallback retrieval order
    'quality_thresholds',   -- Minimum quality scores
    'custom'                -- Custom policies
  )),

  -- Policy change details
  changes JSONB NOT NULL, -- {field: {from: X, to: Y}}
  rationale TEXT, -- Human-readable explanation

  -- Evidence
  based_on_insights UUID[] DEFAULT '{}', -- insight IDs that informed this change
  sample_size INTEGER,
  confidence DECIMAL(3, 2) CHECK (confidence >= 0 AND confidence <= 1),

  -- Approval workflow
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',    -- Awaiting review
    'approved',   -- Approved for deployment
    'rejected',   -- Rejected
    'applied',    -- Successfully applied
    'rolled_back' -- Applied then rolled back
  )),

  -- Review metadata
  reviewed_by TEXT, -- admin user id or 'auto'
  review_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ
);

-- ============================================
-- 5. Indexes
-- ============================================

-- Consent indexes
CREATE INDEX IF NOT EXISTS idx_network_consent_user_id ON network_consent(user_id);
CREATE INDEX IF NOT EXISTS idx_network_consent_status ON network_consent(status);
CREATE INDEX IF NOT EXISTS idx_network_consent_data_types ON network_consent USING GIN(data_types);

-- Signal indexes (optimized for aggregation queries)
CREATE INDEX IF NOT EXISTS idx_network_signals_type ON network_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_network_signals_cluster ON network_signals(query_cluster);
CREATE INDEX IF NOT EXISTS idx_network_signals_created_at ON network_signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_network_signals_type_cluster ON network_signals(signal_type, query_cluster);
CREATE INDEX IF NOT EXISTS idx_network_signals_domain ON network_signals(domain_hint) WHERE domain_hint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_network_signals_locale ON network_signals(locale) WHERE locale IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_network_signals_metrics ON network_signals USING GIN(metrics);
CREATE INDEX IF NOT EXISTS idx_network_signals_plan_path ON network_signals USING GIN(plan_path);

-- Insights indexes
CREATE INDEX IF NOT EXISTS idx_network_insights_period ON network_insights(period, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_network_insights_cluster ON network_insights(query_cluster);
CREATE INDEX IF NOT EXISTS idx_network_insights_computed_at ON network_insights(computed_at DESC);

-- Policy updates indexes
CREATE INDEX IF NOT EXISTS idx_network_policy_updates_target ON network_policy_updates(target_policy);
CREATE INDEX IF NOT EXISTS idx_network_policy_updates_status ON network_policy_updates(status);
CREATE INDEX IF NOT EXISTS idx_network_policy_updates_created_at ON network_policy_updates(created_at DESC);

-- ============================================
-- 6. Row Level Security
-- ============================================

ALTER TABLE network_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_policy_updates ENABLE ROW LEVEL SECURITY;

-- Consent: Users can only manage their own consent
CREATE POLICY "Users can view own consent"
  ON network_consent FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own consent"
  ON network_consent FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own consent"
  ON network_consent FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Service role has full access to consent"
  ON network_consent FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role');

-- Signals: Only service role can insert (via API), no user access
-- This enforces that users cannot directly write to signals
CREATE POLICY "Service role can insert signals"
  ON network_signals FOR INSERT
  WITH CHECK ((current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role');

CREATE POLICY "Service role can read signals"
  ON network_signals FOR SELECT
  USING ((current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role');

-- Insights: Read-only for authenticated users, full access for service role
CREATE POLICY "Authenticated users can view insights"
  ON network_insights FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role has full access to insights"
  ON network_insights FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role');

-- Policy updates: Read-only for authenticated users, full access for service role
CREATE POLICY "Authenticated users can view policy updates"
  ON network_policy_updates FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role has full access to policy updates"
  ON network_policy_updates FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role');

-- ============================================
-- 7. Updated_at Trigger
-- ============================================

CREATE OR REPLACE FUNCTION update_network_consent_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS network_consent_updated_at ON network_consent;
CREATE TRIGGER network_consent_updated_at
  BEFORE UPDATE ON network_consent
  FOR EACH ROW
  EXECUTE FUNCTION update_network_consent_updated_at();

-- ============================================
-- 8. RPC Functions
-- ============================================

-- Check user consent status
CREATE OR REPLACE FUNCTION get_consent_status(p_user_id UUID)
RETURNS TABLE (
  status TEXT,
  data_types TEXT[],
  version TEXT,
  consented_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    nc.status,
    nc.data_types,
    nc.version,
    nc.consented_at
  FROM network_consent nc
  WHERE nc.user_id = p_user_id;

  -- If no record exists, return pending status
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'pending'::TEXT, '{}'::TEXT[], '1.0'::TEXT, NULL::TIMESTAMPTZ;
  END IF;
END;
$$;

-- Opt in to network learning
CREATE OR REPLACE FUNCTION opt_in_network_learning(
  p_user_id UUID,
  p_data_types TEXT[] DEFAULT ARRAY['query_pattern', 'retrieval_metric', 'feedback']
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO network_consent (user_id, status, data_types, consented_at, terms_accepted_at)
  VALUES (p_user_id, 'opted_in', p_data_types, NOW(), NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    status = 'opted_in',
    data_types = p_data_types,
    consented_at = NOW(),
    revoked_at = NULL,
    terms_accepted_at = NOW();

  RETURN TRUE;
END;
$$;

-- Opt out of network learning
CREATE OR REPLACE FUNCTION opt_out_network_learning(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO network_consent (user_id, status, data_types, revoked_at)
  VALUES (p_user_id, 'opted_out', '{}', NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    status = 'opted_out',
    data_types = '{}',
    revoked_at = NOW();

  RETURN TRUE;
END;
$$;

-- Record anonymous signal (service role only)
CREATE OR REPLACE FUNCTION record_network_signal(
  p_signal_type TEXT,
  p_query_cluster TEXT,
  p_plan_path TEXT[] DEFAULT '{}',
  p_metrics JSONB DEFAULT '{}',
  p_domain_hint TEXT DEFAULT NULL,
  p_locale TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  INSERT INTO network_signals (
    signal_type,
    query_cluster,
    plan_path,
    metrics,
    domain_hint,
    locale,
    hour_of_day,
    day_of_week
  ) VALUES (
    p_signal_type,
    p_query_cluster,
    p_plan_path,
    p_metrics,
    p_domain_hint,
    p_locale,
    EXTRACT(HOUR FROM v_now)::INTEGER,
    EXTRACT(DOW FROM v_now)::INTEGER
  )
  RETURNING id INTO v_signal_id;

  RETURN v_signal_id;
END;
$$;

-- Get insights for a query cluster
CREATE OR REPLACE FUNCTION get_cluster_insights(
  p_query_cluster TEXT,
  p_period TEXT DEFAULT 'daily',
  p_limit INT DEFAULT 30
)
RETURNS TABLE (
  period_start TIMESTAMPTZ,
  sample_count INTEGER,
  avg_latency_ms DECIMAL(10, 2),
  avg_feedback_score DECIMAL(3, 2),
  top_plan_paths JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ni.period_start,
    ni.sample_count,
    ni.avg_latency_ms,
    ni.avg_feedback_score,
    ni.top_plan_paths
  FROM network_insights ni
  WHERE ni.query_cluster = p_query_cluster
    AND ni.period = p_period
  ORDER BY ni.period_start DESC
  LIMIT p_limit;
END;
$$;

-- Aggregate signals into insights (for batch processing)
CREATE OR REPLACE FUNCTION aggregate_signals_to_insights(
  p_period TEXT,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  INSERT INTO network_insights (
    period,
    period_start,
    period_end,
    query_cluster,
    sample_count,
    avg_latency_ms,
    p50_latency_ms,
    p95_latency_ms,
    p99_latency_ms,
    avg_results_count,
    avg_feedback_score,
    top_plan_paths,
    domain_distribution,
    locale_distribution,
    computed_at
  )
  SELECT
    p_period,
    p_period_start,
    p_period_end,
    ns.query_cluster,
    COUNT(*)::INTEGER AS sample_count,
    AVG((ns.metrics->>'latencyMs')::DECIMAL)::DECIMAL(10, 2) AS avg_latency_ms,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (ns.metrics->>'latencyMs')::DECIMAL)::DECIMAL(10, 2) AS p50_latency_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (ns.metrics->>'latencyMs')::DECIMAL)::DECIMAL(10, 2) AS p95_latency_ms,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY (ns.metrics->>'latencyMs')::DECIMAL)::DECIMAL(10, 2) AS p99_latency_ms,
    AVG((ns.metrics->>'resultsCount')::DECIMAL)::DECIMAL(10, 2) AS avg_results_count,
    AVG((ns.metrics->>'feedbackScore')::DECIMAL)::DECIMAL(3, 2) AS avg_feedback_score,
    (
      SELECT jsonb_agg(jsonb_build_object('path', plan_path, 'count', cnt))
      FROM (
        SELECT plan_path, COUNT(*) AS cnt
        FROM network_signals sub
        WHERE sub.query_cluster = ns.query_cluster
          AND sub.created_at >= p_period_start
          AND sub.created_at < p_period_end
        GROUP BY plan_path
        ORDER BY cnt DESC
        LIMIT 5
      ) top_paths
    ) AS top_plan_paths,
    jsonb_object_agg(COALESCE(ns.domain_hint, 'unknown'), 1) AS domain_distribution,
    jsonb_object_agg(COALESCE(ns.locale, 'unknown'), 1) AS locale_distribution,
    NOW() AS computed_at
  FROM network_signals ns
  WHERE ns.created_at >= p_period_start
    AND ns.created_at < p_period_end
  GROUP BY ns.query_cluster
  ON CONFLICT (period, period_start, query_cluster)
  DO UPDATE SET
    sample_count = EXCLUDED.sample_count,
    avg_latency_ms = EXCLUDED.avg_latency_ms,
    p50_latency_ms = EXCLUDED.p50_latency_ms,
    p95_latency_ms = EXCLUDED.p95_latency_ms,
    p99_latency_ms = EXCLUDED.p99_latency_ms,
    avg_results_count = EXCLUDED.avg_results_count,
    avg_feedback_score = EXCLUDED.avg_feedback_score,
    top_plan_paths = EXCLUDED.top_plan_paths,
    domain_distribution = EXCLUDED.domain_distribution,
    locale_distribution = EXCLUDED.locale_distribution,
    computed_at = NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Get recommended plan for a query cluster
CREATE OR REPLACE FUNCTION get_recommended_plan(p_query_cluster TEXT)
RETURNS TABLE (
  recommended_path TEXT[],
  avg_latency_ms DECIMAL(10, 2),
  avg_feedback_score DECIMAL(3, 2),
  sample_size INTEGER,
  confidence DECIMAL(3, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH recent_insights AS (
    SELECT *
    FROM network_insights
    WHERE query_cluster = p_query_cluster
      AND period = 'daily'
      AND period_start > NOW() - INTERVAL '7 days'
  ),
  best_path AS (
    SELECT
      (path_elem->>'path')::TEXT[] AS plan_path,
      (path_elem->>'count')::INTEGER AS usage_count
    FROM recent_insights ri,
         jsonb_array_elements(ri.top_plan_paths) AS path_elem
    ORDER BY (path_elem->>'count')::INTEGER DESC
    LIMIT 1
  )
  SELECT
    bp.plan_path AS recommended_path,
    AVG(ri.avg_latency_ms)::DECIMAL(10, 2) AS avg_latency_ms,
    AVG(ri.avg_feedback_score)::DECIMAL(3, 2) AS avg_feedback_score,
    SUM(ri.sample_count)::INTEGER AS sample_size,
    LEAST(1.0, SUM(ri.sample_count)::DECIMAL / 100)::DECIMAL(3, 2) AS confidence
  FROM best_path bp
  CROSS JOIN recent_insights ri
  GROUP BY bp.plan_path;
END;
$$;

-- Get network learning statistics
CREATE OR REPLACE FUNCTION get_network_learning_stats()
RETURNS TABLE (
  total_opted_in BIGINT,
  total_signals BIGINT,
  total_insights BIGINT,
  signals_today BIGINT,
  unique_clusters BIGINT,
  avg_feedback_score FLOAT,
  policy_updates_pending INTEGER,
  policy_updates_applied INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM network_consent WHERE status = 'opted_in')::BIGINT AS total_opted_in,
    (SELECT COUNT(*) FROM network_signals)::BIGINT AS total_signals,
    (SELECT COUNT(*) FROM network_insights)::BIGINT AS total_insights,
    (SELECT COUNT(*) FROM network_signals WHERE created_at > NOW() - INTERVAL '24 hours')::BIGINT AS signals_today,
    (SELECT COUNT(DISTINCT query_cluster) FROM network_signals)::BIGINT AS unique_clusters,
    (SELECT COALESCE(AVG((metrics->>'feedbackScore')::FLOAT), 0) FROM network_signals)::FLOAT AS avg_feedback_score,
    (SELECT COUNT(*) FROM network_policy_updates WHERE status = 'pending')::INTEGER AS policy_updates_pending,
    (SELECT COUNT(*) FROM network_policy_updates WHERE status = 'applied')::INTEGER AS policy_updates_applied;
END;
$$;

-- ============================================
-- 9. Data Retention Policy (Privacy)
-- ============================================

-- Function to clean old signals (for privacy compliance)
CREATE OR REPLACE FUNCTION cleanup_old_signals(p_retention_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM network_signals
  WHERE created_at < NOW() - (p_retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ============================================
-- 10. Comments
-- ============================================

COMMENT ON TABLE network_consent IS 'Phase C3: Network Learning - User consent for anonymous data sharing';
COMMENT ON COLUMN network_consent.status IS 'Consent status: opted_in, opted_out, pending';
COMMENT ON COLUMN network_consent.data_types IS 'Granular consent for specific data types';

COMMENT ON TABLE network_signals IS 'Phase C3: Network Learning - Anonymized signals (NO user_id for privacy)';
COMMENT ON COLUMN network_signals.query_cluster IS 'Anonymized query cluster ID (NOT the actual query)';
COMMENT ON COLUMN network_signals.plan_path IS 'Sequence of retrieval strategies used';
COMMENT ON COLUMN network_signals.metrics IS 'Performance metrics: latencyMs, resultsCount, feedbackScore';

COMMENT ON TABLE network_insights IS 'Phase C3: Network Learning - Aggregated insights from signals';
COMMENT ON COLUMN network_insights.period IS 'Aggregation period: hourly, daily, weekly, monthly';
COMMENT ON COLUMN network_insights.top_plan_paths IS 'Most successful plan paths for this cluster';

COMMENT ON TABLE network_policy_updates IS 'Phase C3: Network Learning - System policy changes from insights';
COMMENT ON COLUMN network_policy_updates.target_policy IS 'Policy being updated: retrieval_strategy, ranking_weights, etc.';
COMMENT ON COLUMN network_policy_updates.status IS 'Approval status: pending, approved, rejected, applied, rolled_back';

COMMENT ON FUNCTION get_consent_status IS 'Check user consent status';
COMMENT ON FUNCTION opt_in_network_learning IS 'Opt in to network learning with specified data types';
COMMENT ON FUNCTION opt_out_network_learning IS 'Opt out of network learning';
COMMENT ON FUNCTION record_network_signal IS 'Record anonymous signal (service role only)';
COMMENT ON FUNCTION aggregate_signals_to_insights IS 'Aggregate raw signals into insights';
COMMENT ON FUNCTION get_recommended_plan IS 'Get best plan path for a query cluster based on insights';
COMMENT ON FUNCTION cleanup_old_signals IS 'Delete signals older than retention period for privacy';
