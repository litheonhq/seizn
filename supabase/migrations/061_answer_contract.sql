-- ============================================================================
-- Migration: 061_answer_contract.sql
-- Feature: Answer Contract - Grounded Answer Verification
-- Purpose: Ensure every generated answer is grounded in retrieved evidence.
--          If evidence is insufficient, the system should acknowledge
--          uncertainty rather than hallucinate.
-- ============================================================================

-- Answer contract evaluations
CREATE TABLE IF NOT EXISTS answer_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trace_id UUID,

  -- Contract evaluation
  query_text TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  evidence_chunks JSONB NOT NULL,  -- [{chunk_id, text, score}]

  -- Verification results
  is_grounded BOOLEAN,
  grounding_score FLOAT,  -- 0-1
  faithfulness_score FLOAT,  -- 0-1, how faithful to evidence
  coverage_score FLOAT,  -- 0-1, how much of answer is covered

  -- Claims breakdown
  claims JSONB,  -- [{claim, supported, evidence_refs, confidence}]
  unsupported_claims JSONB,  -- Claims without evidence
  contradictions JSONB,  -- Claims that contradict evidence

  -- Verdict
  verdict TEXT CHECK (verdict IN ('pass', 'partial', 'fail', 'abstain')),
  abstain_reason TEXT,  -- Why we chose not to answer

  -- Metadata
  policy_id UUID,
  processing_time_ms INTEGER,
  model_used TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contract policies (configurable thresholds)
CREATE TABLE IF NOT EXISTS contract_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_id UUID,  -- Optional: apply to specific collection
  name TEXT NOT NULL,
  description TEXT,

  -- Thresholds
  min_grounding_score FLOAT DEFAULT 0.7,
  min_faithfulness_score FLOAT DEFAULT 0.8,
  min_coverage_score FLOAT DEFAULT 0.5,
  min_evidence_chunks INTEGER DEFAULT 1,
  max_unsupported_claims INTEGER DEFAULT 0,

  -- Behavior
  on_fail_action TEXT DEFAULT 'abstain' CHECK (on_fail_action IN ('abstain', 'warn', 'pass')),
  abstain_message TEXT DEFAULT 'I cannot answer this question with confidence based on the available information.',
  warn_prefix TEXT DEFAULT '[Low Confidence] ',

  -- Advanced settings
  claim_confidence_threshold FLOAT DEFAULT 0.6,  -- Min confidence for claim extraction
  evidence_relevance_threshold FLOAT DEFAULT 0.5,  -- Min relevance for evidence mapping

  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,  -- Default policy for user
  priority INTEGER DEFAULT 0,  -- Higher priority takes precedence

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contract policy versions (audit trail)
CREATE TABLE IF NOT EXISTS contract_policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES contract_policies(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,

  -- Snapshot of policy at this version
  policy_snapshot JSONB NOT NULL,
  change_summary TEXT,
  changed_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE answer_contracts
  ADD COLUMN IF NOT EXISTS trace_id UUID,
  ADD COLUMN IF NOT EXISTS query_text TEXT,
  ADD COLUMN IF NOT EXISTS answer_text TEXT,
  ADD COLUMN IF NOT EXISTS evidence_chunks JSONB,
  ADD COLUMN IF NOT EXISTS is_grounded BOOLEAN,
  ADD COLUMN IF NOT EXISTS grounding_score FLOAT,
  ADD COLUMN IF NOT EXISTS faithfulness_score FLOAT,
  ADD COLUMN IF NOT EXISTS coverage_score FLOAT,
  ADD COLUMN IF NOT EXISTS claims JSONB,
  ADD COLUMN IF NOT EXISTS unsupported_claims JSONB,
  ADD COLUMN IF NOT EXISTS contradictions JSONB,
  ADD COLUMN IF NOT EXISTS verdict TEXT,
  ADD COLUMN IF NOT EXISTS abstain_reason TEXT,
  ADD COLUMN IF NOT EXISTS policy_id UUID REFERENCES contract_policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS processing_time_ms INTEGER,
  ADD COLUMN IF NOT EXISTS model_used TEXT;

-- ============================================================================
-- Indexes for performance
-- ============================================================================

-- Answer contracts indexes
CREATE INDEX IF NOT EXISTS idx_answer_contracts_user_id ON answer_contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_answer_contracts_trace_id ON answer_contracts(trace_id);
CREATE INDEX IF NOT EXISTS idx_answer_contracts_verdict ON answer_contracts(verdict);
CREATE INDEX IF NOT EXISTS idx_answer_contracts_created_at ON answer_contracts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_answer_contracts_grounding_score ON answer_contracts(grounding_score);
CREATE INDEX IF NOT EXISTS idx_answer_contracts_policy_id ON answer_contracts(policy_id);

-- Contract policies indexes
CREATE INDEX IF NOT EXISTS idx_contract_policies_user_id ON contract_policies(user_id);
CREATE INDEX IF NOT EXISTS idx_contract_policies_collection_id ON contract_policies(collection_id);
CREATE INDEX IF NOT EXISTS idx_contract_policies_is_active ON contract_policies(is_active);
CREATE INDEX IF NOT EXISTS idx_contract_policies_is_default ON contract_policies(is_default);
CREATE INDEX IF NOT EXISTS idx_contract_policies_priority ON contract_policies(priority DESC);

-- Policy versions indexes
CREATE INDEX IF NOT EXISTS idx_policy_versions_policy_id ON contract_policy_versions(policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_versions_version ON contract_policy_versions(policy_id, version_number DESC);

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE answer_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_policy_versions ENABLE ROW LEVEL SECURITY;

-- Answer contracts policies
CREATE POLICY "Users can view their own answer contracts"
  ON answer_contracts FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own answer contracts"
  ON answer_contracts FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own answer contracts"
  ON answer_contracts FOR DELETE
  USING (auth.uid()::text = user_id);

-- Service role bypass
CREATE POLICY "Service role full access to answer_contracts"
  ON answer_contracts FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Contract policies RLS
CREATE POLICY "Users can view their own policies"
  ON contract_policies FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own policies"
  ON contract_policies FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to contract_policies"
  ON contract_policies FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Policy versions RLS
CREATE POLICY "Users can view their policy versions"
  ON contract_policy_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM contract_policies
      WHERE contract_policies.id = contract_policy_versions.policy_id
      AND contract_policies.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to policy versions"
  ON contract_policy_versions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- Functions
-- ============================================================================

-- Get the applicable policy for a user/collection
CREATE OR REPLACE FUNCTION get_applicable_contract_policy(
  p_user_id UUID,
  p_collection_id UUID DEFAULT NULL
)
RETURNS contract_policies AS $$
DECLARE
  v_policy contract_policies;
BEGIN
  -- First try collection-specific policy
  IF p_collection_id IS NOT NULL THEN
    SELECT * INTO v_policy
    FROM contract_policies
    WHERE user_id = p_user_id
      AND collection_id = p_collection_id
      AND is_active = TRUE
    ORDER BY priority DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN v_policy;
    END IF;
  END IF;

  -- Then try default policy
  SELECT * INTO v_policy
  FROM contract_policies
  WHERE user_id = p_user_id
    AND collection_id IS NULL
    AND is_active = TRUE
    AND is_default = TRUE
  ORDER BY priority DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_policy;
  END IF;

  -- Finally, any active policy
  SELECT * INTO v_policy
  FROM contract_policies
  WHERE user_id = p_user_id
    AND is_active = TRUE
  ORDER BY priority DESC
  LIMIT 1;

  RETURN v_policy;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Evaluate verdict based on policy
CREATE OR REPLACE FUNCTION evaluate_contract_verdict(
  p_grounding_score FLOAT,
  p_faithfulness_score FLOAT,
  p_coverage_score FLOAT,
  p_evidence_count INTEGER,
  p_unsupported_count INTEGER,
  p_policy_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_policy contract_policies;
  v_verdict TEXT;
BEGIN
  -- Get policy
  SELECT * INTO v_policy
  FROM contract_policies
  WHERE id = p_policy_id;

  IF NOT FOUND THEN
    -- No policy, use defaults
    IF p_grounding_score >= 0.7 AND p_faithfulness_score >= 0.8 THEN
      RETURN 'pass';
    ELSIF p_grounding_score >= 0.5 OR p_faithfulness_score >= 0.5 THEN
      RETURN 'partial';
    ELSE
      RETURN 'fail';
    END IF;
  END IF;

  -- Evaluate against policy thresholds
  IF p_evidence_count < v_policy.min_evidence_chunks THEN
    RETURN 'abstain';
  END IF;

  IF p_unsupported_count > v_policy.max_unsupported_claims THEN
    RETURN 'fail';
  END IF;

  IF p_grounding_score >= v_policy.min_grounding_score
     AND p_faithfulness_score >= v_policy.min_faithfulness_score
     AND p_coverage_score >= v_policy.min_coverage_score THEN
    RETURN 'pass';
  ELSIF p_grounding_score >= v_policy.min_grounding_score * 0.7
     OR p_faithfulness_score >= v_policy.min_faithfulness_score * 0.7 THEN
    RETURN 'partial';
  ELSE
    RETURN 'fail';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get contract statistics for a user
CREATE OR REPLACE FUNCTION get_contract_stats(
  p_user_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS JSON AS $$
DECLARE
  v_stats JSON;
BEGIN
  SELECT json_build_object(
    'total_evaluations', COUNT(*),
    'pass_count', COUNT(*) FILTER (WHERE verdict = 'pass'),
    'partial_count', COUNT(*) FILTER (WHERE verdict = 'partial'),
    'fail_count', COUNT(*) FILTER (WHERE verdict = 'fail'),
    'abstain_count', COUNT(*) FILTER (WHERE verdict = 'abstain'),
    'avg_grounding_score', ROUND(AVG(grounding_score)::numeric, 3),
    'avg_faithfulness_score', ROUND(AVG(faithfulness_score)::numeric, 3),
    'avg_coverage_score', ROUND(AVG(coverage_score)::numeric, 3),
    'pass_rate', ROUND(
      (COUNT(*) FILTER (WHERE verdict = 'pass')::float / NULLIF(COUNT(*), 0) * 100)::numeric, 1
    ),
    'avg_processing_time_ms', ROUND(AVG(processing_time_ms)::numeric, 0)
  ) INTO v_stats
  FROM answer_contracts
  WHERE user_id = p_user_id
    AND created_at >= NOW() - (p_days || ' days')::interval;

  RETURN v_stats;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Auto-update updated_at for policies
CREATE OR REPLACE FUNCTION update_contract_policy_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_contract_policy_timestamp
  BEFORE UPDATE ON contract_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_contract_policy_timestamp();

-- Create policy version on update
CREATE OR REPLACE FUNCTION create_policy_version()
RETURNS TRIGGER AS $$
DECLARE
  v_version_number INTEGER;
BEGIN
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_version_number
  FROM contract_policy_versions
  WHERE policy_id = OLD.id;

  -- Insert version record
  INSERT INTO contract_policy_versions (
    policy_id,
    version_number,
    policy_snapshot,
    change_summary,
    changed_by
  ) VALUES (
    OLD.id,
    v_version_number,
    row_to_json(OLD),
    'Policy updated',
    auth.uid()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_create_policy_version
  AFTER UPDATE ON contract_policies
  FOR EACH ROW
  EXECUTE FUNCTION create_policy_version();

-- ============================================================================
-- Default policy setup function
-- ============================================================================

CREATE OR REPLACE FUNCTION setup_default_contract_policy(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_policy_id UUID;
BEGIN
  INSERT INTO contract_policies (
    user_id,
    name,
    description,
    is_default
  ) VALUES (
    p_user_id,
    'Default Policy',
    'Automatically created default answer contract policy',
    TRUE
  )
  RETURNING id INTO v_policy_id;

  RETURN v_policy_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE answer_contracts IS 'Stores answer verification results for grounding analysis';
COMMENT ON TABLE contract_policies IS 'Configurable policies for answer contract verification';
COMMENT ON TABLE contract_policy_versions IS 'Audit trail of policy changes';

COMMENT ON COLUMN answer_contracts.grounding_score IS 'Overall score (0-1) indicating how well the answer is grounded in evidence';
COMMENT ON COLUMN answer_contracts.faithfulness_score IS 'Score (0-1) measuring how faithful the answer is to the evidence';
COMMENT ON COLUMN answer_contracts.coverage_score IS 'Score (0-1) measuring what portion of the answer is covered by evidence';
COMMENT ON COLUMN answer_contracts.verdict IS 'Final verdict: pass (fully grounded), partial (some grounding), fail (not grounded), abstain (insufficient evidence)';

COMMENT ON COLUMN contract_policies.on_fail_action IS 'Action when verification fails: abstain (return uncertainty message), warn (prefix with warning), pass (allow through)';
