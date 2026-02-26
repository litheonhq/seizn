-- Seizn Phase B1 - Auto-PR Fixer
-- Migration: 20260114_001_auto_pr_fixer.sql
--
-- Tables:
-- - auto_pr_records: PR creation and tracking records
-- - auto_pr_analyses: Code analysis results
--
-- This feature enables AI-powered code analysis and automatic PR generation
-- for fixing identified issues in user repositories.

-- ===========================================
-- 1) Auto-PR Analyses (Analysis Results)
-- ===========================================
CREATE TABLE IF NOT EXISTS auto_pr_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Related entities
  trace_id UUID REFERENCES fall_retrieval_traces(id) ON DELETE SET NULL,
  collection_id UUID REFERENCES summer_collections(id) ON DELETE SET NULL,

  -- Analysis status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'analyzing', 'completed', 'failed')),

  -- Analysis results
  issues JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- Example:
  -- [
  --   {"type": "bug", "severity": "high", "file": "src/api.ts", "line": 42, "message": "..."},
  --   {"type": "performance", "severity": "medium", "file": "src/utils.ts", "line": 15, "message": "..."}
  -- ]

  suggestions JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- Example:
  -- [
  --   {"file": "src/api.ts", "line": 42, "original": "...", "replacement": "...", "reason": "..."},
  --   ...
  -- ]

  summary JSONB,
  -- Example:
  -- {"total_issues": 5, "critical": 1, "high": 2, "medium": 2, "auto_fixable": 4}

  -- Error info (if failed)
  error TEXT,
  error_details JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_auto_pr_analyses_user
  ON auto_pr_analyses(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auto_pr_analyses_status
  ON auto_pr_analyses(user_id, status)
  WHERE status IN ('pending', 'analyzing');

CREATE INDEX IF NOT EXISTS idx_auto_pr_analyses_trace
  ON auto_pr_analyses(trace_id)
  WHERE trace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_auto_pr_analyses_collection
  ON auto_pr_analyses(collection_id, created_at DESC)
  WHERE collection_id IS NOT NULL;

-- ===========================================
-- 2) Auto-PR Records
-- ===========================================
CREATE TABLE IF NOT EXISTS auto_pr_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Related analysis
  analysis_id UUID REFERENCES auto_pr_analyses(id) ON DELETE SET NULL,

  -- GitHub PR info
  pr_number INTEGER,
  pr_url TEXT,

  -- Repository info
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,

  -- Branch info
  head_branch TEXT NOT NULL,
  base_branch TEXT NOT NULL,

  -- PR content
  title TEXT NOT NULL,
  body TEXT,

  -- PR status
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft', 'open', 'merged', 'closed', 'superseded')),

  -- Files and suggestions applied
  files_changed JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- Example:
  -- [
  --   {"path": "src/api.ts", "additions": 10, "deletions": 5, "patch": "..."},
  --   ...
  -- ]

  suggestions_applied JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- Subset of suggestions from analysis that were applied

  -- Additional metadata
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Example:
  -- {"commit_sha": "abc123", "workflow_run_id": "...", "labels": ["auto-fix"]}

  -- Review tracking
  review_status TEXT,
  reviewed_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,

  -- Merge info
  merged_at TIMESTAMPTZ,
  merged_by TEXT,
  merge_commit_sha TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_auto_pr_records_user
  ON auto_pr_records(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auto_pr_records_analysis
  ON auto_pr_records(analysis_id)
  WHERE analysis_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_auto_pr_records_repo
  ON auto_pr_records(repo_owner, repo_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auto_pr_records_status
  ON auto_pr_records(user_id, status)
  WHERE status IN ('draft', 'open');

CREATE INDEX IF NOT EXISTS idx_auto_pr_records_pr
  ON auto_pr_records(repo_owner, repo_name, pr_number)
  WHERE pr_number IS NOT NULL;

-- ===========================================
-- 3) RLS Policies
-- ===========================================
ALTER TABLE auto_pr_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_pr_records ENABLE ROW LEVEL SECURITY;

-- Analyses policies
CREATE POLICY "Users can view own auto_pr_analyses"
  ON auto_pr_analyses FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own auto_pr_analyses"
  ON auto_pr_analyses FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own auto_pr_analyses"
  ON auto_pr_analyses FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can delete own auto_pr_analyses"
  ON auto_pr_analyses FOR DELETE
  USING (auth.uid()::TEXT = user_id);

-- Records policies
CREATE POLICY "Users can view own auto_pr_records"
  ON auto_pr_records FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own auto_pr_records"
  ON auto_pr_records FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own auto_pr_records"
  ON auto_pr_records FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can delete own auto_pr_records"
  ON auto_pr_records FOR DELETE
  USING (auth.uid()::TEXT = user_id);

-- ===========================================
-- 4) Helper Functions
-- ===========================================

-- Start a new analysis
CREATE OR REPLACE FUNCTION start_auto_pr_analysis(
  p_user_id TEXT,
  p_trace_id UUID DEFAULT NULL,
  p_collection_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_analysis_id UUID;
BEGIN
  INSERT INTO auto_pr_analyses (user_id, trace_id, collection_id, status)
  VALUES (p_user_id, p_trace_id, p_collection_id, 'analyzing')
  RETURNING id INTO v_analysis_id;

  RETURN v_analysis_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Complete an analysis
CREATE OR REPLACE FUNCTION complete_auto_pr_analysis(
  p_analysis_id UUID,
  p_user_id TEXT,
  p_issues JSONB,
  p_suggestions JSONB,
  p_summary JSONB
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE auto_pr_analyses
  SET
    status = 'completed',
    issues = p_issues,
    suggestions = p_suggestions,
    summary = p_summary,
    completed_at = NOW()
  WHERE id = p_analysis_id AND user_id = p_user_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fail an analysis
CREATE OR REPLACE FUNCTION fail_auto_pr_analysis(
  p_analysis_id UUID,
  p_user_id TEXT,
  p_error TEXT,
  p_error_details JSONB DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE auto_pr_analyses
  SET
    status = 'failed',
    error = p_error,
    error_details = p_error_details,
    completed_at = NOW()
  WHERE id = p_analysis_id AND user_id = p_user_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get pending analyses count
CREATE OR REPLACE FUNCTION get_pending_auto_pr_analyses_count(p_user_id TEXT)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM auto_pr_analyses
  WHERE user_id = p_user_id
    AND status IN ('pending', 'analyzing');
$$ LANGUAGE sql SECURITY DEFINER;

-- Get open PRs count
CREATE OR REPLACE FUNCTION get_open_auto_pr_count(p_user_id TEXT)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM auto_pr_records
  WHERE user_id = p_user_id
    AND status IN ('draft', 'open');
$$ LANGUAGE sql SECURITY DEFINER;

-- Mark PR as merged
CREATE OR REPLACE FUNCTION mark_auto_pr_merged(
  p_record_id UUID,
  p_user_id TEXT,
  p_merged_by TEXT DEFAULT NULL,
  p_merge_commit_sha TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE auto_pr_records
  SET
    status = 'merged',
    merged_at = NOW(),
    merged_by = COALESCE(p_merged_by, p_user_id),
    merge_commit_sha = p_merge_commit_sha,
    updated_at = NOW()
  WHERE id = p_record_id AND user_id = p_user_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get analysis statistics
CREATE OR REPLACE FUNCTION get_auto_pr_stats(
  p_user_id TEXT,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  total_analyses BIGINT,
  completed_analyses BIGINT,
  failed_analyses BIGINT,
  total_prs BIGINT,
  merged_prs BIGINT,
  total_issues_found BIGINT,
  total_suggestions_applied BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM auto_pr_analyses
     WHERE user_id = p_user_id
       AND created_at > NOW() - (p_days || ' days')::INTERVAL)::BIGINT AS total_analyses,

    (SELECT COUNT(*) FROM auto_pr_analyses
     WHERE user_id = p_user_id
       AND status = 'completed'
       AND created_at > NOW() - (p_days || ' days')::INTERVAL)::BIGINT AS completed_analyses,

    (SELECT COUNT(*) FROM auto_pr_analyses
     WHERE user_id = p_user_id
       AND status = 'failed'
       AND created_at > NOW() - (p_days || ' days')::INTERVAL)::BIGINT AS failed_analyses,

    (SELECT COUNT(*) FROM auto_pr_records
     WHERE user_id = p_user_id
       AND created_at > NOW() - (p_days || ' days')::INTERVAL)::BIGINT AS total_prs,

    (SELECT COUNT(*) FROM auto_pr_records
     WHERE user_id = p_user_id
       AND status = 'merged'
       AND created_at > NOW() - (p_days || ' days')::INTERVAL)::BIGINT AS merged_prs,

    (SELECT COALESCE(SUM(jsonb_array_length(issues)), 0) FROM auto_pr_analyses
     WHERE user_id = p_user_id
       AND status = 'completed'
       AND created_at > NOW() - (p_days || ' days')::INTERVAL)::BIGINT AS total_issues_found,

    (SELECT COALESCE(SUM(jsonb_array_length(suggestions_applied)), 0) FROM auto_pr_records
     WHERE user_id = p_user_id
       AND created_at > NOW() - (p_days || ' days')::INTERVAL)::BIGINT AS total_suggestions_applied;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 5) Triggers
-- ===========================================

-- Updated_at trigger for auto_pr_records
CREATE OR REPLACE FUNCTION update_auto_pr_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_pr_records_updated ON auto_pr_records;
CREATE TRIGGER trigger_auto_pr_records_updated
  BEFORE UPDATE ON auto_pr_records
  FOR EACH ROW
  EXECUTE FUNCTION update_auto_pr_records_updated_at();

-- ===========================================
-- 6) Views
-- ===========================================

-- Recent analyses with PR info
CREATE OR REPLACE VIEW auto_pr_analyses_summary AS
SELECT
  a.id AS analysis_id,
  a.user_id,
  a.status AS analysis_status,
  a.summary,
  jsonb_array_length(a.issues) AS issues_count,
  jsonb_array_length(a.suggestions) AS suggestions_count,
  a.created_at AS analysis_created_at,
  a.completed_at AS analysis_completed_at,
  r.id AS pr_id,
  r.pr_number,
  r.pr_url,
  r.status AS pr_status,
  r.repo_owner || '/' || r.repo_name AS repo_full_name
FROM auto_pr_analyses a
LEFT JOIN auto_pr_records r ON r.analysis_id = a.id;

GRANT SELECT ON auto_pr_analyses_summary TO authenticated;

-- ===========================================
-- 7) Comments
-- ===========================================
COMMENT ON TABLE auto_pr_analyses IS 'AI-powered code analysis results for auto-PR generation';
COMMENT ON TABLE auto_pr_records IS 'Automatically generated pull request records';
COMMENT ON COLUMN auto_pr_analyses.issues IS 'Array of identified issues from code analysis';
COMMENT ON COLUMN auto_pr_analyses.suggestions IS 'Array of suggested fixes for identified issues';
COMMENT ON COLUMN auto_pr_records.files_changed IS 'Array of files modified in the PR';
COMMENT ON COLUMN auto_pr_records.suggestions_applied IS 'Subset of analysis suggestions that were applied';
COMMENT ON FUNCTION start_auto_pr_analysis IS 'Start a new auto-PR analysis';
COMMENT ON FUNCTION complete_auto_pr_analysis IS 'Mark an analysis as completed with results';
COMMENT ON FUNCTION fail_auto_pr_analysis IS 'Mark an analysis as failed with error info';
COMMENT ON FUNCTION get_auto_pr_stats IS 'Get auto-PR statistics for a user';
