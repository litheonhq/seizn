-- ============================================
-- Dead Letter Queue (DLQ) - Migration
-- ============================================
-- Captures failed jobs after max retries for:
-- - Manual inspection and debugging
-- - Retry capability
-- - Monitoring and alerting
-- ============================================

-- ============================================
-- 1. Dead Letter Queue Table
-- ============================================

CREATE TABLE IF NOT EXISTS healing_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Original job reference
  original_job_id UUID NOT NULL,
  collection_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

  -- Original job data (preserved for replay)
  job_type TEXT NOT NULL CHECK (job_type IN ('full_scan', 'incremental', 'targeted', 'emergency')),
  target_issues TEXT[] DEFAULT '{}',
  priority INTEGER DEFAULT 5,

  -- Failure information
  failure_reason TEXT NOT NULL,
  failure_code TEXT,  -- Error code for categorization
  failure_details JSONB DEFAULT '{}',  -- Stack trace, context, etc.

  -- Retry tracking
  original_retry_count INTEGER DEFAULT 0,
  dlq_retry_count INTEGER DEFAULT 0,
  max_dlq_retries INTEGER DEFAULT 3,
  last_retry_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'retrying', 'resolved', 'archived', 'discarded')),
  resolution_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,

  -- Original job metrics (for context)
  chunks_scanned INTEGER DEFAULT 0,
  chunks_healed INTEGER DEFAULT 0,
  chunks_failed INTEGER DEFAULT 0,
  issues_found JSONB DEFAULT '{}',
  actions_taken JSONB DEFAULT '[]',
  errors JSONB DEFAULT '[]',

  -- Original timing
  original_scheduled_at TIMESTAMPTZ,
  original_started_at TIMESTAMPTZ,
  original_failed_at TIMESTAMPTZ,
  original_duration_ms INTEGER,

  -- Trigger info
  triggered_by TEXT DEFAULT 'system' CHECK (triggered_by IN ('manual', 'scheduled', 'rule', 'alert', 'system')),
  trigger_rule_id UUID,

  -- Alert tracking
  alert_sent BOOLEAN DEFAULT FALSE,
  alert_sent_at TIMESTAMPTZ,
  alert_acknowledged BOOLEAN DEFAULT FALSE,
  alert_acknowledged_at TIMESTAMPTZ,
  alert_acknowledged_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient DLQ queries
CREATE INDEX idx_dlq_user ON healing_dlq(user_id);
CREATE INDEX idx_dlq_collection ON healing_dlq(collection_id);
CREATE INDEX idx_dlq_status ON healing_dlq(status);
CREATE INDEX idx_dlq_failure_code ON healing_dlq(failure_code);
CREATE INDEX idx_dlq_created ON healing_dlq(created_at DESC);
CREATE INDEX idx_dlq_pending ON healing_dlq(created_at) WHERE status = 'pending';
CREATE INDEX idx_dlq_unacknowledged ON healing_dlq(created_at) WHERE alert_sent = TRUE AND alert_acknowledged = FALSE;
CREATE INDEX idx_dlq_next_retry ON healing_dlq(next_retry_at) WHERE status = 'pending' AND next_retry_at IS NOT NULL;

-- ============================================
-- 2. DLQ Statistics View
-- ============================================

-- Fixed: Use CTEs to avoid nested aggregate function error
CREATE OR REPLACE VIEW dlq_statistics AS
WITH failure_code_counts AS (
  SELECT
    user_id,
    COALESCE(failure_code, 'unknown') AS failure_code,
    COUNT(*) AS cnt
  FROM healing_dlq
  WHERE status = 'pending'
  GROUP BY user_id, COALESCE(failure_code, 'unknown')
),
failure_code_agg AS (
  SELECT
    user_id,
    jsonb_object_agg(failure_code, cnt) AS pending_by_failure_code
  FROM failure_code_counts
  GROUP BY user_id
)
SELECT
  d.user_id,
  COUNT(*) FILTER (WHERE d.status = 'pending') AS pending_count,
  COUNT(*) FILTER (WHERE d.status = 'retrying') AS retrying_count,
  COUNT(*) FILTER (WHERE d.status = 'resolved') AS resolved_count,
  COUNT(*) FILTER (WHERE d.status = 'archived') AS archived_count,
  COUNT(*) FILTER (WHERE d.status = 'discarded') AS discarded_count,
  COUNT(*) AS total_count,
  COUNT(*) FILTER (WHERE d.alert_sent = TRUE AND d.alert_acknowledged = FALSE) AS unacknowledged_alerts,
  MIN(d.created_at) FILTER (WHERE d.status = 'pending') AS oldest_pending_at,
  MAX(d.created_at) AS newest_entry_at,
  COALESCE(f.pending_by_failure_code, '{}'::jsonb) AS pending_by_failure_code
FROM healing_dlq d
LEFT JOIN failure_code_agg f ON f.user_id = d.user_id
GROUP BY d.user_id, f.pending_by_failure_code;

-- ============================================
-- 3. Enable Row Level Security
-- ============================================

ALTER TABLE healing_dlq ENABLE ROW LEVEL SECURITY;

-- User can access their own DLQ entries
CREATE POLICY "Users own dlq" ON healing_dlq
  FOR ALL USING (auth.uid() = user_id);

-- Service role full access
CREATE POLICY "Service role full access to dlq" ON healing_dlq
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================
-- 4. Helper Functions
-- ============================================

-- Move failed job to DLQ
CREATE OR REPLACE FUNCTION move_job_to_dlq(
  p_job_id UUID,
  p_failure_reason TEXT,
  p_failure_code TEXT DEFAULT NULL,
  p_failure_details JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_job healing_jobs;
  v_dlq_id UUID;
BEGIN
  -- Get the failed job
  SELECT * INTO v_job
  FROM healing_jobs
  WHERE id = p_job_id AND status = 'failed';

  IF v_job IS NULL THEN
    RAISE EXCEPTION 'Job not found or not in failed state: %', p_job_id;
  END IF;

  -- Check if already in DLQ
  IF EXISTS (SELECT 1 FROM healing_dlq WHERE original_job_id = p_job_id) THEN
    -- Update existing DLQ entry
    UPDATE healing_dlq
    SET
      failure_reason = p_failure_reason,
      failure_code = p_failure_code,
      failure_details = p_failure_details,
      updated_at = NOW()
    WHERE original_job_id = p_job_id
    RETURNING id INTO v_dlq_id;

    RETURN v_dlq_id;
  END IF;

  -- Insert into DLQ
  INSERT INTO healing_dlq (
    original_job_id,
    collection_id,
    user_id,
    org_id,
    job_type,
    target_issues,
    priority,
    failure_reason,
    failure_code,
    failure_details,
    original_retry_count,
    chunks_scanned,
    chunks_healed,
    chunks_failed,
    issues_found,
    actions_taken,
    errors,
    original_scheduled_at,
    original_started_at,
    original_failed_at,
    original_duration_ms,
    triggered_by,
    trigger_rule_id
  ) VALUES (
    v_job.id,
    v_job.collection_id,
    v_job.user_id,
    v_job.org_id,
    v_job.job_type,
    v_job.target_issues,
    v_job.priority,
    p_failure_reason,
    p_failure_code,
    p_failure_details,
    v_job.retry_count,
    v_job.chunks_scanned,
    v_job.chunks_healed,
    v_job.chunks_failed,
    v_job.issues_found,
    v_job.actions_taken,
    v_job.errors,
    v_job.scheduled_at,
    v_job.started_at,
    v_job.completed_at,
    v_job.actual_duration_ms,
    v_job.triggered_by,
    v_job.trigger_rule_id
  ) RETURNING id INTO v_dlq_id;

  RETURN v_dlq_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Retry a DLQ entry (creates new job)
CREATE OR REPLACE FUNCTION retry_dlq_entry(
  p_dlq_id UUID,
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  v_dlq healing_dlq;
  v_new_job_id UUID;
BEGIN
  -- Get the DLQ entry
  SELECT * INTO v_dlq
  FROM healing_dlq
  WHERE id = p_dlq_id AND user_id = p_user_id AND status = 'pending';

  IF v_dlq IS NULL THEN
    RAISE EXCEPTION 'DLQ entry not found or not retryable: %', p_dlq_id;
  END IF;

  -- Check retry limit
  IF v_dlq.dlq_retry_count >= v_dlq.max_dlq_retries THEN
    RAISE EXCEPTION 'DLQ entry has exceeded max retries: %', p_dlq_id;
  END IF;

  -- Update DLQ status
  UPDATE healing_dlq
  SET
    status = 'retrying',
    dlq_retry_count = dlq_retry_count + 1,
    last_retry_at = NOW(),
    updated_at = NOW()
  WHERE id = p_dlq_id;

  -- Create new job
  INSERT INTO healing_jobs (
    collection_id,
    user_id,
    org_id,
    job_type,
    target_issues,
    priority,
    status,
    triggered_by,
    trigger_rule_id,
    retry_count,
    max_retries
  ) VALUES (
    v_dlq.collection_id,
    v_dlq.user_id,
    v_dlq.org_id,
    v_dlq.job_type,
    v_dlq.target_issues,
    v_dlq.priority,
    'queued',
    'manual',
    v_dlq.trigger_rule_id,
    0,
    3
  ) RETURNING id INTO v_new_job_id;

  RETURN v_new_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark DLQ entry as resolved
CREATE OR REPLACE FUNCTION resolve_dlq_entry(
  p_dlq_id UUID,
  p_user_id UUID,
  p_resolution_notes TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'resolved'
) RETURNS VOID AS $$
BEGIN
  IF p_status NOT IN ('resolved', 'archived', 'discarded') THEN
    RAISE EXCEPTION 'Invalid resolution status: %', p_status;
  END IF;

  UPDATE healing_dlq
  SET
    status = p_status,
    resolution_notes = p_resolution_notes,
    resolved_by = p_user_id,
    resolved_at = NOW(),
    updated_at = NOW()
  WHERE id = p_dlq_id AND user_id = p_user_id AND status IN ('pending', 'retrying');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DLQ entry not found or already resolved: %', p_dlq_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Acknowledge DLQ alert
CREATE OR REPLACE FUNCTION acknowledge_dlq_alert(
  p_dlq_id UUID,
  p_user_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE healing_dlq
  SET
    alert_acknowledged = TRUE,
    alert_acknowledged_at = NOW(),
    alert_acknowledged_by = p_user_id,
    updated_at = NOW()
  WHERE id = p_dlq_id AND user_id = p_user_id AND alert_sent = TRUE AND alert_acknowledged = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DLQ entry not found or already acknowledged: %', p_dlq_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get DLQ statistics for a user
CREATE OR REPLACE FUNCTION get_dlq_stats(p_user_id UUID)
RETURNS TABLE (
  pending_count BIGINT,
  retrying_count BIGINT,
  resolved_count BIGINT,
  archived_count BIGINT,
  discarded_count BIGINT,
  total_count BIGINT,
  unacknowledged_alerts BIGINT,
  oldest_pending_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'retrying'),
    COUNT(*) FILTER (WHERE status = 'resolved'),
    COUNT(*) FILTER (WHERE status = 'archived'),
    COUNT(*) FILTER (WHERE status = 'discarded'),
    COUNT(*),
    COUNT(*) FILTER (WHERE alert_sent = TRUE AND alert_acknowledged = FALSE),
    MIN(created_at) FILTER (WHERE status = 'pending')
  FROM healing_dlq
  WHERE healing_dlq.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================
-- 5. Triggers
-- ============================================

-- Update timestamp trigger
CREATE TRIGGER update_healing_dlq_timestamp
  BEFORE UPDATE ON healing_dlq
  FOR EACH ROW EXECUTE FUNCTION update_healing_timestamp();

-- ============================================
-- 6. Comments
-- ============================================

COMMENT ON TABLE healing_dlq IS 'Dead Letter Queue for failed healing jobs after max retries';
COMMENT ON FUNCTION move_job_to_dlq IS 'Moves a failed job to the DLQ with failure details';
COMMENT ON FUNCTION retry_dlq_entry IS 'Retries a DLQ entry by creating a new job';
COMMENT ON FUNCTION resolve_dlq_entry IS 'Marks a DLQ entry as resolved/archived/discarded';
COMMENT ON FUNCTION acknowledge_dlq_alert IS 'Acknowledges an alert for a DLQ entry';
COMMENT ON FUNCTION get_dlq_stats IS 'Returns DLQ statistics for a user';
