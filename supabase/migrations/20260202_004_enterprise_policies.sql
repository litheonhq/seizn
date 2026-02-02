-- Migration: 20260202_004_enterprise_policies.sql
-- Description: Enterprise policy features (merged migration)
-- Contents:
--   1) BYOK KMS (Bring Your Own Key Management Service)
--   2) Data Retention with Legal Holds
--   3) OPA (Open Policy Agent) with Rego policies
--   4) Policy Version Control
-- Created: 2026-02-02

-- #############################################
-- PART A: BYOK KMS
-- #############################################

-- ===========================================
-- A1) KMS Configuration Table
-- ===========================================
CREATE TABLE IF NOT EXISTS byok_kms_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Provider configuration
  provider TEXT NOT NULL CHECK (provider IN ('aws_kms', 'gcp_kms', 'azure_keyvault')),
  name TEXT NOT NULL,
  description TEXT,

  -- Key reference (NOT the actual key - just the ARN/resource ID)
  key_reference TEXT NOT NULL,

  -- Provider-specific configuration (encrypted at rest)
  provider_config_encrypted TEXT NOT NULL,

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,

  -- Key metadata
  key_algorithm TEXT DEFAULT 'AES_256',
  key_usage TEXT DEFAULT 'ENCRYPT_DECRYPT',

  -- Rotation
  rotation_enabled BOOLEAN DEFAULT false,
  rotation_interval_days INTEGER DEFAULT 90,
  last_rotated_at TIMESTAMPTZ,
  next_rotation_at TIMESTAMPTZ,

  -- Validation
  last_validated_at TIMESTAMPTZ,
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'invalid', 'error')),
  validation_error TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,

  -- Constraints
  UNIQUE (organization_id, name)
);

-- ===========================================
-- A2) KMS Key Rotation History
-- ===========================================
CREATE TABLE IF NOT EXISTS byok_kms_rotation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kms_config_id UUID NOT NULL REFERENCES byok_kms_configs(id) ON DELETE CASCADE,

  -- Rotation details
  previous_key_reference TEXT,
  new_key_reference TEXT NOT NULL,
  rotation_type TEXT NOT NULL CHECK (rotation_type IN ('scheduled', 'manual', 'emergency')),

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'rolled_back')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,

  -- Error tracking
  error_message TEXT,

  -- Audit
  initiated_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===========================================
-- A3) Data Encryption Keys (DEK) wrapped by KMS
-- ===========================================
CREATE TABLE IF NOT EXISTS byok_data_encryption_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kms_config_id UUID NOT NULL REFERENCES byok_kms_configs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Key purpose
  purpose TEXT NOT NULL CHECK (purpose IN ('memories', 'documents', 'traces', 'general')),

  -- Wrapped DEK (encrypted by KMS KEK)
  wrapped_key TEXT NOT NULL,

  -- Key metadata
  key_version INTEGER NOT NULL DEFAULT 1,
  algorithm TEXT NOT NULL DEFAULT 'AES_256_GCM',

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,

  UNIQUE (kms_config_id, purpose, key_version)
);

-- #############################################
-- PART B: DATA RETENTION WITH LEGAL HOLDS
-- #############################################

-- ===========================================
-- B1) Retention Legal Holds
-- ===========================================
CREATE TABLE IF NOT EXISTS retention_legal_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Hold details
  name TEXT NOT NULL,
  description TEXT,
  reason TEXT NOT NULL,

  -- Scope - what data is held
  scope_type TEXT NOT NULL CHECK (scope_type IN ('all', 'collection', 'user', 'tag', 'date_range')),
  scope_config JSONB NOT NULL DEFAULT '{}',

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'expired')),

  -- Timeline
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_until TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  released_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,

  -- Legal reference
  legal_matter_id TEXT,
  custodian_email TEXT,

  -- Audit
  created_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===========================================
-- B2) Retention Schedules
-- ===========================================
CREATE TABLE IF NOT EXISTS retention_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Schedule details
  name TEXT NOT NULL,
  description TEXT,

  -- Data type this applies to
  data_type TEXT NOT NULL CHECK (data_type IN ('memories', 'documents', 'traces', 'audit_logs', 'api_keys', 'sessions')),

  -- Retention periods
  retention_days INTEGER NOT NULL,
  archive_days INTEGER,

  -- Deletion behavior
  deletion_type TEXT NOT NULL DEFAULT 'soft' CHECK (deletion_type IN ('soft', 'hard', 'anonymize')),

  -- Conditions (JSON for flexible filtering)
  conditions JSONB DEFAULT '{}',

  -- Notification
  notify_before_days INTEGER DEFAULT 7,
  notify_emails TEXT[],

  -- Status
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,

  UNIQUE (organization_id, name)
);

-- ===========================================
-- B3) Retention Execution Log
-- ===========================================
CREATE TABLE IF NOT EXISTS retention_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES retention_schedules(id) ON DELETE SET NULL,

  -- Execution details
  execution_type TEXT NOT NULL CHECK (execution_type IN ('scheduled', 'manual', 'legal_release')),
  data_type TEXT NOT NULL,

  -- Results
  records_processed INTEGER DEFAULT 0,
  records_deleted INTEGER DEFAULT 0,
  records_archived INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,

  -- Error handling
  error_message TEXT,
  error_details JSONB,

  -- Audit
  triggered_by TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- #############################################
-- PART C: OPA (OPEN POLICY AGENT)
-- #############################################

-- ===========================================
-- C1) OPA Policies Table
-- ===========================================
CREATE TABLE IF NOT EXISTS opa_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Policy metadata
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'access_control', 'data_governance', 'rate_limiting',
    'content_filter', 'audit', 'custom'
  )),

  -- Rego policy code
  rego_code TEXT NOT NULL,

  -- Compiled policy cache (optional)
  compiled_policy JSONB,

  -- Versioning
  version INTEGER NOT NULL DEFAULT 1,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT FALSE,

  -- Priority (higher = evaluated first)
  priority INTEGER NOT NULL DEFAULT 0,

  -- Scope
  scope JSONB NOT NULL DEFAULT '{"all": true}'::JSONB,

  -- Policy metadata
  metadata JSONB,

  -- Audit fields
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===========================================
-- C2) OPA Policy Versions Table
-- ===========================================
CREATE TABLE IF NOT EXISTS opa_policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES opa_policies(id) ON DELETE CASCADE,

  -- Version info
  version INTEGER NOT NULL,
  rego_code TEXT NOT NULL,

  -- Change tracking
  change_summary TEXT,

  -- Audit
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (policy_id, version)
);

-- ===========================================
-- C3) OPA Policy Decisions Table
-- ===========================================
CREATE TABLE IF NOT EXISTS opa_policy_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

  -- Request info
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  operation TEXT NOT NULL,

  -- Decision
  allowed BOOLEAN NOT NULL,
  reason TEXT,
  policy_id UUID REFERENCES opa_policies(id) ON DELETE SET NULL,

  -- Context
  ip_address INET,
  user_agent TEXT,
  request_id TEXT,

  -- Timing
  evaluation_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- #############################################
-- PART D: POLICY VERSION CONTROL
-- #############################################

-- ===========================================
-- D1) Winter Policy Versions Table
-- ===========================================
CREATE TABLE IF NOT EXISTS winter_org_policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES winter_org_policies(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Version number
  version INT NOT NULL,

  -- Version state
  state VARCHAR(20) NOT NULL DEFAULT 'draft',

  -- Snapshot of policy at this version
  policy_type VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}'::JSONB,
  scope JSONB NOT NULL DEFAULT '{"all": true}'::JSONB,
  priority INT NOT NULL DEFAULT 0,

  -- Version metadata
  change_summary TEXT,
  change_type VARCHAR(20) DEFAULT 'update',

  -- Who created this version
  created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- When this version was published
  published_at TIMESTAMPTZ,
  published_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,

  -- When this version was superseded
  superseded_at TIMESTAMPTZ,
  superseded_by UUID REFERENCES winter_org_policy_versions(id) ON DELETE SET NULL,

  UNIQUE(policy_id, version)
);

-- ===========================================
-- D2) Add version tracking to main policies table
-- ===========================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'winter_org_policies' AND column_name = 'current_version'
  ) THEN
    ALTER TABLE winter_org_policies ADD COLUMN current_version INT DEFAULT 1;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'winter_org_policies' AND column_name = 'draft_version_id'
  ) THEN
    ALTER TABLE winter_org_policies ADD COLUMN draft_version_id UUID REFERENCES winter_org_policy_versions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- #############################################
-- INDEXES
-- #############################################

-- BYOK indexes
CREATE INDEX IF NOT EXISTS idx_byok_kms_configs_org ON byok_kms_configs(organization_id);
CREATE INDEX IF NOT EXISTS idx_byok_kms_configs_active ON byok_kms_configs(organization_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_byok_kms_configs_default ON byok_kms_configs(organization_id, is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_byok_rotation_history_config ON byok_kms_rotation_history(kms_config_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_byok_dek_org ON byok_data_encryption_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_byok_dek_purpose ON byok_data_encryption_keys(kms_config_id, purpose) WHERE is_active = true;

-- Retention indexes
CREATE INDEX IF NOT EXISTS idx_retention_legal_holds_org ON retention_legal_holds(organization_id);
CREATE INDEX IF NOT EXISTS idx_retention_legal_holds_active ON retention_legal_holds(organization_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_retention_schedules_org ON retention_schedules(organization_id);
CREATE INDEX IF NOT EXISTS idx_retention_schedules_active ON retention_schedules(organization_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_retention_execution_log_org ON retention_execution_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retention_execution_log_schedule ON retention_execution_log(schedule_id, created_at DESC);

-- OPA indexes
CREATE INDEX IF NOT EXISTS idx_opa_policies_org_id ON opa_policies(organization_id);
CREATE INDEX IF NOT EXISTS idx_opa_policies_category ON opa_policies(organization_id, category);
CREATE INDEX IF NOT EXISTS idx_opa_policies_active ON opa_policies(organization_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_opa_policies_priority ON opa_policies(organization_id, priority DESC) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_opa_policy_versions_policy_id ON opa_policy_versions(policy_id);
CREATE INDEX IF NOT EXISTS idx_opa_policy_versions_lookup ON opa_policy_versions(policy_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_opa_decisions_org_time ON opa_policy_decisions(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_opa_decisions_principal ON opa_policy_decisions(principal_type, principal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_opa_decisions_denied ON opa_policy_decisions(organization_id, allowed, created_at DESC) WHERE allowed = false;

-- Winter policy versions indexes
CREATE INDEX IF NOT EXISTS idx_policy_versions_policy ON winter_org_policy_versions(policy_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_policy_versions_org ON winter_org_policy_versions(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_policy_versions_state ON winter_org_policy_versions(policy_id, state) WHERE state = 'published';

-- #############################################
-- ROW LEVEL SECURITY
-- #############################################

ALTER TABLE byok_kms_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE byok_kms_rotation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE byok_data_encryption_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_legal_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_execution_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE opa_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE opa_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE opa_policy_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_org_policy_versions ENABLE ROW LEVEL SECURITY;

-- BYOK RLS
CREATE POLICY "Org admins can manage KMS configs"
  ON byok_kms_configs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = byok_kms_configs.organization_id
      AND om.user_id = auth.uid()::text
      AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org members can view KMS configs"
  ON byok_kms_configs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = byok_kms_configs.organization_id
      AND om.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Org admins can manage rotation history"
  ON byok_kms_rotation_history FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM byok_kms_configs kc
      JOIN organization_members om ON om.organization_id = kc.organization_id
      WHERE kc.id = byok_kms_rotation_history.kms_config_id
      AND om.user_id = auth.uid()::text
      AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org members can view rotation history"
  ON byok_kms_rotation_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM byok_kms_configs kc
      JOIN organization_members om ON om.organization_id = kc.organization_id
      WHERE kc.id = byok_kms_rotation_history.kms_config_id
      AND om.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Org admins can manage DEKs"
  ON byok_data_encryption_keys FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = byok_data_encryption_keys.organization_id
      AND om.user_id = auth.uid()::text
      AND om.role IN ('owner', 'admin')
    )
  );

-- Legal holds RLS (owners only for sensitive operations)
CREATE POLICY "Org owners can manage legal holds"
  ON retention_legal_holds FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = retention_legal_holds.organization_id
      AND om.user_id = auth.uid()::text
      AND om.role = 'owner'
    )
  );

CREATE POLICY "Org admins can view legal holds"
  ON retention_legal_holds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = retention_legal_holds.organization_id
      AND om.user_id = auth.uid()::text
      AND om.role IN ('owner', 'admin')
    )
  );

-- Retention schedules RLS
CREATE POLICY "Org admins can manage retention schedules"
  ON retention_schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = retention_schedules.organization_id
      AND om.user_id = auth.uid()::text
      AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org members can view retention schedules"
  ON retention_schedules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = retention_schedules.organization_id
      AND om.user_id = auth.uid()::text
    )
  );

-- Execution log RLS
CREATE POLICY "Org admins can view execution log"
  ON retention_execution_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = retention_execution_log.organization_id
      AND om.user_id = auth.uid()::text
      AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "System can insert execution log"
  ON retention_execution_log FOR INSERT
  WITH CHECK (true);

-- OPA RLS
CREATE POLICY "Org members can view OPA policies" ON opa_policies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = opa_policies.organization_id
        AND organization_members.user_id = auth.uid()::text
        AND organization_members.status = 'active'
    )
  );

CREATE POLICY "Org admins can manage OPA policies" ON opa_policies
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = opa_policies.organization_id
        AND organization_members.user_id = auth.uid()::text
        AND organization_members.role IN ('owner', 'admin')
        AND organization_members.status = 'active'
    )
  );

CREATE POLICY "View OPA policy versions" ON opa_policy_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM opa_policies
      WHERE opa_policies.id = opa_policy_versions.policy_id
        AND EXISTS (
          SELECT 1 FROM organization_members
          WHERE organization_members.organization_id = opa_policies.organization_id
            AND organization_members.user_id = auth.uid()::text
            AND organization_members.status = 'active'
        )
    )
  );

CREATE POLICY "Manage OPA policy versions" ON opa_policy_versions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM opa_policies
      WHERE opa_policies.id = opa_policy_versions.policy_id
        AND EXISTS (
          SELECT 1 FROM organization_members
          WHERE organization_members.organization_id = opa_policies.organization_id
            AND organization_members.user_id = auth.uid()::text
            AND organization_members.role IN ('owner', 'admin')
            AND organization_members.status = 'active'
        )
    )
  );

CREATE POLICY "View OPA policy decisions" ON opa_policy_decisions
  FOR SELECT USING (
    organization_id IS NULL OR
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = opa_policy_decisions.organization_id
        AND organization_members.user_id = auth.uid()::text
        AND organization_members.status = 'active'
    )
  );

CREATE POLICY "Service can record OPA decisions" ON opa_policy_decisions
  FOR INSERT WITH CHECK (true);

-- Winter policy versions RLS
CREATE POLICY "Org members can view policy versions"
  ON winter_org_policy_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = winter_org_policy_versions.organization_id
      AND om.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Admins can manage policy versions"
  ON winter_org_policy_versions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = winter_org_policy_versions.organization_id
      AND om.user_id = auth.uid()::text
      AND om.role IN ('owner', 'admin')
    )
  );

-- #############################################
-- HELPER FUNCTIONS
-- #############################################

-- Check if data is under legal hold
CREATE OR REPLACE FUNCTION is_under_legal_hold(
  p_org_id UUID,
  p_data_type TEXT,
  p_record_id UUID DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL,
  p_tags TEXT[] DEFAULT NULL,
  p_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_hold retention_legal_holds;
  v_scope_config JSONB;
BEGIN
  FOR v_hold IN
    SELECT * FROM retention_legal_holds
    WHERE organization_id = p_org_id
    AND status = 'active'
    AND (effective_until IS NULL OR effective_until > now())
  LOOP
    v_scope_config := v_hold.scope_config;

    IF v_hold.scope_type = 'all' THEN
      RETURN TRUE;
    END IF;

    IF v_hold.scope_type = 'user' AND p_user_id IS NOT NULL THEN
      IF p_user_id = ANY(ARRAY(SELECT jsonb_array_elements_text(v_scope_config->'user_ids'))) THEN
        RETURN TRUE;
      END IF;
    END IF;

    IF v_hold.scope_type = 'tag' AND p_tags IS NOT NULL THEN
      IF p_tags && ARRAY(SELECT jsonb_array_elements_text(v_scope_config->'tags'))::TEXT[] THEN
        RETURN TRUE;
      END IF;
    END IF;

    IF v_hold.scope_type = 'date_range' AND p_created_at IS NOT NULL THEN
      IF p_created_at >= (v_scope_config->>'start_date')::TIMESTAMPTZ
         AND p_created_at <= (v_scope_config->>'end_date')::TIMESTAMPTZ THEN
        RETURN TRUE;
      END IF;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get effective retention days for a data type
CREATE OR REPLACE FUNCTION get_effective_retention_days(
  p_org_id UUID,
  p_data_type TEXT
)
RETURNS INTEGER AS $$
DECLARE
  v_retention_days INTEGER;
BEGIN
  SELECT retention_days INTO v_retention_days
  FROM retention_schedules
  WHERE organization_id = p_org_id
  AND data_type = p_data_type
  AND is_active = true
  ORDER BY priority DESC
  LIMIT 1;

  IF v_retention_days IS NULL THEN
    SELECT (config->>'retention_days')::INTEGER INTO v_retention_days
    FROM winter_org_policies
    WHERE organization_id = p_org_id
    AND policy_type = 'retention_policy'
    AND is_active = true
    ORDER BY priority DESC
    LIMIT 1;
  END IF;

  RETURN COALESCE(v_retention_days, 90);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get active OPA policies for an organization
CREATE OR REPLACE FUNCTION get_active_opa_policies(
  p_organization_id UUID,
  p_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  category TEXT,
  rego_code TEXT,
  priority INTEGER,
  scope JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    op.id,
    op.name,
    op.category,
    op.rego_code,
    op.priority,
    op.scope
  FROM opa_policies op
  WHERE op.organization_id = p_organization_id
    AND op.is_active = true
    AND (p_category IS NULL OR op.category = p_category)
  ORDER BY op.priority DESC, op.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record OPA policy decision
CREATE OR REPLACE FUNCTION record_opa_decision(
  p_organization_id UUID,
  p_principal_type TEXT,
  p_principal_id TEXT,
  p_resource_type TEXT,
  p_resource_id TEXT,
  p_operation TEXT,
  p_allowed BOOLEAN,
  p_reason TEXT DEFAULT NULL,
  p_policy_id UUID DEFAULT NULL,
  p_evaluation_time_ms INTEGER DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO opa_policy_decisions (
    organization_id, principal_type, principal_id,
    resource_type, resource_id, operation,
    allowed, reason, policy_id,
    evaluation_time_ms, ip_address, request_id
  ) VALUES (
    p_organization_id, p_principal_type, p_principal_id,
    p_resource_type, p_resource_id, p_operation,
    p_allowed, p_reason, p_policy_id,
    p_evaluation_time_ms, p_ip_address, p_request_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get OPA decision statistics
CREATE OR REPLACE FUNCTION get_opa_decision_stats(
  p_organization_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '7 days',
  p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  total_decisions BIGINT,
  allowed_count BIGINT,
  denied_count BIGINT,
  allow_rate NUMERIC,
  by_operation JSONB,
  by_resource_type JSONB,
  top_denied_resources JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE allowed = true) as allowed,
      COUNT(*) FILTER (WHERE allowed = false) as denied
    FROM opa_policy_decisions
    WHERE organization_id = p_organization_id
      AND created_at BETWEEN p_start_date AND p_end_date
  ),
  by_op AS (
    SELECT jsonb_object_agg(operation, cnt) as data
    FROM (
      SELECT operation, COUNT(*) as cnt
      FROM opa_policy_decisions
      WHERE organization_id = p_organization_id
        AND created_at BETWEEN p_start_date AND p_end_date
      GROUP BY operation
    ) sub
  ),
  by_resource AS (
    SELECT jsonb_object_agg(COALESCE(resource_type, 'unknown'), cnt) as data
    FROM (
      SELECT resource_type, COUNT(*) as cnt
      FROM opa_policy_decisions
      WHERE organization_id = p_organization_id
        AND created_at BETWEEN p_start_date AND p_end_date
      GROUP BY resource_type
    ) sub
  ),
  top_denied AS (
    SELECT jsonb_agg(jsonb_build_object(
      'resource_type', resource_type,
      'resource_id', resource_id,
      'count', cnt,
      'reason', reason
    ) ORDER BY cnt DESC) as data
    FROM (
      SELECT resource_type, resource_id, reason, COUNT(*) as cnt
      FROM opa_policy_decisions
      WHERE organization_id = p_organization_id
        AND created_at BETWEEN p_start_date AND p_end_date
        AND allowed = false
      GROUP BY resource_type, resource_id, reason
      ORDER BY cnt DESC
      LIMIT 10
    ) sub
  )
  SELECT
    s.total, s.allowed, s.denied,
    CASE WHEN s.total > 0 THEN ROUND(s.allowed::NUMERIC / s.total * 100, 2) ELSE 0 END,
    COALESCE(bo.data, '{}'::JSONB),
    COALESCE(br.data, '{}'::JSONB),
    COALESCE(td.data, '[]'::JSONB)
  FROM stats s
  CROSS JOIN by_op bo
  CROSS JOIN by_resource br
  CROSS JOIN top_denied td;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Drop ALL existing policy versioning functions (any signature)
DROP FUNCTION IF EXISTS create_policy_version CASCADE;
DROP FUNCTION IF EXISTS publish_policy_version CASCADE;
DROP FUNCTION IF EXISTS rollback_policy_to_version CASCADE;
DROP FUNCTION IF EXISTS compare_policy_versions CASCADE;
DROP FUNCTION IF EXISTS get_next_policy_version CASCADE;

-- Policy versioning: Get next version number
CREATE OR REPLACE FUNCTION get_next_policy_version(p_policy_id UUID)
RETURNS INT AS $$
DECLARE
  v_max_version INT;
BEGIN
  SELECT COALESCE(MAX(version), 0) INTO v_max_version
  FROM winter_org_policy_versions
  WHERE policy_id = p_policy_id;

  RETURN v_max_version + 1;
END;
$$ LANGUAGE plpgsql;

-- Policy versioning: Create a new version
CREATE OR REPLACE FUNCTION create_policy_version(
  p_policy_id UUID,
  p_created_by TEXT,
  p_change_summary TEXT DEFAULT NULL,
  p_change_type VARCHAR(20) DEFAULT 'update'
)
RETURNS UUID AS $$
DECLARE
  v_policy RECORD;
  v_version INT;
  v_version_id UUID;
BEGIN
  SELECT * INTO v_policy
  FROM winter_org_policies
  WHERE id = p_policy_id;

  IF v_policy IS NULL THEN
    RAISE EXCEPTION 'Policy not found: %', p_policy_id;
  END IF;

  v_version := get_next_policy_version(p_policy_id);

  INSERT INTO winter_org_policy_versions (
    policy_id, organization_id, version, state,
    policy_type, name, description, config, scope, priority,
    change_summary, change_type, created_by
  ) VALUES (
    p_policy_id, v_policy.organization_id, v_version, 'draft',
    v_policy.policy_type, v_policy.name, v_policy.description,
    v_policy.config, v_policy.scope, v_policy.priority,
    p_change_summary, p_change_type, p_created_by
  )
  RETURNING id INTO v_version_id;

  UPDATE winter_org_policies
  SET draft_version_id = v_version_id
  WHERE id = p_policy_id;

  RETURN v_version_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policy versioning: Publish a version
CREATE OR REPLACE FUNCTION publish_policy_version(
  p_version_id UUID,
  p_published_by TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_version RECORD;
  v_policy_id UUID;
BEGIN
  SELECT * INTO v_version
  FROM winter_org_policy_versions
  WHERE id = p_version_id AND state = 'draft';

  IF v_version IS NULL THEN
    RAISE EXCEPTION 'Version not found or not in draft state: %', p_version_id;
  END IF;

  v_policy_id := v_version.policy_id;

  UPDATE winter_org_policy_versions
  SET state = 'archived',
      superseded_at = NOW(),
      superseded_by = p_version_id
  WHERE policy_id = v_policy_id
    AND state = 'published';

  UPDATE winter_org_policy_versions
  SET state = 'published',
      published_at = NOW(),
      published_by = p_published_by
  WHERE id = p_version_id;

  UPDATE winter_org_policies
  SET config = v_version.config,
      name = v_version.name,
      description = v_version.description,
      scope = v_version.scope,
      priority = v_version.priority,
      current_version = v_version.version,
      draft_version_id = NULL,
      updated_at = NOW()
  WHERE id = v_policy_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policy versioning: Rollback to a specific version
CREATE OR REPLACE FUNCTION rollback_policy_to_version(
  p_policy_id UUID,
  p_target_version INT,
  p_rolled_back_by TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_target RECORD;
  v_new_version_id UUID;
  v_new_version INT;
BEGIN
  SELECT * INTO v_target
  FROM winter_org_policy_versions
  WHERE policy_id = p_policy_id AND version = p_target_version;

  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Version % not found for policy %', p_target_version, p_policy_id;
  END IF;

  v_new_version := get_next_policy_version(p_policy_id);

  INSERT INTO winter_org_policy_versions (
    policy_id, organization_id, version, state,
    policy_type, name, description, config, scope, priority,
    change_summary, change_type, created_by
  ) VALUES (
    p_policy_id, v_target.organization_id, v_new_version, 'draft',
    v_target.policy_type, v_target.name, v_target.description,
    v_target.config, v_target.scope, v_target.priority,
    COALESCE(p_reason, 'Rollback to version ' || p_target_version),
    'rollback',
    p_rolled_back_by
  )
  RETURNING id INTO v_new_version_id;

  UPDATE winter_org_policies
  SET draft_version_id = v_new_version_id
  WHERE id = p_policy_id;

  RETURN v_new_version_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policy versioning: Compare two versions
CREATE OR REPLACE FUNCTION compare_policy_versions(
  p_version_id_a UUID,
  p_version_id_b UUID
)
RETURNS JSONB AS $$
DECLARE
  v_a RECORD;
  v_b RECORD;
  v_diff JSONB;
BEGIN
  SELECT * INTO v_a FROM winter_org_policy_versions WHERE id = p_version_id_a;
  SELECT * INTO v_b FROM winter_org_policy_versions WHERE id = p_version_id_b;

  IF v_a IS NULL OR v_b IS NULL THEN
    RAISE EXCEPTION 'One or both versions not found';
  END IF;

  v_diff := jsonb_build_object(
    'version_a', jsonb_build_object(
      'id', v_a.id, 'version', v_a.version,
      'state', v_a.state, 'created_at', v_a.created_at
    ),
    'version_b', jsonb_build_object(
      'id', v_b.id, 'version', v_b.version,
      'state', v_b.state, 'created_at', v_b.created_at
    ),
    'changes', jsonb_build_object(
      'name', CASE WHEN v_a.name != v_b.name
        THEN jsonb_build_object('from', v_a.name, 'to', v_b.name) ELSE NULL END,
      'description', CASE WHEN v_a.description IS DISTINCT FROM v_b.description
        THEN jsonb_build_object('from', v_a.description, 'to', v_b.description) ELSE NULL END,
      'config', CASE WHEN v_a.config != v_b.config
        THEN jsonb_build_object('from', v_a.config, 'to', v_b.config) ELSE NULL END,
      'scope', CASE WHEN v_a.scope != v_b.scope
        THEN jsonb_build_object('from', v_a.scope, 'to', v_b.scope) ELSE NULL END,
      'priority', CASE WHEN v_a.priority != v_b.priority
        THEN jsonb_build_object('from', v_a.priority, 'to', v_b.priority) ELSE NULL END
    )
  );

  RETURN v_diff;
END;
$$ LANGUAGE plpgsql;

-- #############################################
-- TRIGGERS
-- #############################################

-- BYOK updated_at trigger
CREATE OR REPLACE FUNCTION update_byok_kms_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS byok_kms_configs_updated_at ON byok_kms_configs;
CREATE TRIGGER byok_kms_configs_updated_at
  BEFORE UPDATE ON byok_kms_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_byok_kms_configs_updated_at();

-- Retention legal holds updated_at trigger
CREATE OR REPLACE FUNCTION update_retention_legal_holds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS retention_legal_holds_updated_at ON retention_legal_holds;
CREATE TRIGGER retention_legal_holds_updated_at
  BEFORE UPDATE ON retention_legal_holds
  FOR EACH ROW
  EXECUTE FUNCTION update_retention_legal_holds_updated_at();

-- Retention schedules updated_at trigger
CREATE OR REPLACE FUNCTION update_retention_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS retention_schedules_updated_at ON retention_schedules;
CREATE TRIGGER retention_schedules_updated_at
  BEFORE UPDATE ON retention_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_retention_schedules_updated_at();

-- OPA policies updated_at trigger
CREATE OR REPLACE FUNCTION update_opa_policies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS opa_policies_updated_at ON opa_policies;
CREATE TRIGGER opa_policies_updated_at
  BEFORE UPDATE ON opa_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_opa_policies_updated_at();

-- OPA version history trigger
CREATE OR REPLACE FUNCTION save_opa_policy_version()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.rego_code IS DISTINCT FROM NEW.rego_code THEN
    INSERT INTO opa_policy_versions (
      policy_id, version, rego_code, change_summary, created_by
    ) VALUES (
      OLD.id, OLD.version, OLD.rego_code,
      'Auto-saved before update', COALESCE(auth.uid(), OLD.created_by)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS opa_policies_version_history ON opa_policies;
CREATE TRIGGER opa_policies_version_history
  BEFORE UPDATE ON opa_policies
  FOR EACH ROW
  WHEN (OLD.rego_code IS DISTINCT FROM NEW.rego_code)
  EXECUTE FUNCTION save_opa_policy_version();

-- Winter policy version audit trigger
CREATE OR REPLACE FUNCTION audit_policy_version_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_org_audit_event(
      NEW.created_by, NEW.organization_id,
      'policy.version_create', 'policy_versions', NEW.id,
      jsonb_build_object(
        'policy_id', NEW.policy_id,
        'version', NEW.version,
        'change_type', NEW.change_type,
        'change_summary', NEW.change_summary
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.state = 'draft' AND NEW.state = 'published' THEN
      PERFORM log_org_audit_event(
        NEW.published_by, NEW.organization_id,
        'policy.version_publish', 'policy_versions', NEW.id,
        jsonb_build_object('policy_id', NEW.policy_id, 'version', NEW.version)
      );
    ELSIF OLD.state = 'published' AND NEW.state = 'archived' THEN
      PERFORM log_org_audit_event(
        NULL, NEW.organization_id,
        'policy.version_archive', 'policy_versions', NEW.id,
        jsonb_build_object(
          'policy_id', NEW.policy_id,
          'version', NEW.version,
          'superseded_by', NEW.superseded_by
        )
      );
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_policy_version_trigger ON winter_org_policy_versions;
CREATE TRIGGER audit_policy_version_trigger
  AFTER INSERT OR UPDATE ON winter_org_policy_versions
  FOR EACH ROW
  EXECUTE FUNCTION audit_policy_version_changes();

-- #############################################
-- INITIALIZE EXISTING POLICIES
-- #############################################

-- Create initial version records for existing policies
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.*
    FROM winter_org_policies p
    WHERE NOT EXISTS (
      SELECT 1 FROM winter_org_policy_versions v
      WHERE v.policy_id = p.id
    )
  ) LOOP
    INSERT INTO winter_org_policy_versions (
      policy_id, organization_id, version, state,
      policy_type, name, description, config, scope, priority,
      change_summary, change_type, created_by, published_at, published_by
    ) VALUES (
      r.id, r.organization_id, 1, 'published',
      r.policy_type, r.name, r.description, r.config, r.scope, r.priority,
      'Initial version (migrated)', 'create', r.created_by, r.created_at, r.created_by
    );

    UPDATE winter_org_policies SET current_version = 1 WHERE id = r.id;
  END LOOP;
END $$;

-- #############################################
-- COMMENTS
-- #############################################

COMMENT ON TABLE byok_kms_configs IS 'Customer-managed KMS configurations for BYOK encryption';
COMMENT ON TABLE byok_kms_rotation_history IS 'History of KMS key rotations';
COMMENT ON TABLE byok_data_encryption_keys IS 'Data Encryption Keys (DEKs) wrapped by customer KMS';
COMMENT ON TABLE retention_legal_holds IS 'Legal holds that prevent data deletion';
COMMENT ON TABLE retention_schedules IS 'Per-data-type retention schedules';
COMMENT ON TABLE retention_execution_log IS 'Log of retention policy executions';
COMMENT ON TABLE opa_policies IS 'Stores Rego policy definitions for OPA-compatible policy evaluation';
COMMENT ON TABLE opa_policy_versions IS 'Historical versions of OPA policies for audit and rollback';
COMMENT ON TABLE opa_policy_decisions IS 'Audit log of policy evaluation decisions';
COMMENT ON TABLE winter_org_policy_versions IS 'Version history for organization policies';
COMMENT ON FUNCTION is_under_legal_hold IS 'Check if data is under any active legal hold';
COMMENT ON FUNCTION get_effective_retention_days IS 'Get effective retention period for a data type';
COMMENT ON FUNCTION get_active_opa_policies IS 'Get active OPA policies for an organization';
COMMENT ON FUNCTION record_opa_decision IS 'Record an OPA policy evaluation decision';
COMMENT ON FUNCTION get_opa_decision_stats IS 'Get OPA decision statistics for analytics';
COMMENT ON FUNCTION get_next_policy_version IS 'Get the next version number for a policy';
COMMENT ON FUNCTION create_policy_version IS 'Create a new draft version of a policy';
COMMENT ON FUNCTION publish_policy_version IS 'Publish a draft version, making it the active version';
COMMENT ON FUNCTION rollback_policy_to_version IS 'Rollback a policy to a previous version';
COMMENT ON FUNCTION compare_policy_versions IS 'Compare two policy versions and return diff';
