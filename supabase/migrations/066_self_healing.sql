-- ============================================
-- Self-Healing Index - Migration #66
-- ============================================
-- Automatic detection and repair of index issues:
-- - Stale embeddings
-- - Orphaned chunks
-- - Index drift
-- - Missing embeddings
-- ============================================

-- ============================================
-- 1. Index Health Status Table
-- ============================================

CREATE TABLE IF NOT EXISTS index_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

  -- Health metrics
  total_chunks INTEGER DEFAULT 0,
  healthy_chunks INTEGER DEFAULT 0,
  stale_chunks INTEGER DEFAULT 0,
  orphaned_chunks INTEGER DEFAULT 0,
  missing_embeddings INTEGER DEFAULT 0,
  corrupted_chunks INTEGER DEFAULT 0,

  -- Computed scores (0-1 scale)
  health_score FLOAT CHECK (health_score >= 0 AND health_score <= 1),
  freshness_score FLOAT CHECK (freshness_score >= 0 AND freshness_score <= 1),
  consistency_score FLOAT CHECK (consistency_score >= 0 AND consistency_score <= 1),
  coverage_score FLOAT CHECK (coverage_score >= 0 AND coverage_score <= 1),

  -- Status
  status TEXT DEFAULT 'unknown' CHECK (status IN ('healthy', 'warning', 'degraded', 'critical', 'unknown')),

  -- Last check info
  last_checked_at TIMESTAMPTZ,
  check_duration_ms INTEGER,
  check_error TEXT,

  -- History tracking
  previous_health_score FLOAT,
  score_trend TEXT CHECK (score_trend IN ('improving', 'stable', 'degrading')),

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint per collection
  UNIQUE(collection_id)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_health_collection ON index_health(collection_id);
CREATE INDEX IF NOT EXISTS idx_health_user ON index_health(user_id);
CREATE INDEX IF NOT EXISTS idx_health_status ON index_health(status);
CREATE INDEX IF NOT EXISTS idx_health_score ON index_health(health_score);
CREATE INDEX IF NOT EXISTS idx_health_last_checked ON index_health(last_checked_at);

-- ============================================
-- 2. Healing Jobs Table
-- ============================================

CREATE TABLE IF NOT EXISTS healing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

  -- Job configuration
  job_type TEXT NOT NULL CHECK (job_type IN ('full_scan', 'incremental', 'targeted', 'emergency')),
  target_issues TEXT[] DEFAULT '{}',  -- ['stale', 'orphaned', 'missing', 'corrupted']
  priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),

  -- Progress tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  progress_percent FLOAT DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),

  -- Scan metrics
  chunks_scanned INTEGER DEFAULT 0,
  chunks_healed INTEGER DEFAULT 0,
  chunks_failed INTEGER DEFAULT 0,
  chunks_skipped INTEGER DEFAULT 0,

  -- Results
  issues_found JSONB DEFAULT '{}',
  actions_taken JSONB DEFAULT '[]',
  errors JSONB DEFAULT '[]',

  -- Execution details
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  estimated_duration_ms INTEGER,
  actual_duration_ms INTEGER,

  -- Worker info
  worker_id TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  -- Trigger info
  triggered_by TEXT DEFAULT 'manual' CHECK (triggered_by IN ('manual', 'scheduled', 'rule', 'alert', 'system')),
  trigger_rule_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for job queries
CREATE INDEX IF NOT EXISTS idx_jobs_collection ON healing_jobs(collection_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON healing_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON healing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON healing_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON healing_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled ON healing_jobs(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_jobs_running ON healing_jobs(started_at) WHERE status = 'running';

-- ============================================
-- 3. Healing Rules Table
-- ============================================

CREATE TABLE IF NOT EXISTS healing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  collection_id UUID,  -- NULL = applies to all collections

  -- Rule configuration
  name TEXT NOT NULL,
  description TEXT,

  -- Trigger conditions (JSON expression)
  trigger_condition TEXT NOT NULL,  -- e.g., 'health_score < 0.8', 'stale_chunks > 100'
  trigger_operator TEXT DEFAULT 'AND' CHECK (trigger_operator IN ('AND', 'OR')),
  conditions JSONB DEFAULT '[]',  -- Array of condition objects

  -- Action configuration
  action TEXT NOT NULL CHECK (action IN ('reembed', 'delete', 'flag', 'notify', 'reindex', 'quarantine')),
  action_params JSONB DEFAULT '{}',

  -- Notification settings
  notify_email BOOLEAN DEFAULT FALSE,
  notify_webhook BOOLEAN DEFAULT FALSE,
  webhook_url TEXT,

  -- Schedule configuration
  auto_execute BOOLEAN DEFAULT FALSE,
  schedule_cron TEXT,  -- Cron expression: '0 0 * * 0' for weekly
  last_executed_at TIMESTAMPTZ,
  next_execution_at TIMESTAMPTZ,

  -- Limits and safety
  max_chunks_per_run INTEGER DEFAULT 1000,
  cooldown_minutes INTEGER DEFAULT 60,
  require_approval BOOLEAN DEFAULT FALSE,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  execution_count INTEGER DEFAULT 0,
  last_error TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for rule queries
CREATE INDEX IF NOT EXISTS idx_rules_user ON healing_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_rules_collection ON healing_rules(collection_id);
CREATE INDEX IF NOT EXISTS idx_rules_active ON healing_rules(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_rules_next_exec ON healing_rules(next_execution_at) WHERE auto_execute = TRUE;

-- ============================================
-- 4. Healing Actions Log Table
-- ============================================

CREATE TABLE IF NOT EXISTS healing_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES healing_jobs(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES healing_rules(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL,

  -- Action details
  action_type TEXT NOT NULL CHECK (action_type IN ('reembed', 'delete', 'flag', 'reindex', 'quarantine', 'restore', 'update_metadata')),
  chunk_ids TEXT[] NOT NULL DEFAULT '{}',
  chunk_count INTEGER DEFAULT 0,

  -- Issue context
  issue_type TEXT NOT NULL CHECK (issue_type IN ('stale', 'orphaned', 'missing_embedding', 'corrupted', 'inconsistent', 'low_quality')),
  issue_severity TEXT CHECK (issue_severity IN ('low', 'medium', 'high', 'critical')),

  -- Execution result
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'partial', 'failed', 'rolled_back')),
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,

  -- Details
  details JSONB DEFAULT '{}',
  error_message TEXT,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Rollback support
  can_rollback BOOLEAN DEFAULT FALSE,
  rollback_data JSONB,
  rolled_back_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for action queries
CREATE INDEX IF NOT EXISTS idx_healing_actions_job ON healing_actions(job_id);
CREATE INDEX IF NOT EXISTS idx_healing_actions_user ON healing_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_healing_actions_collection ON healing_actions(collection_id);
CREATE INDEX IF NOT EXISTS idx_healing_actions_type ON healing_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_healing_actions_status ON healing_actions(status);
CREATE INDEX IF NOT EXISTS idx_healing_actions_created ON healing_actions(created_at DESC);

-- ============================================
-- 5. Issue Detection Queue
-- ============================================

CREATE TABLE IF NOT EXISTS healing_issue_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Issue details
  chunk_id UUID NOT NULL,
  document_id UUID,
  issue_type TEXT NOT NULL CHECK (issue_type IN ('stale', 'orphaned', 'missing_embedding', 'corrupted', 'inconsistent', 'low_quality')),
  issue_severity TEXT DEFAULT 'medium' CHECK (issue_severity IN ('low', 'medium', 'high', 'critical')),

  -- Detection info
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  detector_type TEXT DEFAULT 'scanner' CHECK (detector_type IN ('scanner', 'realtime', 'user_report', 'system')),

  -- Resolution status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'resolved', 'ignored', 'failed')),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT CHECK (resolved_by IN ('auto', 'manual', 'rule')),
  resolution_job_id UUID REFERENCES healing_jobs(id),

  -- Details
  details JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for issue queue
CREATE INDEX IF NOT EXISTS idx_issue_queue_collection ON healing_issue_queue(collection_id);
CREATE INDEX IF NOT EXISTS idx_issue_queue_status ON healing_issue_queue(status);
CREATE INDEX IF NOT EXISTS idx_issue_queue_type ON healing_issue_queue(issue_type);
CREATE INDEX IF NOT EXISTS idx_issue_queue_severity ON healing_issue_queue(issue_severity);
CREATE INDEX IF NOT EXISTS idx_issue_queue_pending ON healing_issue_queue(detected_at) WHERE status = 'pending';

-- ============================================
-- 6. Healing Configuration Table
-- ============================================

CREATE TABLE IF NOT EXISTS healing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  collection_id UUID,  -- NULL = default config

  -- Auto-healing settings
  auto_healing_enabled BOOLEAN DEFAULT TRUE,
  auto_scan_enabled BOOLEAN DEFAULT TRUE,
  scan_interval_hours INTEGER DEFAULT 24,

  -- Thresholds
  stale_threshold_days INTEGER DEFAULT 30,
  health_alert_threshold FLOAT DEFAULT 0.7,
  critical_alert_threshold FLOAT DEFAULT 0.5,

  -- Limits
  max_concurrent_jobs INTEGER DEFAULT 2,
  max_chunks_per_scan INTEGER DEFAULT 10000,
  batch_size INTEGER DEFAULT 100,

  -- Notifications
  email_alerts BOOLEAN DEFAULT FALSE,
  webhook_alerts BOOLEAN DEFAULT FALSE,
  webhook_url TEXT,

  -- Rate limiting
  reembed_rate_limit INTEGER DEFAULT 100,  -- per minute
  delete_requires_approval BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, collection_id)
);

-- ============================================
-- 7. Enable Row Level Security
-- ============================================

ALTER TABLE index_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE healing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE healing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE healing_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE healing_issue_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE healing_config ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 8. RLS Policies
-- ============================================

-- index_health policies
CREATE POLICY "Users own health" ON index_health
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to health" ON index_health
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- healing_jobs policies
CREATE POLICY "Users own jobs" ON healing_jobs
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to jobs" ON healing_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- healing_rules policies
CREATE POLICY "Users own rules" ON healing_rules
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to rules" ON healing_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- healing_actions policies
CREATE POLICY "Users own actions" ON healing_actions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to actions" ON healing_actions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- healing_issue_queue policies
CREATE POLICY "Users own issues" ON healing_issue_queue
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to issues" ON healing_issue_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- healing_config policies
CREATE POLICY "Users own config" ON healing_config
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to config" ON healing_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================
-- 9. Helper Functions
-- ============================================

-- Calculate health score from metrics
CREATE OR REPLACE FUNCTION calculate_health_score(
  p_total_chunks INTEGER,
  p_healthy_chunks INTEGER,
  p_stale_chunks INTEGER,
  p_orphaned_chunks INTEGER,
  p_missing_embeddings INTEGER
) RETURNS FLOAT AS $$
DECLARE
  v_health_score FLOAT;
  v_healthy_ratio FLOAT;
  v_stale_penalty FLOAT;
  v_orphan_penalty FLOAT;
  v_missing_penalty FLOAT;
BEGIN
  IF p_total_chunks = 0 THEN
    RETURN 1.0;
  END IF;

  -- Base score from healthy chunks
  v_healthy_ratio := p_healthy_chunks::FLOAT / p_total_chunks::FLOAT;

  -- Apply penalties for issues (weighted by severity)
  v_stale_penalty := (p_stale_chunks::FLOAT / p_total_chunks::FLOAT) * 0.3;
  v_orphan_penalty := (p_orphaned_chunks::FLOAT / p_total_chunks::FLOAT) * 0.5;
  v_missing_penalty := (p_missing_embeddings::FLOAT / p_total_chunks::FLOAT) * 0.8;

  -- Calculate final score
  v_health_score := v_healthy_ratio - v_stale_penalty - v_orphan_penalty - v_missing_penalty;

  -- Clamp to 0-1 range
  RETURN GREATEST(0.0, LEAST(1.0, v_health_score));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Determine status from health score
CREATE OR REPLACE FUNCTION get_health_status(p_health_score FLOAT) RETURNS TEXT AS $$
BEGIN
  IF p_health_score >= 0.9 THEN
    RETURN 'healthy';
  ELSIF p_health_score >= 0.7 THEN
    RETURN 'warning';
  ELSIF p_health_score >= 0.5 THEN
    RETURN 'degraded';
  ELSE
    RETURN 'critical';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update health record with new metrics
CREATE OR REPLACE FUNCTION update_index_health(
  p_collection_id UUID,
  p_user_id UUID,
  p_total_chunks INTEGER,
  p_healthy_chunks INTEGER,
  p_stale_chunks INTEGER,
  p_orphaned_chunks INTEGER,
  p_missing_embeddings INTEGER,
  p_corrupted_chunks INTEGER DEFAULT 0,
  p_check_duration_ms INTEGER DEFAULT NULL
) RETURNS index_health AS $$
DECLARE
  v_health_score FLOAT;
  v_freshness_score FLOAT;
  v_consistency_score FLOAT;
  v_status TEXT;
  v_previous_score FLOAT;
  v_trend TEXT;
  v_result index_health;
BEGIN
  -- Calculate scores
  v_health_score := calculate_health_score(
    p_total_chunks, p_healthy_chunks, p_stale_chunks, p_orphaned_chunks, p_missing_embeddings
  );

  v_freshness_score := CASE
    WHEN p_total_chunks = 0 THEN 1.0
    ELSE (p_total_chunks - p_stale_chunks)::FLOAT / p_total_chunks::FLOAT
  END;

  v_consistency_score := CASE
    WHEN p_total_chunks = 0 THEN 1.0
    ELSE (p_total_chunks - p_corrupted_chunks - p_missing_embeddings)::FLOAT / p_total_chunks::FLOAT
  END;

  v_status := get_health_status(v_health_score);

  -- Get previous score for trend calculation
  SELECT health_score INTO v_previous_score
  FROM index_health
  WHERE collection_id = p_collection_id;

  -- Calculate trend
  IF v_previous_score IS NULL THEN
    v_trend := 'stable';
  ELSIF v_health_score > v_previous_score + 0.05 THEN
    v_trend := 'improving';
  ELSIF v_health_score < v_previous_score - 0.05 THEN
    v_trend := 'degrading';
  ELSE
    v_trend := 'stable';
  END IF;

  -- Upsert health record
  INSERT INTO index_health (
    collection_id, user_id, total_chunks, healthy_chunks, stale_chunks,
    orphaned_chunks, missing_embeddings, corrupted_chunks,
    health_score, freshness_score, consistency_score, coverage_score,
    status, last_checked_at, check_duration_ms,
    previous_health_score, score_trend, updated_at
  ) VALUES (
    p_collection_id, p_user_id, p_total_chunks, p_healthy_chunks, p_stale_chunks,
    p_orphaned_chunks, p_missing_embeddings, p_corrupted_chunks,
    v_health_score, v_freshness_score, v_consistency_score,
    CASE WHEN p_total_chunks = 0 THEN 1.0 ELSE 1.0 END,
    v_status, NOW(), p_check_duration_ms,
    v_previous_score, v_trend, NOW()
  )
  ON CONFLICT (collection_id) DO UPDATE SET
    total_chunks = EXCLUDED.total_chunks,
    healthy_chunks = EXCLUDED.healthy_chunks,
    stale_chunks = EXCLUDED.stale_chunks,
    orphaned_chunks = EXCLUDED.orphaned_chunks,
    missing_embeddings = EXCLUDED.missing_embeddings,
    corrupted_chunks = EXCLUDED.corrupted_chunks,
    health_score = EXCLUDED.health_score,
    freshness_score = EXCLUDED.freshness_score,
    consistency_score = EXCLUDED.consistency_score,
    coverage_score = EXCLUDED.coverage_score,
    status = EXCLUDED.status,
    last_checked_at = EXCLUDED.last_checked_at,
    check_duration_ms = EXCLUDED.check_duration_ms,
    previous_health_score = index_health.health_score,
    score_trend = EXCLUDED.score_trend,
    updated_at = NOW()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 10. Triggers
-- ============================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_healing_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_index_health_timestamp
  BEFORE UPDATE ON index_health
  FOR EACH ROW EXECUTE FUNCTION update_healing_timestamp();

CREATE TRIGGER update_healing_rules_timestamp
  BEFORE UPDATE ON healing_rules
  FOR EACH ROW EXECUTE FUNCTION update_healing_timestamp();

CREATE TRIGGER update_healing_config_timestamp
  BEFORE UPDATE ON healing_config
  FOR EACH ROW EXECUTE FUNCTION update_healing_timestamp();

-- ============================================
-- 11. Comments
-- ============================================

COMMENT ON TABLE index_health IS 'Stores health metrics for each collection index';
COMMENT ON TABLE healing_jobs IS 'Tracks healing job execution and progress';
COMMENT ON TABLE healing_rules IS 'User-defined rules for automatic healing';
COMMENT ON TABLE healing_actions IS 'Log of individual healing actions taken';
COMMENT ON TABLE healing_issue_queue IS 'Queue of detected issues pending resolution';
COMMENT ON TABLE healing_config IS 'User/collection configuration for self-healing';

COMMENT ON FUNCTION calculate_health_score IS 'Calculates overall health score from chunk metrics';
COMMENT ON FUNCTION get_health_status IS 'Determines status label from health score';
COMMENT ON FUNCTION update_index_health IS 'Updates health record with new scan results';
