-- Seizn Combo B - Autopilot (AI-Powered Auto-Fix System)
-- Migration: 045_combo_b_autopilot.sql
--
-- Tables:
-- - autopilot_analyses: Stores analysis results from autopilot
-- - autopilot_fixes: Proposed fixes from analysis
-- - autopilot_prs: Pull requests created by autopilot

-- ===========================================
-- 1) Autopilot Analyses
-- ===========================================
CREATE TABLE IF NOT EXISTS autopilot_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Analysis context
  collection_id UUID REFERENCES summer_collections(id) ON DELETE SET NULL,
  trace_id UUID REFERENCES fall_retrieval_traces(id) ON DELETE SET NULL,

  -- Analysis type: retrieval_quality, embedding_drift, config_optimization, etc.
  analysis_type TEXT NOT NULL,

  -- Status: pending, running, completed, failed
  status TEXT NOT NULL DEFAULT 'pending',

  -- Input data for analysis
  input_data JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Analysis results
  findings JSONB NOT NULL DEFAULT '[]'::JSONB,
  recommendations JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- Metrics
  confidence_score FLOAT,
  severity TEXT, -- low, medium, high, critical

  -- Error info
  error TEXT,

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_autopilot_analyses_user
  ON autopilot_analyses(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_autopilot_analyses_status
  ON autopilot_analyses(user_id, status);

CREATE INDEX IF NOT EXISTS idx_autopilot_analyses_collection
  ON autopilot_analyses(collection_id, created_at DESC)
  WHERE collection_id IS NOT NULL;

-- ===========================================
-- 2) Autopilot Fixes
-- ===========================================
CREATE TABLE IF NOT EXISTS autopilot_fixes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  analysis_id UUID NOT NULL REFERENCES autopilot_analyses(id) ON DELETE CASCADE,

  -- Fix type: config_change, reindex, chunk_update, etc.
  fix_type TEXT NOT NULL,

  -- Status: proposed, approved, applied, rejected, rolled_back
  status TEXT NOT NULL DEFAULT 'proposed',

  -- What to fix
  target_type TEXT NOT NULL, -- collection, document, chunk, config
  target_id UUID,

  -- Fix details
  description TEXT,
  before_state JSONB,
  after_state JSONB,
  changes JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Impact estimation
  estimated_impact JSONB,

  -- Approval workflow
  auto_approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,

  -- Application tracking
  applied_at TIMESTAMPTZ,
  applied_by TEXT, -- 'system' or user_id

  -- Rollback info
  is_rollback_available BOOLEAN NOT NULL DEFAULT TRUE,
  rolled_back_at TIMESTAMPTZ,
  rollback_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_autopilot_fixes_user
  ON autopilot_fixes(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_autopilot_fixes_analysis
  ON autopilot_fixes(analysis_id);

CREATE INDEX IF NOT EXISTS idx_autopilot_fixes_status
  ON autopilot_fixes(user_id, status);

CREATE INDEX IF NOT EXISTS idx_autopilot_fixes_pending
  ON autopilot_fixes(user_id, status, created_at DESC)
  WHERE status = 'proposed';

-- ===========================================
-- 3) Autopilot PRs (for code/config changes)
-- ===========================================
CREATE TABLE IF NOT EXISTS autopilot_prs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Related entities
  analysis_id UUID REFERENCES autopilot_analyses(id) ON DELETE SET NULL,
  fix_id UUID REFERENCES autopilot_fixes(id) ON DELETE SET NULL,

  -- PR type: config_update, schema_migration, etc.
  pr_type TEXT NOT NULL,

  -- Status: draft, open, merged, closed
  status TEXT NOT NULL DEFAULT 'draft',

  -- PR details
  title TEXT NOT NULL,
  description TEXT,

  -- Files changed
  files_changed JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- External PR info (if synced with GitHub/GitLab)
  external_provider TEXT, -- github, gitlab
  external_pr_id TEXT,
  external_pr_url TEXT,

  -- Review tracking
  review_status TEXT, -- pending, approved, changes_requested
  reviewed_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,

  -- Merge info
  merged_at TIMESTAMPTZ,
  merged_by TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_autopilot_prs_user
  ON autopilot_prs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_autopilot_prs_status
  ON autopilot_prs(user_id, status);

CREATE INDEX IF NOT EXISTS idx_autopilot_prs_external
  ON autopilot_prs(external_provider, external_pr_id)
  WHERE external_pr_id IS NOT NULL;

-- ===========================================
-- 4) RLS Policies
-- ===========================================
ALTER TABLE autopilot_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE autopilot_fixes ENABLE ROW LEVEL SECURITY;
ALTER TABLE autopilot_prs ENABLE ROW LEVEL SECURITY;

-- Analyses
CREATE POLICY "Users can view own autopilot_analyses"
  ON autopilot_analyses FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own autopilot_analyses"
  ON autopilot_analyses FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own autopilot_analyses"
  ON autopilot_analyses FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

-- Fixes
CREATE POLICY "Users can view own autopilot_fixes"
  ON autopilot_fixes FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own autopilot_fixes"
  ON autopilot_fixes FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own autopilot_fixes"
  ON autopilot_fixes FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

-- PRs
CREATE POLICY "Users can view own autopilot_prs"
  ON autopilot_prs FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own autopilot_prs"
  ON autopilot_prs FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own autopilot_prs"
  ON autopilot_prs FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

-- ===========================================
-- 5) Helper Functions
-- ===========================================

-- Get pending fixes count
CREATE OR REPLACE FUNCTION get_pending_autopilot_fixes_count(p_user_id TEXT)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM autopilot_fixes
  WHERE user_id = p_user_id
    AND status = 'proposed';
$$ LANGUAGE sql SECURITY DEFINER;

-- Apply a fix
CREATE OR REPLACE FUNCTION apply_autopilot_fix(
  p_fix_id UUID,
  p_user_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_fix RECORD;
BEGIN
  -- Get the fix
  SELECT * INTO v_fix
  FROM autopilot_fixes
  WHERE id = p_fix_id AND user_id = p_user_id;

  IF v_fix IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_fix.status != 'proposed' AND v_fix.status != 'approved' THEN
    RETURN FALSE;
  END IF;

  -- Update status
  UPDATE autopilot_fixes
  SET
    status = 'applied',
    applied_at = NOW(),
    applied_by = p_user_id,
    updated_at = NOW()
  WHERE id = p_fix_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Rollback a fix
CREATE OR REPLACE FUNCTION rollback_autopilot_fix(
  p_fix_id UUID,
  p_user_id TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_fix RECORD;
BEGIN
  SELECT * INTO v_fix
  FROM autopilot_fixes
  WHERE id = p_fix_id AND user_id = p_user_id;

  IF v_fix IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_fix.status != 'applied' OR NOT v_fix.is_rollback_available THEN
    RETURN FALSE;
  END IF;

  UPDATE autopilot_fixes
  SET
    status = 'rolled_back',
    rolled_back_at = NOW(),
    rollback_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_fix_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 6) Triggers
-- ===========================================

CREATE OR REPLACE FUNCTION update_autopilot_fixes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_autopilot_fixes_updated ON autopilot_fixes;
CREATE TRIGGER trigger_autopilot_fixes_updated
  BEFORE UPDATE ON autopilot_fixes
  FOR EACH ROW
  EXECUTE FUNCTION update_autopilot_fixes_updated_at();

CREATE OR REPLACE FUNCTION update_autopilot_prs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_autopilot_prs_updated ON autopilot_prs;
CREATE TRIGGER trigger_autopilot_prs_updated
  BEFORE UPDATE ON autopilot_prs
  FOR EACH ROW
  EXECUTE FUNCTION update_autopilot_prs_updated_at();

-- ===========================================
-- 7) Comments
-- ===========================================
COMMENT ON TABLE autopilot_analyses IS 'Autopilot analysis results for automatic system optimization';
COMMENT ON TABLE autopilot_fixes IS 'Proposed and applied fixes from autopilot analyses';
COMMENT ON TABLE autopilot_prs IS 'Pull requests created by autopilot for config/code changes';
COMMENT ON FUNCTION get_pending_autopilot_fixes_count IS 'Get count of pending autopilot fixes for a user';
COMMENT ON FUNCTION apply_autopilot_fix IS 'Apply an autopilot fix';
COMMENT ON FUNCTION rollback_autopilot_fix IS 'Rollback a previously applied autopilot fix';
