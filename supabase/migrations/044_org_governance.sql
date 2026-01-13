-- Seizn Winter - Organization Governance Enhancement
-- Migration: 044_org_governance.sql
--
-- Extends the existing organization/audit infrastructure with:
-- - Team management
-- - Custom roles
-- - Organization policies
-- - Enhanced audit logging
-- - Report storage

-- ===========================================
-- 1) Teams (within Organizations)
-- ===========================================
CREATE TABLE IF NOT EXISTS winter_org_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL,
  description TEXT,

  -- Settings
  settings JSONB DEFAULT '{}'::JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, slug)
);

-- Team members
CREATE TABLE IF NOT EXISTS winter_org_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES winter_org_teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Role within team: lead, member, viewer
  role VARCHAR(20) NOT NULL DEFAULT 'member',

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(team_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_winter_org_teams_org ON winter_org_teams(organization_id);
CREATE INDEX IF NOT EXISTS idx_winter_org_team_members_team ON winter_org_team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_winter_org_team_members_user ON winter_org_team_members(user_id);

-- ===========================================
-- 2) Custom Roles
-- ===========================================
CREATE TABLE IF NOT EXISTS winter_org_custom_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Base role to inherit from: owner, admin, member, viewer
  base_role VARCHAR(20) NOT NULL DEFAULT 'member',

  -- Custom permission overrides
  permissions JSONB NOT NULL DEFAULT '[]'::JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_winter_org_custom_roles_org ON winter_org_custom_roles(organization_id);

-- ===========================================
-- 3) Organization Policies
-- ===========================================
CREATE TABLE IF NOT EXISTS winter_org_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Policy type: retention_policy, pii_policy, access_policy, audit_policy, security_policy
  policy_type VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Policy configuration (JSON schema depends on policy_type)
  config JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Scope: who this policy applies to
  -- { "all": true } or { "team_ids": [...] } or { "user_ids": [...] }
  scope JSONB NOT NULL DEFAULT '{"all": true}'::JSONB,

  -- Priority for conflict resolution (higher = takes precedence)
  priority INT NOT NULL DEFAULT 0,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Metadata
  created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_winter_org_policies_org ON winter_org_policies(organization_id);
CREATE INDEX IF NOT EXISTS idx_winter_org_policies_type ON winter_org_policies(organization_id, policy_type);
CREATE INDEX IF NOT EXISTS idx_winter_org_policies_active ON winter_org_policies(organization_id, is_active) WHERE is_active = TRUE;

-- ===========================================
-- 4) Reports
-- ===========================================
CREATE TABLE IF NOT EXISTS winter_org_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Report type
  report_type VARCHAR(50) NOT NULL,

  -- Time period covered
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Report data (JSON)
  data JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Generation info
  generated_by VARCHAR(20) NOT NULL DEFAULT 'user', -- user, system
  generated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Optional file storage
  file_url TEXT,
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_winter_org_reports_org ON winter_org_reports(organization_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_winter_org_reports_type ON winter_org_reports(organization_id, report_type);

-- ===========================================
-- 5) Enhanced Organization Members
-- ===========================================

-- Add status column to organization_members if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organization_members' AND column_name = 'status'
  ) THEN
    ALTER TABLE organization_members ADD COLUMN status VARCHAR(20) DEFAULT 'active';
  END IF;
END $$;

-- Add last_active_at column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organization_members' AND column_name = 'last_active_at'
  ) THEN
    ALTER TABLE organization_members ADD COLUMN last_active_at TIMESTAMPTZ;
  END IF;
END $$;

-- ===========================================
-- 6) RLS Policies
-- ===========================================

ALTER TABLE winter_org_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_org_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_org_custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_org_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_org_reports ENABLE ROW LEVEL SECURITY;

-- Teams: Org members can view, admins can manage
CREATE POLICY "Org members can view teams"
  ON winter_org_teams FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = winter_org_teams.organization_id
      AND om.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Admins can manage teams"
  ON winter_org_teams FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = winter_org_teams.organization_id
      AND om.user_id = auth.uid()::text
      AND om.role IN ('owner', 'admin')
    )
  );

-- Team members: Team members can view, leads/admins can manage
CREATE POLICY "Team members can view team members"
  ON winter_org_team_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM winter_org_team_members tm
      WHERE tm.team_id = winter_org_team_members.team_id
      AND tm.user_id = auth.uid()::text
    )
    OR
    EXISTS (
      SELECT 1 FROM winter_org_teams t
      JOIN organization_members om ON om.organization_id = t.organization_id
      WHERE t.id = winter_org_team_members.team_id
      AND om.user_id = auth.uid()::text
      AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Leads and admins can manage team members"
  ON winter_org_team_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM winter_org_team_members tm
      WHERE tm.team_id = winter_org_team_members.team_id
      AND tm.user_id = auth.uid()::text
      AND tm.role = 'lead'
    )
    OR
    EXISTS (
      SELECT 1 FROM winter_org_teams t
      JOIN organization_members om ON om.organization_id = t.organization_id
      WHERE t.id = winter_org_team_members.team_id
      AND om.user_id = auth.uid()::text
      AND om.role IN ('owner', 'admin')
    )
  );

-- Custom roles: Org members can view, owner can manage
CREATE POLICY "Org members can view custom roles"
  ON winter_org_custom_roles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = winter_org_custom_roles.organization_id
      AND om.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Owner can manage custom roles"
  ON winter_org_custom_roles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = winter_org_custom_roles.organization_id
      AND om.user_id = auth.uid()::text
      AND om.role = 'owner'
    )
  );

-- Policies: Org members can view, admins can manage
CREATE POLICY "Org members can view policies"
  ON winter_org_policies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = winter_org_policies.organization_id
      AND om.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Admins can manage policies"
  ON winter_org_policies FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = winter_org_policies.organization_id
      AND om.user_id = auth.uid()::text
      AND om.role IN ('owner', 'admin')
    )
  );

-- Reports: Org members can view, admins can create
CREATE POLICY "Org members can view reports"
  ON winter_org_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = winter_org_reports.organization_id
      AND om.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Admins can create reports"
  ON winter_org_reports FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = winter_org_reports.organization_id
      AND om.user_id = auth.uid()::text
      AND om.role IN ('owner', 'admin')
    )
  );

-- ===========================================
-- 7) Helper Functions
-- ===========================================

-- Function to get effective policy for an org
CREATE OR REPLACE FUNCTION get_effective_org_policy(
  p_org_id UUID,
  p_policy_type VARCHAR(50),
  p_team_id UUID DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_policy JSONB;
BEGIN
  SELECT config INTO v_policy
  FROM winter_org_policies
  WHERE organization_id = p_org_id
    AND policy_type = p_policy_type
    AND is_active = TRUE
    AND (
      (scope->>'all')::boolean = TRUE
      OR (p_team_id IS NOT NULL AND p_team_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(scope->'team_ids'))))
      OR (p_user_id IS NOT NULL AND p_user_id = ANY(ARRAY(SELECT jsonb_array_elements_text(scope->'user_ids'))))
    )
  ORDER BY priority DESC
  LIMIT 1;

  RETURN COALESCE(v_policy, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check user permission in org
CREATE OR REPLACE FUNCTION check_org_permission(
  p_org_id UUID,
  p_user_id TEXT,
  p_resource VARCHAR(50),
  p_action VARCHAR(20)
)
RETURNS BOOLEAN AS $$
DECLARE
  v_role VARCHAR(20);
  v_has_permission BOOLEAN := FALSE;
BEGIN
  -- Get user's role in org
  SELECT role INTO v_role
  FROM organization_members
  WHERE organization_id = p_org_id
    AND user_id = p_user_id
    AND (status IS NULL OR status = 'active');

  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Owner has all permissions
  IF v_role = 'owner' THEN
    RETURN TRUE;
  END IF;

  -- Admin has most permissions except billing admin
  IF v_role = 'admin' THEN
    IF p_resource = 'billing' AND p_action = 'admin' THEN
      RETURN FALSE;
    END IF;
    RETURN TRUE;
  END IF;

  -- Member can read most things and create/update own resources
  IF v_role = 'member' THEN
    IF p_action = 'read' THEN
      RETURN TRUE;
    END IF;
    IF p_resource IN ('memories', 'collections', 'documents') AND p_action IN ('create', 'update', 'delete') THEN
      RETURN TRUE;
    END IF;
    RETURN FALSE;
  END IF;

  -- Viewer can only read
  IF v_role = 'viewer' THEN
    RETURN p_action = 'read' AND p_resource NOT IN ('audit_logs', 'billing');
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log org audit event
CREATE OR REPLACE FUNCTION log_org_audit_event(
  p_user_id TEXT,
  p_organization_id UUID,
  p_action VARCHAR(50),
  p_resource_type VARCHAR(50),
  p_resource_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::JSONB,
  p_previous_state JSONB DEFAULT NULL,
  p_new_state JSONB DEFAULT NULL,
  p_status VARCHAR(20) DEFAULT 'success'
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO audit_logs (
    user_id, organization_id, action, resource_type, resource_id,
    details, previous_state, new_state, status
  ) VALUES (
    p_user_id, p_organization_id, p_action, p_resource_type, p_resource_id,
    p_details, p_previous_state, p_new_state, p_status
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 8) Triggers for Auto-Updating
-- ===========================================

-- Auto-update updated_at on teams
CREATE OR REPLACE FUNCTION update_winter_org_teams_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_winter_org_teams_updated ON winter_org_teams;
CREATE TRIGGER trigger_winter_org_teams_updated
  BEFORE UPDATE ON winter_org_teams
  FOR EACH ROW
  EXECUTE FUNCTION update_winter_org_teams_updated_at();

-- Auto-update updated_at on custom roles
CREATE OR REPLACE FUNCTION update_winter_org_custom_roles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_winter_org_custom_roles_updated ON winter_org_custom_roles;
CREATE TRIGGER trigger_winter_org_custom_roles_updated
  BEFORE UPDATE ON winter_org_custom_roles
  FOR EACH ROW
  EXECUTE FUNCTION update_winter_org_custom_roles_updated_at();

-- Auto-update updated_at on policies
CREATE OR REPLACE FUNCTION update_winter_org_policies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_winter_org_policies_updated ON winter_org_policies;
CREATE TRIGGER trigger_winter_org_policies_updated
  BEFORE UPDATE ON winter_org_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_winter_org_policies_updated_at();

-- ===========================================
-- 9) Audit Triggers for New Tables
-- ===========================================

-- Team audit trigger
CREATE OR REPLACE FUNCTION audit_winter_org_teams_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_org_audit_event(
      NULL, NEW.organization_id,
      'team.create', 'teams', NEW.id,
      jsonb_build_object('name', NEW.name, 'slug', NEW.slug)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.name IS DISTINCT FROM NEW.name OR OLD.settings IS DISTINCT FROM NEW.settings THEN
      PERFORM log_org_audit_event(
        NULL, NEW.organization_id,
        'team.update', 'teams', NEW.id,
        NULL,
        jsonb_build_object('name', OLD.name, 'settings', OLD.settings),
        jsonb_build_object('name', NEW.name, 'settings', NEW.settings)
      );
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_org_audit_event(
      NULL, OLD.organization_id,
      'team.delete', 'teams', OLD.id,
      jsonb_build_object('name', OLD.name)
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_winter_org_teams_trigger ON winter_org_teams;
CREATE TRIGGER audit_winter_org_teams_trigger
  AFTER INSERT OR UPDATE OR DELETE ON winter_org_teams
  FOR EACH ROW
  EXECUTE FUNCTION audit_winter_org_teams_changes();

-- Policy audit trigger
CREATE OR REPLACE FUNCTION audit_winter_org_policies_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_org_audit_event(
      NEW.created_by, NEW.organization_id,
      'policy.create', 'policies', NEW.id,
      jsonb_build_object('policy_type', NEW.policy_type, 'name', NEW.name)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_active = TRUE AND NEW.is_active = FALSE THEN
      PERFORM log_org_audit_event(
        NULL, NEW.organization_id,
        'policy.deactivate', 'policies', NEW.id,
        jsonb_build_object('policy_type', NEW.policy_type, 'name', NEW.name)
      );
    ELSIF OLD.is_active = FALSE AND NEW.is_active = TRUE THEN
      PERFORM log_org_audit_event(
        NULL, NEW.organization_id,
        'policy.activate', 'policies', NEW.id,
        jsonb_build_object('policy_type', NEW.policy_type, 'name', NEW.name)
      );
    ELSE
      PERFORM log_org_audit_event(
        NULL, NEW.organization_id,
        'policy.update', 'policies', NEW.id,
        NULL,
        jsonb_build_object('config', OLD.config),
        jsonb_build_object('config', NEW.config)
      );
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_org_audit_event(
      NULL, OLD.organization_id,
      'policy.delete', 'policies', OLD.id,
      jsonb_build_object('policy_type', OLD.policy_type, 'name', OLD.name)
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_winter_org_policies_trigger ON winter_org_policies;
CREATE TRIGGER audit_winter_org_policies_trigger
  AFTER INSERT OR UPDATE OR DELETE ON winter_org_policies
  FOR EACH ROW
  EXECUTE FUNCTION audit_winter_org_policies_changes();

-- ===========================================
-- 10) Comments
-- ===========================================
COMMENT ON TABLE winter_org_teams IS 'Teams within organizations for resource grouping';
COMMENT ON TABLE winter_org_team_members IS 'Team membership with roles';
COMMENT ON TABLE winter_org_custom_roles IS 'Custom roles defined per organization';
COMMENT ON TABLE winter_org_policies IS 'Organization-level policies (retention, PII, access, etc.)';
COMMENT ON TABLE winter_org_reports IS 'Generated reports for organizations';
COMMENT ON FUNCTION get_effective_org_policy IS 'Get the effective policy config for an org/team/user';
COMMENT ON FUNCTION check_org_permission IS 'Check if a user has permission for a resource action';
COMMENT ON FUNCTION log_org_audit_event IS 'Log an audit event for organization actions';
