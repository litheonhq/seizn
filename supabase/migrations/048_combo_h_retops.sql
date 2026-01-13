-- Seizn Combo H - RetOps (Retrieval Operations Monitoring)
-- Migration: 048_combo_h_retops.sql
--
-- Tables:
-- - retops_metrics: Time-series metrics for retrieval operations
-- - retops_alerts: Alert definitions and history

-- ===========================================
-- 1) RetOps Metrics
-- ===========================================
CREATE TABLE IF NOT EXISTS retops_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Metric identification
  metric_name TEXT NOT NULL,
  -- Examples: retrieval_latency_p95, rerank_latency_p50, error_rate,
  -- cache_hit_rate, embedding_cost, vector_search_qps, etc.

  -- Scope
  collection_id UUID REFERENCES summer_collections(id) ON DELETE SET NULL,
  environment TEXT, -- production, staging, development

  -- Time bucket (for aggregation)
  bucket_start TIMESTAMPTZ NOT NULL,
  bucket_end TIMESTAMPTZ NOT NULL,
  granularity TEXT NOT NULL DEFAULT '1m', -- 1m, 5m, 15m, 1h, 1d

  -- Metric value
  value DOUBLE PRECISION NOT NULL,
  unit TEXT, -- ms, %, count, usd, etc.

  -- Statistical values (for distribution metrics)
  count BIGINT,
  min_value DOUBLE PRECISION,
  max_value DOUBLE PRECISION,
  avg_value DOUBLE PRECISION,
  sum_value DOUBLE PRECISION,
  percentiles JSONB, -- {p50: ..., p90: ..., p95: ..., p99: ...}

  -- Dimensions for grouping
  dimensions JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Example: {"api_key_id": "...", "endpoint": "/search", "model": "voyage-3"}

  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partitioning hint: Consider partitioning by bucket_start for large deployments

CREATE INDEX IF NOT EXISTS idx_retops_metrics_user_name
  ON retops_metrics(user_id, metric_name, bucket_start DESC);

CREATE INDEX IF NOT EXISTS idx_retops_metrics_collection
  ON retops_metrics(collection_id, metric_name, bucket_start DESC)
  WHERE collection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_retops_metrics_bucket
  ON retops_metrics(bucket_start DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_retops_metrics_lookup
  ON retops_metrics(user_id, metric_name, collection_id, bucket_start DESC);

-- ===========================================
-- 2) RetOps Alerts
-- ===========================================
CREATE TABLE IF NOT EXISTS retops_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Alert definition
  name TEXT NOT NULL,
  description TEXT,

  -- Scope
  collection_id UUID REFERENCES summer_collections(id) ON DELETE CASCADE,

  -- What to monitor
  metric_name TEXT NOT NULL,
  dimensions_filter JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Alert condition
  condition_type TEXT NOT NULL, -- threshold, anomaly, trend, rate_of_change
  condition_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Examples:
  -- threshold: {"operator": ">", "value": 1000, "duration": "5m"}
  -- anomaly: {"sensitivity": "high", "baseline_window": "7d"}
  -- trend: {"direction": "increasing", "percentage": 20, "window": "1h"}

  -- Severity: info, warning, critical
  severity TEXT NOT NULL DEFAULT 'warning',

  -- Status: active, disabled, snoozed
  status TEXT NOT NULL DEFAULT 'active',
  snoozed_until TIMESTAMPTZ,

  -- Notification config
  notification_channels JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- Example: [{"type": "email", "address": "..."}, {"type": "slack", "webhook": "..."}]

  cooldown_minutes INT NOT NULL DEFAULT 60, -- Don't re-alert within this window

  -- Stats
  last_triggered_at TIMESTAMPTZ,
  trigger_count INT NOT NULL DEFAULT 0,
  last_resolved_at TIMESTAMPTZ,

  -- Metadata
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retops_alerts_user
  ON retops_alerts(user_id, status);

CREATE INDEX IF NOT EXISTS idx_retops_alerts_collection
  ON retops_alerts(collection_id)
  WHERE collection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_retops_alerts_active
  ON retops_alerts(user_id, status, metric_name)
  WHERE status = 'active';

-- ===========================================
-- 3) Alert History (triggered events)
-- ===========================================
CREATE TABLE IF NOT EXISTS retops_alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  alert_id UUID NOT NULL REFERENCES retops_alerts(id) ON DELETE CASCADE,

  -- Event info
  event_type TEXT NOT NULL, -- triggered, resolved, acknowledged, snoozed

  -- Trigger context
  triggered_value DOUBLE PRECISION,
  threshold_value DOUBLE PRECISION,
  condition_details JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Resolution
  resolved_by TEXT, -- user_id or 'auto'
  resolution_notes TEXT,

  -- Notification status
  notifications_sent JSONB NOT NULL DEFAULT '[]'::JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retops_alert_history_alert
  ON retops_alert_history(alert_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_retops_alert_history_user
  ON retops_alert_history(user_id, created_at DESC);

-- ===========================================
-- 4) RLS Policies
-- ===========================================
ALTER TABLE retops_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE retops_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE retops_alert_history ENABLE ROW LEVEL SECURITY;

-- Metrics
CREATE POLICY "Users can view own retops_metrics"
  ON retops_metrics FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own retops_metrics"
  ON retops_metrics FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

-- Alerts
CREATE POLICY "Users can view own retops_alerts"
  ON retops_alerts FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own retops_alerts"
  ON retops_alerts FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own retops_alerts"
  ON retops_alerts FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can delete own retops_alerts"
  ON retops_alerts FOR DELETE
  USING (auth.uid()::TEXT = user_id);

-- Alert history
CREATE POLICY "Users can view own retops_alert_history"
  ON retops_alert_history FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own retops_alert_history"
  ON retops_alert_history FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

-- ===========================================
-- 5) Helper Functions
-- ===========================================

-- Get metric summary for a time range
CREATE OR REPLACE FUNCTION get_metric_summary(
  p_user_id TEXT,
  p_metric_name TEXT,
  p_collection_id UUID DEFAULT NULL,
  p_start_time TIMESTAMPTZ DEFAULT NOW() - INTERVAL '24 hours',
  p_end_time TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  metric_name TEXT,
  data_points BIGINT,
  min_value DOUBLE PRECISION,
  max_value DOUBLE PRECISION,
  avg_value DOUBLE PRECISION,
  latest_value DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.metric_name,
    COUNT(*)::BIGINT AS data_points,
    MIN(m.value) AS min_value,
    MAX(m.value) AS max_value,
    AVG(m.value) AS avg_value,
    (SELECT m2.value FROM retops_metrics m2
     WHERE m2.user_id = p_user_id
       AND m2.metric_name = p_metric_name
       AND (p_collection_id IS NULL OR m2.collection_id = p_collection_id)
     ORDER BY m2.bucket_start DESC LIMIT 1) AS latest_value
  FROM retops_metrics m
  WHERE m.user_id = p_user_id
    AND m.metric_name = p_metric_name
    AND (p_collection_id IS NULL OR m.collection_id = p_collection_id)
    AND m.bucket_start >= p_start_time
    AND m.bucket_end <= p_end_time
  GROUP BY m.metric_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger an alert
CREATE OR REPLACE FUNCTION trigger_alert(
  p_alert_id UUID,
  p_triggered_value DOUBLE PRECISION,
  p_condition_details JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID AS $$
DECLARE
  v_alert RECORD;
  v_history_id UUID;
BEGIN
  SELECT * INTO v_alert
  FROM retops_alerts
  WHERE id = p_alert_id AND status = 'active';

  IF v_alert IS NULL THEN
    RETURN NULL;
  END IF;

  -- Check cooldown
  IF v_alert.last_triggered_at IS NOT NULL AND
     v_alert.last_triggered_at > NOW() - (v_alert.cooldown_minutes || ' minutes')::INTERVAL THEN
    RETURN NULL;
  END IF;

  -- Create history entry
  INSERT INTO retops_alert_history (
    user_id, alert_id, event_type,
    triggered_value, threshold_value, condition_details
  ) VALUES (
    v_alert.user_id, p_alert_id, 'triggered',
    p_triggered_value,
    (v_alert.condition_config->>'value')::DOUBLE PRECISION,
    p_condition_details
  )
  RETURNING id INTO v_history_id;

  -- Update alert stats
  UPDATE retops_alerts
  SET
    last_triggered_at = NOW(),
    trigger_count = trigger_count + 1,
    updated_at = NOW()
  WHERE id = p_alert_id;

  RETURN v_history_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Resolve an alert
CREATE OR REPLACE FUNCTION resolve_alert(
  p_alert_id UUID,
  p_user_id TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_alert RECORD;
BEGIN
  SELECT * INTO v_alert
  FROM retops_alerts
  WHERE id = p_alert_id AND user_id = p_user_id;

  IF v_alert IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Create resolution history entry
  INSERT INTO retops_alert_history (
    user_id, alert_id, event_type,
    resolved_by, resolution_notes
  ) VALUES (
    p_user_id, p_alert_id, 'resolved',
    p_user_id, p_notes
  );

  -- Update alert
  UPDATE retops_alerts
  SET
    last_resolved_at = NOW(),
    updated_at = NOW()
  WHERE id = p_alert_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Snooze an alert
CREATE OR REPLACE FUNCTION snooze_alert(
  p_alert_id UUID,
  p_user_id TEXT,
  p_duration_minutes INT DEFAULT 60
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE retops_alerts
  SET
    status = 'snoozed',
    snoozed_until = NOW() + (p_duration_minutes || ' minutes')::INTERVAL,
    updated_at = NOW()
  WHERE id = p_alert_id AND user_id = p_user_id;

  INSERT INTO retops_alert_history (
    user_id, alert_id, event_type,
    condition_details
  ) VALUES (
    p_user_id, p_alert_id, 'snoozed',
    jsonb_build_object('duration_minutes', p_duration_minutes)
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup old metrics (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_metrics(
  p_retention_days INT DEFAULT 30,
  p_batch_size INT DEFAULT 10000
)
RETURNS INT AS $$
DECLARE
  v_deleted INT;
BEGIN
  WITH deleted AS (
    DELETE FROM retops_metrics
    WHERE bucket_start < NOW() - (p_retention_days || ' days')::INTERVAL
      AND id IN (
        SELECT id FROM retops_metrics
        WHERE bucket_start < NOW() - (p_retention_days || ' days')::INTERVAL
        LIMIT p_batch_size
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 6) Triggers
-- ===========================================

CREATE OR REPLACE FUNCTION update_retops_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_retops_alerts_updated ON retops_alerts;
CREATE TRIGGER trigger_retops_alerts_updated
  BEFORE UPDATE ON retops_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_retops_alerts_updated_at();

-- Auto-unsnooze alerts
CREATE OR REPLACE FUNCTION unsnooze_expired_alerts()
RETURNS INT AS $$
DECLARE
  v_updated INT;
BEGIN
  WITH updated AS (
    UPDATE retops_alerts
    SET status = 'active', snoozed_until = NULL, updated_at = NOW()
    WHERE status = 'snoozed' AND snoozed_until < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_updated FROM updated;

  RETURN v_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 7) Views
-- ===========================================

CREATE OR REPLACE VIEW retops_metrics_hourly AS
SELECT
  user_id,
  metric_name,
  collection_id,
  DATE_TRUNC('hour', bucket_start) AS hour,
  AVG(value) AS avg_value,
  MIN(value) AS min_value,
  MAX(value) AS max_value,
  COUNT(*) AS sample_count
FROM retops_metrics
GROUP BY user_id, metric_name, collection_id, DATE_TRUNC('hour', bucket_start);

CREATE OR REPLACE VIEW active_alerts_summary AS
SELECT
  user_id,
  COUNT(*) AS total_alerts,
  COUNT(*) FILTER (WHERE severity = 'critical') AS critical_alerts,
  COUNT(*) FILTER (WHERE severity = 'warning') AS warning_alerts,
  COUNT(*) FILTER (WHERE status = 'snoozed') AS snoozed_alerts,
  MAX(last_triggered_at) AS last_triggered
FROM retops_alerts
WHERE status IN ('active', 'snoozed')
GROUP BY user_id;

GRANT SELECT ON retops_metrics_hourly TO authenticated;
GRANT SELECT ON active_alerts_summary TO authenticated;

-- ===========================================
-- 8) Comments
-- ===========================================
COMMENT ON TABLE retops_metrics IS 'Time-series metrics for retrieval operations monitoring';
COMMENT ON TABLE retops_alerts IS 'Alert definitions for monitoring thresholds and anomalies';
COMMENT ON TABLE retops_alert_history IS 'History of alert triggers, resolutions, and snoozes';
COMMENT ON FUNCTION get_metric_summary IS 'Get summary statistics for a metric over a time range';
COMMENT ON FUNCTION trigger_alert IS 'Trigger an alert and create history entry';
COMMENT ON FUNCTION resolve_alert IS 'Resolve an alert';
COMMENT ON FUNCTION snooze_alert IS 'Snooze an alert for a duration';
COMMENT ON FUNCTION cleanup_old_metrics IS 'Remove old metrics based on retention policy';
COMMENT ON FUNCTION unsnooze_expired_alerts IS 'Reactivate alerts that have passed their snooze time';
