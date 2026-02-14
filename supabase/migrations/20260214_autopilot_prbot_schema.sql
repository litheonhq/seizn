-- Seizn Autopilot PR-Bot + Trace Compatibility
-- Migration: 20260214_autopilot_prbot_schema.sql
--
-- Goals:
-- - Provide a compatibility view `flight_recorder_traces` (code expects it; DB uses fall_retrieval_traces).
-- - Add missing tables used by Autopilot PR-bot (configs + webhook inbox).
-- - Extend existing Autopilot tables (045_combo_b_autopilot.sql) with the columns the current API expects.

-- ===========================================
-- 1) Trace compatibility view
-- ===========================================
CREATE OR REPLACE VIEW flight_recorder_traces AS
SELECT *
FROM fall_retrieval_traces;

GRANT SELECT ON flight_recorder_traces TO authenticated;

-- ===========================================
-- 2) Autopilot user config (GitHub token + settings)
-- ===========================================
CREATE TABLE IF NOT EXISTS autopilot_configs (
  user_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  config JSONB NOT NULL DEFAULT '{}'::JSONB,
  github_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE autopilot_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own autopilot_configs"
  ON autopilot_configs FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can upsert own autopilot_configs"
  ON autopilot_configs FOR ALL
  USING (auth.uid()::TEXT = user_id)
  WITH CHECK (auth.uid()::TEXT = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_autopilot_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_autopilot_configs_updated ON autopilot_configs;
CREATE TRIGGER trigger_autopilot_configs_updated
  BEFORE UPDATE ON autopilot_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_autopilot_configs_updated_at();

-- ===========================================
-- 3) Autopilot webhook inbox (GitHub deliveries)
-- ===========================================
CREATE TABLE IF NOT EXISTS autopilot_webhooks (
  id TEXT PRIMARY KEY, -- GitHub delivery id
  event TEXT NOT NULL,
  repository TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Internal-only; authenticated users should not access this table.
ALTER TABLE autopilot_webhooks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_autopilot_webhooks_repo_created
  ON autopilot_webhooks(repository, created_at DESC);

-- ===========================================
-- 4) Extend existing autopilot tables for PR-bot APIs
-- ===========================================

-- autopilot_analyses: add raw analysis JSON + updated_at for caching
ALTER TABLE autopilot_analyses
  ADD COLUMN IF NOT EXISTS analysis JSONB;

ALTER TABLE autopilot_analyses
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_autopilot_analyses_user_trace
  ON autopilot_analyses(user_id, trace_id)
  WHERE trace_id IS NOT NULL;

-- autopilot_fixes: add trace linkage + PR context + applied suggestions + PR link
ALTER TABLE autopilot_fixes
  ADD COLUMN IF NOT EXISTS trace_id UUID REFERENCES fall_retrieval_traces(id) ON DELETE SET NULL;

ALTER TABLE autopilot_fixes
  ADD COLUMN IF NOT EXISTS pr_context JSONB;

ALTER TABLE autopilot_fixes
  ADD COLUMN IF NOT EXISTS applied_suggestions JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE autopilot_fixes
  ADD COLUMN IF NOT EXISTS pr_id UUID REFERENCES autopilot_prs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_autopilot_fixes_user_trace_created
  ON autopilot_fixes(user_id, trace_id, created_at DESC)
  WHERE trace_id IS NOT NULL;

-- autopilot_prs: add trace linkage + GitHub PR fields + context/history blobs
ALTER TABLE autopilot_prs
  ADD COLUMN IF NOT EXISTS trace_id UUID REFERENCES fall_retrieval_traces(id) ON DELETE SET NULL;

ALTER TABLE autopilot_prs
  ADD COLUMN IF NOT EXISTS pr_number INTEGER;

ALTER TABLE autopilot_prs
  ADD COLUMN IF NOT EXISTS pr_url TEXT;

ALTER TABLE autopilot_prs
  ADD COLUMN IF NOT EXISTS context JSONB;

ALTER TABLE autopilot_prs
  ADD COLUMN IF NOT EXISTS history JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE autopilot_prs
  ADD COLUMN IF NOT EXISTS github_response JSONB;

ALTER TABLE autopilot_prs
  ADD COLUMN IF NOT EXISTS error TEXT;

CREATE INDEX IF NOT EXISTS idx_autopilot_prs_user_pr_number
  ON autopilot_prs(user_id, pr_number)
  WHERE pr_number IS NOT NULL;

