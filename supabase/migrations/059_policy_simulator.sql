-- Migration: Policy Simulator
-- Description: Tables for what-if policy testing against historical queries
-- Created: 2026-01-13

-- ============================================
-- Policy Definitions Table
-- ============================================
-- Stores policy rules in YAML/JSON format for simulation

CREATE TABLE IF NOT EXISTS policy_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,

  -- Policy rules in YAML/JSON format
  policy_yaml TEXT,  -- Original YAML for display/editing
  policy_json JSONB NOT NULL,  -- Parsed rules for execution

  -- Policy type
  policy_type TEXT NOT NULL CHECK (policy_type IN (
    'pii_masking', 'access_control', 'ttl', 'scope', 'content_filter'
  )),

  -- Versioning
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT FALSE,
  is_draft BOOLEAN DEFAULT TRUE,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Policy Simulations Table
-- ============================================
-- Records simulation runs comparing policies

CREATE TABLE IF NOT EXISTS policy_simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Policies being tested
  base_policy_id UUID REFERENCES policy_definitions(id) ON DELETE SET NULL,
  test_policy_id UUID REFERENCES policy_definitions(id) ON DELETE SET NULL,

  -- Test configuration
  test_queries JSONB,  -- Query IDs or inline queries to test
  regression_set_id UUID,  -- Optional: use regression test set

  -- Results summary
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  total_queries INTEGER DEFAULT 0,
  affected_queries INTEGER DEFAULT 0,
  blocked_chunks_count INTEGER DEFAULT 0,
  unblocked_chunks_count INTEGER DEFAULT 0,

  -- Detailed results summary
  results JSONB,  -- Per-query impact summary

  -- Error tracking
  error_message TEXT,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Simulation Results Table
-- ============================================
-- Detailed per-query results for each simulation

CREATE TABLE IF NOT EXISTS simulation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id UUID NOT NULL REFERENCES policy_simulations(id) ON DELETE CASCADE,
  query_id TEXT,  -- Reference to original query (if from traces)
  query_text TEXT,  -- The actual query text

  -- Base policy results
  base_chunks JSONB,  -- Chunks returned with base policy
  base_blocked JSONB,  -- Chunks blocked by base policy

  -- Test policy results
  test_chunks JSONB,  -- Chunks returned with test policy
  test_blocked JSONB,  -- Chunks blocked by test policy

  -- Diff analysis
  newly_blocked JSONB,  -- Chunks blocked by test but not base
  newly_allowed JSONB,  -- Chunks allowed by test but not base
  masking_changed JSONB,  -- Chunks where masking differs
  impact_score FLOAT,  -- 0-1 score of how much results changed

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================

-- Policy definitions indexes
CREATE INDEX IF NOT EXISTS idx_policy_definitions_user_id
  ON policy_definitions(user_id);
CREATE INDEX IF NOT EXISTS idx_policy_definitions_type
  ON policy_definitions(policy_type);
CREATE INDEX IF NOT EXISTS idx_policy_definitions_active
  ON policy_definitions(user_id, is_active) WHERE is_active = true;

-- Policy simulations indexes
CREATE INDEX IF NOT EXISTS idx_policy_simulations_user_id
  ON policy_simulations(user_id);
CREATE INDEX IF NOT EXISTS idx_policy_simulations_status
  ON policy_simulations(status);
CREATE INDEX IF NOT EXISTS idx_policy_simulations_base_policy
  ON policy_simulations(base_policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_simulations_test_policy
  ON policy_simulations(test_policy_id);

-- Simulation results indexes
CREATE INDEX IF NOT EXISTS idx_simulation_results_simulation_id
  ON simulation_results(simulation_id);
CREATE INDEX IF NOT EXISTS idx_simulation_results_impact
  ON simulation_results(simulation_id, impact_score DESC);

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE policy_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_results ENABLE ROW LEVEL SECURITY;

-- Policy definitions RLS
CREATE POLICY "Users can manage their own policies" ON policy_definitions
  FOR ALL USING (auth.uid() = user_id);

-- Policy simulations RLS
CREATE POLICY "Users can manage their own simulations" ON policy_simulations
  FOR ALL USING (auth.uid() = user_id);

-- Simulation results RLS (access through simulation ownership)
CREATE POLICY "Results belong to simulation owners" ON simulation_results
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM policy_simulations
      WHERE id = simulation_id AND user_id = auth.uid()
    )
  );

-- ============================================
-- Triggers for updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_policy_definitions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER policy_definitions_updated_at
  BEFORE UPDATE ON policy_definitions
  FOR EACH ROW
  EXECUTE FUNCTION update_policy_definitions_updated_at();

-- ============================================
-- Helper Functions
-- ============================================

-- Function to get the active policy for a user and type
CREATE OR REPLACE FUNCTION get_active_policy(
  p_user_id UUID,
  p_policy_type TEXT
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  policy_json JSONB,
  version INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pd.id,
    pd.name,
    pd.policy_json,
    pd.version
  FROM policy_definitions pd
  WHERE pd.user_id = p_user_id
    AND pd.policy_type = p_policy_type
    AND pd.is_active = true
  ORDER BY pd.updated_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to activate a policy (deactivating others of same type)
CREATE OR REPLACE FUNCTION activate_policy(
  p_policy_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_policy_type TEXT;
BEGIN
  -- Get policy info
  SELECT user_id, policy_type INTO v_user_id, v_policy_type
  FROM policy_definitions
  WHERE id = p_policy_id;

  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Deactivate other policies of same type
  UPDATE policy_definitions
  SET is_active = FALSE
  WHERE user_id = v_user_id
    AND policy_type = v_policy_type
    AND id != p_policy_id;

  -- Activate the target policy
  UPDATE policy_definitions
  SET is_active = TRUE, is_draft = FALSE
  WHERE id = p_policy_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clone a policy (for creating test variants)
CREATE OR REPLACE FUNCTION clone_policy(
  p_policy_id UUID,
  p_new_name TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_new_id UUID;
  v_base_name TEXT;
BEGIN
  -- Get base name if new name not provided
  IF p_new_name IS NULL THEN
    SELECT name INTO v_base_name FROM policy_definitions WHERE id = p_policy_id;
    p_new_name := v_base_name || ' (Copy)';
  END IF;

  INSERT INTO policy_definitions (
    user_id,
    name,
    description,
    policy_yaml,
    policy_json,
    policy_type,
    version,
    is_active,
    is_draft
  )
  SELECT
    user_id,
    p_new_name,
    description,
    policy_yaml,
    policy_json,
    policy_type,
    1,  -- Reset version
    FALSE,  -- Not active
    TRUE  -- Mark as draft
  FROM policy_definitions
  WHERE id = p_policy_id
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE policy_definitions IS 'Stores policy rules for simulation and enforcement';
COMMENT ON TABLE policy_simulations IS 'Records of policy simulation runs';
COMMENT ON TABLE simulation_results IS 'Per-query detailed results of policy simulations';

COMMENT ON COLUMN policy_definitions.policy_yaml IS 'Human-readable YAML policy definition';
COMMENT ON COLUMN policy_definitions.policy_json IS 'Parsed JSON rules for execution';
COMMENT ON COLUMN policy_definitions.policy_type IS 'Type: pii_masking, access_control, ttl, scope, content_filter';
COMMENT ON COLUMN policy_simulations.impact_score IS 'Aggregate score 0-1 indicating overall policy impact';
COMMENT ON COLUMN simulation_results.newly_blocked IS 'Chunks that would be blocked by test policy but not base';
COMMENT ON COLUMN simulation_results.newly_allowed IS 'Chunks that would be allowed by test policy but blocked by base';
