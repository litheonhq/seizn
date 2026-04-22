-- ============================================
-- Control Tower - Database Schema
-- Epic D: Control Tower UI
-- ============================================

-- Alert Rules Table
CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  condition JSONB NOT NULL,
  notification_channels TEXT[] DEFAULT '{}',
  silence_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Alerts Table (active and historical alerts)
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  status TEXT NOT NULL CHECK (status IN ('firing', 'resolved', 'acknowledged', 'silenced')),
  source TEXT NOT NULL,
  labels JSONB DEFAULT '{}',
  annotations JSONB DEFAULT '{}',
  fingerprint TEXT NOT NULL,
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notification Channels Table
CREATE TABLE IF NOT EXISTS notification_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('email', 'slack', 'webhook', 'pagerduty', 'telegram')),
  config JSONB NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Feature Flags Table
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  rollout_percentage INTEGER NOT NULL DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  target_users UUID[] DEFAULT '{}',
  target_organizations UUID[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rate Limit Configurations Table
CREATE TABLE IF NOT EXISTS rate_limit_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  endpoint TEXT,
  method TEXT,
  limit_count INTEGER NOT NULL,
  window_seconds INTEGER NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'user', 'organization', 'api_key')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- System Metrics Table (time-series data)
CREATE TABLE IF NOT EXISTS system_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name TEXT NOT NULL,
  metric_value DOUBLE PRECISION NOT NULL,
  labels JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Service Health History Table
CREATE TABLE IF NOT EXISTS service_health_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
  latency_ms INTEGER,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Control Tower Dashboards Table
CREATE TABLE IF NOT EXISTS control_tower_dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  widgets JSONB NOT NULL DEFAULT '[]',
  refresh_interval_seconds INTEGER NOT NULL DEFAULT 60,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_alerts_user_status ON alerts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_fingerprint ON alerts(fingerprint);

CREATE INDEX IF NOT EXISTS idx_alert_rules_user ON alert_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled);

CREATE INDEX IF NOT EXISTS idx_notification_channels_user ON notification_channels(user_id);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags(key);
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags(enabled);

CREATE INDEX IF NOT EXISTS idx_system_metrics_name_time ON system_metrics(metric_name, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_metrics_recorded_at ON system_metrics(recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_health_name_time ON service_health_history(service_name, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_control_tower_dashboards_user ON control_tower_dashboards(user_id);

-- ============================================
-- RLS Policies
-- ============================================

ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_health_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_tower_dashboards ENABLE ROW LEVEL SECURITY;

-- Alert Rules Policies
CREATE POLICY alert_rules_select ON alert_rules FOR SELECT
  USING (auth.uid() = user_id OR org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text
  ));

CREATE POLICY alert_rules_insert ON alert_rules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY alert_rules_update ON alert_rules FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY alert_rules_delete ON alert_rules FOR DELETE
  USING (auth.uid() = user_id);

-- Alerts Policies
CREATE POLICY alerts_select ON alerts FOR SELECT
  USING (auth.uid() = user_id OR org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text
  ));

CREATE POLICY alerts_insert ON alerts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY alerts_update ON alerts FOR UPDATE
  USING (auth.uid() = user_id OR org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('admin', 'owner')
  ));

-- Notification Channels Policies
CREATE POLICY notification_channels_select ON notification_channels FOR SELECT
  USING (auth.uid() = user_id OR org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text
  ));

CREATE POLICY notification_channels_insert ON notification_channels FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY notification_channels_update ON notification_channels FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY notification_channels_delete ON notification_channels FOR DELETE
  USING (auth.uid() = user_id);

-- Feature Flags (admin-only read, system-only write)
CREATE POLICY feature_flags_select ON feature_flags FOR SELECT
  USING (true); -- All authenticated users can read flags

-- Rate Limit Configs (admin-only)
CREATE POLICY rate_limit_configs_select ON rate_limit_configs FOR SELECT
  USING (true); -- System reads

-- System Metrics (read-only for authenticated users)
CREATE POLICY system_metrics_select ON system_metrics FOR SELECT
  USING (true);

-- Service Health History (read-only for authenticated users)
CREATE POLICY service_health_history_select ON service_health_history FOR SELECT
  USING (true);

-- Control Tower Dashboards Policies
CREATE POLICY control_tower_dashboards_select ON control_tower_dashboards FOR SELECT
  USING (auth.uid() = user_id OR org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text
  ));

CREATE POLICY control_tower_dashboards_insert ON control_tower_dashboards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY control_tower_dashboards_update ON control_tower_dashboards FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY control_tower_dashboards_delete ON control_tower_dashboards FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- Functions
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_control_tower_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER alert_rules_updated_at
  BEFORE UPDATE ON alert_rules
  FOR EACH ROW EXECUTE FUNCTION update_control_tower_updated_at();

CREATE TRIGGER alerts_updated_at
  BEFORE UPDATE ON alerts
  FOR EACH ROW EXECUTE FUNCTION update_control_tower_updated_at();

CREATE TRIGGER notification_channels_updated_at
  BEFORE UPDATE ON notification_channels
  FOR EACH ROW EXECUTE FUNCTION update_control_tower_updated_at();

CREATE TRIGGER feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_control_tower_updated_at();

CREATE TRIGGER rate_limit_configs_updated_at
  BEFORE UPDATE ON rate_limit_configs
  FOR EACH ROW EXECUTE FUNCTION update_control_tower_updated_at();

CREATE TRIGGER control_tower_dashboards_updated_at
  BEFORE UPDATE ON control_tower_dashboards
  FOR EACH ROW EXECUTE FUNCTION update_control_tower_updated_at();

-- Function to clean up old metrics (retention: 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_metrics()
RETURNS void AS $$
BEGIN
  DELETE FROM system_metrics WHERE recorded_at < NOW() - INTERVAL '30 days';
  DELETE FROM service_health_history WHERE recorded_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Function to get aggregated metrics
CREATE OR REPLACE FUNCTION get_aggregated_metrics(
  p_metric_name TEXT,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_granularity INTERVAL
)
RETURNS TABLE (
  bucket TIMESTAMPTZ,
  avg_value DOUBLE PRECISION,
  max_value DOUBLE PRECISION,
  min_value DOUBLE PRECISION,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    date_trunc('hour', recorded_at) +
      (EXTRACT(MINUTE FROM recorded_at)::INTEGER / EXTRACT(MINUTE FROM p_granularity)::INTEGER) * p_granularity AS bucket,
    AVG(metric_value) AS avg_value,
    MAX(metric_value) AS max_value,
    MIN(metric_value) AS min_value,
    COUNT(*) AS count
  FROM system_metrics
  WHERE metric_name = p_metric_name
    AND recorded_at >= p_start_time
    AND recorded_at <= p_end_time
  GROUP BY bucket
  ORDER BY bucket;
END;
$$ LANGUAGE plpgsql;
