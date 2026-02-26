-- Auto-Eval System Migration
-- Implements automatic evaluation on policy/model changes
-- Part of SSDF (Secure Software Development Framework) compliance

-- ============================================
-- Trigger Events Table
-- ============================================

CREATE TABLE IF NOT EXISTS auto_eval_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN (
    'policy_version_created',
    'policy_version_published',
    'policy_installed',
    'policy_updated',
    'policy_activated',
    'policy_deactivated',
    'firewall_pattern_added',
    'firewall_config_changed',
    'model_config_changed'
  )),
  source TEXT NOT NULL CHECK (source IN (
    'policy_pack',
    'opa_policy',
    'firewall',
    'model_config'
  )),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for trigger processing
CREATE INDEX IF NOT EXISTS idx_auto_eval_triggers_pending
  ON auto_eval_triggers (processed, created_at)
  WHERE processed = false;

CREATE INDEX IF NOT EXISTS idx_auto_eval_triggers_org
  ON auto_eval_triggers (organization_id, created_at DESC);

-- ============================================
-- Evaluation Runs Table
-- ============================================

CREATE TABLE IF NOT EXISTS auto_eval_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id UUID REFERENCES auto_eval_triggers(id) ON DELETE SET NULL,
  trigger_type TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'running',
    'completed',
    'failed',
    'skipped'
  )),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  summary JSONB, -- EvalRunSummary
  results JSONB DEFAULT '[]', -- EvalTestResult[]
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for run queries
CREATE INDEX IF NOT EXISTS idx_auto_eval_runs_org
  ON auto_eval_runs (organization_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_auto_eval_runs_status
  ON auto_eval_runs (status, started_at)
  WHERE status IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS idx_auto_eval_runs_trigger
  ON auto_eval_runs (trigger_id);

-- ============================================
-- Configuration Table
-- ============================================

CREATE TABLE IF NOT EXISTS auto_eval_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pack_id UUID REFERENCES policy_packs(id) ON DELETE CASCADE,

  -- Trigger settings
  eval_on_publish BOOLEAN DEFAULT true,
  eval_on_install BOOLEAN DEFAULT true,
  eval_on_update BOOLEAN DEFAULT true,
  eval_on_activation BOOLEAN DEFAULT true,

  -- Test suites
  run_security_tests BOOLEAN DEFAULT true,
  run_regression_tests BOOLEAN DEFAULT true,
  run_compliance_tests BOOLEAN DEFAULT false,
  run_performance_tests BOOLEAN DEFAULT false,

  -- Thresholds
  block_on_critical BOOLEAN DEFAULT true,
  block_on_high BOOLEAN DEFAULT false,
  regression_threshold NUMERIC(4,3) DEFAULT 0.05,

  -- Notifications
  slack_webhook_url TEXT,
  email_recipients TEXT[] DEFAULT '{}',
  notify_on_success BOOLEAN DEFAULT false,
  notify_on_failure BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Unique constraint: one config per org/pack combination
  UNIQUE(organization_id, pack_id)
);

-- Index for config lookups
CREATE INDEX IF NOT EXISTS idx_auto_eval_configs_org
  ON auto_eval_configs (organization_id);

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE auto_eval_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_eval_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_eval_configs ENABLE ROW LEVEL SECURITY;

-- Triggers: Org members can view, admins can create
CREATE POLICY "auto_eval_triggers_select" ON auto_eval_triggers
  FOR SELECT USING (
    organization_id IS NULL
    OR organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()::TEXT
    )
  );

CREATE POLICY "auto_eval_triggers_insert" ON auto_eval_triggers
  FOR INSERT WITH CHECK (
    organization_id IS NULL
    OR organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()::TEXT
      AND role IN ('owner', 'admin')
    )
  );

-- Runs: Org members can view
CREATE POLICY "auto_eval_runs_select" ON auto_eval_runs
  FOR SELECT USING (
    organization_id IS NULL
    OR organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()::TEXT
    )
  );

CREATE POLICY "auto_eval_runs_insert" ON auto_eval_runs
  FOR INSERT WITH CHECK (
    organization_id IS NULL
    OR organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()::TEXT
    )
  );

CREATE POLICY "auto_eval_runs_update" ON auto_eval_runs
  FOR UPDATE USING (
    organization_id IS NULL
    OR organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()::TEXT
    )
  );

-- Configs: Org admins can manage
CREATE POLICY "auto_eval_configs_select" ON auto_eval_configs
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()::TEXT
    )
  );

CREATE POLICY "auto_eval_configs_insert" ON auto_eval_configs
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()::TEXT
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "auto_eval_configs_update" ON auto_eval_configs
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()::TEXT
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "auto_eval_configs_delete" ON auto_eval_configs
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()::TEXT
      AND role IN ('owner', 'admin')
    )
  );

-- ============================================
-- Service Role Access (for cron/background jobs)
-- ============================================

CREATE POLICY "auto_eval_triggers_service" ON auto_eval_triggers
  FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

CREATE POLICY "auto_eval_runs_service" ON auto_eval_runs
  FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

CREATE POLICY "auto_eval_configs_service" ON auto_eval_configs
  FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

-- ============================================
-- Helper Functions
-- ============================================

-- Function to get pending triggers count
CREATE OR REPLACE FUNCTION get_pending_eval_triggers_count()
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM auto_eval_triggers
    WHERE processed = false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old triggers (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_eval_triggers()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM auto_eval_triggers
  WHERE processed = true
    AND created_at < now() - INTERVAL '30 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old eval runs (older than 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_eval_runs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM auto_eval_runs
  WHERE status IN ('completed', 'failed', 'skipped')
    AND created_at < now() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Trigger for updated_at on configs
-- ============================================

CREATE OR REPLACE FUNCTION update_auto_eval_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_eval_configs_updated_at
  BEFORE UPDATE ON auto_eval_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_auto_eval_config_updated_at();

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE auto_eval_triggers IS 'Events that trigger automatic evaluation runs';
COMMENT ON TABLE auto_eval_runs IS 'Records of automatic evaluation executions';
COMMENT ON TABLE auto_eval_configs IS 'Organization-level auto-eval configuration';

COMMENT ON COLUMN auto_eval_triggers.type IS 'Type of event that triggered evaluation';
COMMENT ON COLUMN auto_eval_triggers.source IS 'Source system that generated the event';
COMMENT ON COLUMN auto_eval_triggers.processed IS 'Whether this trigger has been processed';

COMMENT ON COLUMN auto_eval_runs.summary IS 'Aggregated results summary (passed, failed, etc.)';
COMMENT ON COLUMN auto_eval_runs.results IS 'Detailed test results array';

COMMENT ON COLUMN auto_eval_configs.regression_threshold IS 'Percentage threshold for regression detection (0.05 = 5%)';
COMMENT ON COLUMN auto_eval_configs.block_on_critical IS 'Block deployment if critical issues found';
