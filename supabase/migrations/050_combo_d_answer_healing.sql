-- Seizn Combo D - Answer Contracts & Self-Healing
-- Migration: 050_combo_d_answer_healing.sql
--
-- Tables:
-- - answer_contracts: Quality contracts for answer generation
-- - healing_history: Self-healing action history

-- ===========================================
-- 1) Answer Contracts
-- ===========================================
CREATE TABLE IF NOT EXISTS answer_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Contract scope
  name TEXT NOT NULL,
  description TEXT,
  collection_id UUID REFERENCES summer_collections(id) ON DELETE SET NULL,

  -- Status: active, disabled, draft
  status TEXT NOT NULL DEFAULT 'active',

  -- Contract type: quality, safety, format, consistency
  contract_type TEXT NOT NULL DEFAULT 'quality',

  -- Quality requirements
  quality_requirements JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Example:
  -- {
  --   "min_relevance_score": 0.7,
  --   "min_source_count": 2,
  --   "max_hallucination_risk": 0.2,
  --   "required_citations": true,
  --   "max_latency_ms": 2000
  -- }

  -- Format requirements
  format_requirements JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Example:
  -- {
  --   "max_length": 1000,
  --   "min_length": 50,
  --   "format": "markdown",
  --   "language": "en",
  --   "tone": "professional"
  -- }

  -- Safety requirements
  safety_requirements JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Example:
  -- {
  --   "block_pii": true,
  --   "block_profanity": true,
  --   "content_policy": "strict"
  -- }

  -- Consistency requirements
  consistency_requirements JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Example:
  -- {
  --   "answer_determinism": "semantic", -- exact, semantic, relaxed
  --   "source_overlap_threshold": 0.8
  -- }

  -- Validation actions
  on_violation TEXT NOT NULL DEFAULT 'warn', -- warn, block, fallback, heal
  fallback_config JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Stats
  total_checks INT NOT NULL DEFAULT 0,
  violations_count INT NOT NULL DEFAULT 0,
  last_violation_at TIMESTAMPTZ,

  -- Priority (higher = checked first)
  priority INT NOT NULL DEFAULT 0,

  -- Metadata
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_answer_contracts_user
  ON answer_contracts(user_id, status);

CREATE INDEX IF NOT EXISTS idx_answer_contracts_collection
  ON answer_contracts(collection_id)
  WHERE collection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_answer_contracts_active
  ON answer_contracts(user_id, contract_type, priority DESC)
  WHERE status = 'active';

-- ===========================================
-- 2) Healing History
-- ===========================================
CREATE TABLE IF NOT EXISTS healing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Related entities
  contract_id UUID REFERENCES answer_contracts(id) ON DELETE SET NULL,
  trace_id UUID REFERENCES fall_retrieval_traces(id) ON DELETE SET NULL,
  request_id UUID,

  -- What triggered healing
  trigger_type TEXT NOT NULL, -- contract_violation, quality_drop, anomaly, manual
  trigger_details JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Original state
  original_state JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Example:
  -- {
  --   "answer": "...",
  --   "sources": [...],
  --   "quality_score": 0.45,
  --   "violations": ["min_relevance_score", "required_citations"]
  -- }

  -- Healing action taken
  healing_action TEXT NOT NULL, -- retry, rerank, expand_context, change_model, fallback
  healing_config JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Result after healing
  healed_state JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Example:
  -- {
  --   "answer": "...",
  --   "sources": [...],
  --   "quality_score": 0.82,
  --   "violations": []
  -- }

  -- Status: success, partial, failed
  status TEXT NOT NULL DEFAULT 'success',

  -- Metrics
  healing_latency_ms INT,
  quality_improvement FLOAT, -- Delta between original and healed quality
  attempts INT NOT NULL DEFAULT 1,

  -- Cost tracking
  additional_cost FLOAT NOT NULL DEFAULT 0,

  -- User feedback
  user_accepted BOOLEAN,
  user_feedback TEXT,
  feedback_submitted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_healing_history_user
  ON healing_history(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_healing_history_contract
  ON healing_history(contract_id, created_at DESC)
  WHERE contract_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_healing_history_trace
  ON healing_history(trace_id)
  WHERE trace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_healing_history_status
  ON healing_history(user_id, status, created_at DESC);

-- ===========================================
-- 3) Contract Violations Log
-- ===========================================
CREATE TABLE IF NOT EXISTS answer_contract_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  contract_id UUID NOT NULL REFERENCES answer_contracts(id) ON DELETE CASCADE,
  trace_id UUID REFERENCES fall_retrieval_traces(id) ON DELETE SET NULL,
  healing_id UUID REFERENCES healing_history(id) ON DELETE SET NULL,

  -- Violation details
  violation_type TEXT NOT NULL, -- quality, format, safety, consistency
  violated_requirements TEXT[] NOT NULL DEFAULT '{}',
  actual_values JSONB NOT NULL DEFAULT '{}'::JSONB,
  expected_values JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Severity: low, medium, high, critical
  severity TEXT NOT NULL DEFAULT 'medium',

  -- Resolution
  was_healed BOOLEAN NOT NULL DEFAULT FALSE,
  was_blocked BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_violations_contract
  ON answer_contract_violations(contract_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contract_violations_user
  ON answer_contract_violations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contract_violations_severity
  ON answer_contract_violations(user_id, severity, created_at DESC);

-- ===========================================
-- 4) RLS Policies
-- ===========================================
ALTER TABLE answer_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE healing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE answer_contract_violations ENABLE ROW LEVEL SECURITY;

-- Answer contracts
CREATE POLICY "Users can view own answer_contracts"
  ON answer_contracts FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own answer_contracts"
  ON answer_contracts FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own answer_contracts"
  ON answer_contracts FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can delete own answer_contracts"
  ON answer_contracts FOR DELETE
  USING (auth.uid()::TEXT = user_id);

-- Healing history
CREATE POLICY "Users can view own healing_history"
  ON healing_history FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own healing_history"
  ON healing_history FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own healing_history"
  ON healing_history FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

-- Violations
CREATE POLICY "Users can view own answer_contract_violations"
  ON answer_contract_violations FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own answer_contract_violations"
  ON answer_contract_violations FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

-- ===========================================
-- 5) Helper Functions
-- ===========================================

-- Get active contracts for a user/collection
CREATE OR REPLACE FUNCTION get_active_contracts(
  p_user_id TEXT,
  p_collection_id UUID DEFAULT NULL,
  p_contract_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  contract_type TEXT,
  quality_requirements JSONB,
  format_requirements JSONB,
  safety_requirements JSONB,
  consistency_requirements JSONB,
  on_violation TEXT,
  fallback_config JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.contract_type,
    c.quality_requirements,
    c.format_requirements,
    c.safety_requirements,
    c.consistency_requirements,
    c.on_violation,
    c.fallback_config
  FROM answer_contracts c
  WHERE c.user_id = p_user_id
    AND c.status = 'active'
    AND (p_collection_id IS NULL OR c.collection_id IS NULL OR c.collection_id = p_collection_id)
    AND (p_contract_type IS NULL OR c.contract_type = p_contract_type)
  ORDER BY c.priority DESC, c.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record contract check
CREATE OR REPLACE FUNCTION record_contract_check(
  p_contract_id UUID,
  p_had_violation BOOLEAN
)
RETURNS VOID AS $$
BEGIN
  UPDATE answer_contracts
  SET
    total_checks = total_checks + 1,
    violations_count = CASE WHEN p_had_violation THEN violations_count + 1 ELSE violations_count END,
    last_violation_at = CASE WHEN p_had_violation THEN NOW() ELSE last_violation_at END,
    updated_at = NOW()
  WHERE id = p_contract_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get healing effectiveness
CREATE OR REPLACE FUNCTION get_healing_effectiveness(
  p_user_id TEXT,
  p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  total_healings BIGINT,
  successful BIGINT,
  partial BIGINT,
  failed BIGINT,
  avg_quality_improvement FLOAT,
  avg_latency_ms FLOAT,
  total_additional_cost FLOAT,
  acceptance_rate FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_healings,
    COUNT(*) FILTER (WHERE status = 'success')::BIGINT AS successful,
    COUNT(*) FILTER (WHERE status = 'partial')::BIGINT AS partial,
    COUNT(*) FILTER (WHERE status = 'failed')::BIGINT AS failed,
    AVG(quality_improvement)::FLOAT AS avg_quality_improvement,
    AVG(healing_latency_ms)::FLOAT AS avg_latency_ms,
    SUM(additional_cost)::FLOAT AS total_additional_cost,
    (COUNT(*) FILTER (WHERE user_accepted = TRUE)::FLOAT /
     NULLIF(COUNT(*) FILTER (WHERE user_accepted IS NOT NULL), 0))::FLOAT AS acceptance_rate
  FROM healing_history
  WHERE user_id = p_user_id
    AND created_at >= p_start_date
    AND created_at <= p_end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get contract violation summary
CREATE OR REPLACE FUNCTION get_violation_summary(
  p_user_id TEXT,
  p_contract_id UUID DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  total_violations BIGINT,
  by_type JSONB,
  by_severity JSONB,
  healed_count BIGINT,
  blocked_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_violations,
    jsonb_object_agg(v.violation_type, v.type_count) AS by_type,
    jsonb_build_object(
      'low', COUNT(*) FILTER (WHERE cv.severity = 'low'),
      'medium', COUNT(*) FILTER (WHERE cv.severity = 'medium'),
      'high', COUNT(*) FILTER (WHERE cv.severity = 'high'),
      'critical', COUNT(*) FILTER (WHERE cv.severity = 'critical')
    ) AS by_severity,
    COUNT(*) FILTER (WHERE cv.was_healed = TRUE)::BIGINT AS healed_count,
    COUNT(*) FILTER (WHERE cv.was_blocked = TRUE)::BIGINT AS blocked_count
  FROM answer_contract_violations cv
  LEFT JOIN LATERAL (
    SELECT cv2.violation_type, COUNT(*) AS type_count
    FROM answer_contract_violations cv2
    WHERE cv2.user_id = p_user_id
      AND (p_contract_id IS NULL OR cv2.contract_id = p_contract_id)
      AND cv2.created_at >= p_start_date
      AND cv2.created_at <= p_end_date
    GROUP BY cv2.violation_type
  ) v ON TRUE
  WHERE cv.user_id = p_user_id
    AND (p_contract_id IS NULL OR cv.contract_id = p_contract_id)
    AND cv.created_at >= p_start_date
    AND cv.created_at <= p_end_date
  GROUP BY v.violation_type, v.type_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Submit healing feedback
CREATE OR REPLACE FUNCTION submit_healing_feedback(
  p_healing_id UUID,
  p_user_id TEXT,
  p_accepted BOOLEAN,
  p_feedback TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_updated BOOLEAN;
BEGIN
  UPDATE healing_history
  SET
    user_accepted = p_accepted,
    user_feedback = p_feedback,
    feedback_submitted_at = NOW()
  WHERE id = p_healing_id
    AND user_id = p_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 6) Triggers
-- ===========================================

CREATE OR REPLACE FUNCTION update_answer_contracts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_answer_contracts_updated ON answer_contracts;
CREATE TRIGGER trigger_answer_contracts_updated
  BEFORE UPDATE ON answer_contracts
  FOR EACH ROW
  EXECUTE FUNCTION update_answer_contracts_updated_at();

-- ===========================================
-- 7) Views
-- ===========================================

CREATE OR REPLACE VIEW contract_health AS
SELECT
  c.user_id,
  c.id AS contract_id,
  c.name,
  c.contract_type,
  c.total_checks,
  c.violations_count,
  CASE
    WHEN c.total_checks > 0 THEN
      ROUND((c.violations_count::FLOAT / c.total_checks * 100)::NUMERIC, 2)
    ELSE 0
  END AS violation_rate_pct,
  c.last_violation_at,
  c.status
FROM answer_contracts c;

CREATE OR REPLACE VIEW healing_summary_daily AS
SELECT
  user_id,
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*) AS total_healings,
  COUNT(*) FILTER (WHERE status = 'success') AS successful,
  AVG(quality_improvement) AS avg_quality_improvement,
  SUM(additional_cost) AS total_cost
FROM healing_history
GROUP BY user_id, DATE_TRUNC('day', created_at);

GRANT SELECT ON contract_health TO authenticated;
GRANT SELECT ON healing_summary_daily TO authenticated;

-- ===========================================
-- 8) Comments
-- ===========================================
COMMENT ON TABLE answer_contracts IS 'Quality contracts for answer generation with validation requirements';
COMMENT ON TABLE healing_history IS 'History of self-healing actions taken to fix quality issues';
COMMENT ON TABLE answer_contract_violations IS 'Log of contract violations for analysis';
COMMENT ON COLUMN answer_contracts.quality_requirements IS 'Quality thresholds (relevance, citations, etc.)';
COMMENT ON COLUMN answer_contracts.format_requirements IS 'Format requirements (length, structure, etc.)';
COMMENT ON COLUMN answer_contracts.safety_requirements IS 'Safety requirements (PII, content policy, etc.)';
COMMENT ON COLUMN answer_contracts.on_violation IS 'Action to take on violation: warn, block, fallback, heal';
COMMENT ON COLUMN healing_history.trigger_type IS 'What triggered healing: contract_violation, quality_drop, anomaly, manual';
COMMENT ON COLUMN healing_history.healing_action IS 'Action taken: retry, rerank, expand_context, change_model, fallback';
COMMENT ON FUNCTION get_active_contracts IS 'Get active contracts for evaluation';
COMMENT ON FUNCTION get_healing_effectiveness IS 'Get healing effectiveness metrics';
COMMENT ON FUNCTION get_violation_summary IS 'Get violation statistics';
