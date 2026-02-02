-- SCIM 2.0 User Provisioning Tables
-- RFC 7643 (Core Schema) and RFC 7644 (Protocol)

-- ============================================
-- SCIM Configuration Table
-- ============================================

CREATE TABLE IF NOT EXISTS scim_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash TEXT, -- SHA-256 hash of the bearer token
  base_url TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,

  -- Feature toggles
  sync_users BOOLEAN NOT NULL DEFAULT true,
  sync_groups BOOLEAN NOT NULL DEFAULT true,
  auto_provision BOOLEAN NOT NULL DEFAULT true,
  auto_deprovision BOOLEAN NOT NULL DEFAULT true,

  -- Role mapping
  default_role TEXT NOT NULL DEFAULT 'member',
  group_role_mapping JSONB DEFAULT '{}', -- Maps group IDs to roles
  group_to_org_mapping JSONB DEFAULT '{}', -- Maps group IDs to sub-orgs

  -- Audit
  created_by TEXT REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sync_at TIMESTAMPTZ,

  -- Constraints
  UNIQUE (organization_id)
);

-- Index for token lookup
CREATE INDEX idx_scim_configs_token ON scim_configs (organization_id, token_hash);

-- ============================================
-- SCIM Users Table
-- ============================================

CREATE TABLE IF NOT EXISTS scim_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scim_config_id UUID NOT NULL REFERENCES scim_configs(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES profiles(id), -- Link to actual user (may be null if not yet provisioned)

  -- SCIM attributes
  external_id TEXT, -- IdP's ID for this user
  user_name TEXT NOT NULL, -- Primary identifier (usually email)
  display_name TEXT,
  given_name TEXT,
  family_name TEXT,
  email TEXT,
  active BOOLEAN NOT NULL DEFAULT true,

  -- Raw attributes from IdP
  raw_attributes JSONB DEFAULT '{}',

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  UNIQUE (organization_id, scim_config_id, user_name),
  UNIQUE (organization_id, scim_config_id, external_id)
);

-- Indexes
CREATE INDEX idx_scim_users_org ON scim_users (organization_id, scim_config_id);
CREATE INDEX idx_scim_users_username ON scim_users (user_name);
CREATE INDEX idx_scim_users_email ON scim_users (email);
CREATE INDEX idx_scim_users_external_id ON scim_users (external_id);
CREATE INDEX idx_scim_users_linked ON scim_users (user_id) WHERE user_id IS NOT NULL;

-- ============================================
-- SCIM Groups Table
-- ============================================

CREATE TABLE IF NOT EXISTS scim_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scim_config_id UUID NOT NULL REFERENCES scim_configs(id) ON DELETE CASCADE,

  -- SCIM attributes
  external_id TEXT, -- IdP's ID for this group
  display_name TEXT NOT NULL,

  -- Mapping to Seizn structure
  mapped_org_id UUID REFERENCES organizations(id), -- Map group to sub-org
  mapped_role TEXT, -- Role for members of this group

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  UNIQUE (organization_id, scim_config_id, display_name),
  UNIQUE (organization_id, scim_config_id, external_id)
);

-- Indexes
CREATE INDEX idx_scim_groups_org ON scim_groups (organization_id, scim_config_id);
CREATE INDEX idx_scim_groups_external_id ON scim_groups (external_id);

-- ============================================
-- SCIM Group Memberships Table
-- ============================================

CREATE TABLE IF NOT EXISTS scim_group_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES scim_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES scim_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  UNIQUE (group_id, user_id)
);

-- Indexes
CREATE INDEX idx_scim_memberships_group ON scim_group_memberships (group_id);
CREATE INDEX idx_scim_memberships_user ON scim_group_memberships (user_id);

-- ============================================
-- SCIM Provisioning Events (Audit Log)
-- ============================================

CREATE TABLE IF NOT EXISTS scim_provisioning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES scim_configs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Event details
  event_type TEXT NOT NULL, -- user.created, user.updated, user.deleted, etc.
  resource_type TEXT NOT NULL, -- User or Group
  resource_id UUID NOT NULL,
  external_id TEXT,

  -- Change details
  changes JSONB DEFAULT '{}',

  -- Status
  status TEXT NOT NULL DEFAULT 'success', -- success, failed, pending
  error_message TEXT,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_scim_events_config ON scim_provisioning_events (config_id, created_at DESC);
CREATE INDEX idx_scim_events_org ON scim_provisioning_events (organization_id, created_at DESC);
CREATE INDEX idx_scim_events_type ON scim_provisioning_events (event_type, created_at DESC);
CREATE INDEX idx_scim_events_resource ON scim_provisioning_events (resource_type, resource_id);

-- ============================================
-- RLS Policies
-- ============================================

-- Enable RLS
ALTER TABLE scim_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scim_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE scim_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE scim_group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE scim_provisioning_events ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for API endpoints)
CREATE POLICY "Service role full access to scim_configs"
  ON scim_configs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to scim_users"
  ON scim_users FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to scim_groups"
  ON scim_groups FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to scim_group_memberships"
  ON scim_group_memberships FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to scim_provisioning_events"
  ON scim_provisioning_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Organization admins can view SCIM config
CREATE POLICY "Org admins can view scim_configs"
  ON scim_configs FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM organization_members om
      WHERE om.user_id = auth.uid()::text
      AND om.role IN ('admin', 'owner')
    )
  );

-- Organization admins can view SCIM users
CREATE POLICY "Org admins can view scim_users"
  ON scim_users FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM organization_members om
      WHERE om.user_id = auth.uid()::text
      AND om.role IN ('admin', 'owner')
    )
  );

-- Organization admins can view SCIM groups
CREATE POLICY "Org admins can view scim_groups"
  ON scim_groups FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM organization_members om
      WHERE om.user_id = auth.uid()::text
      AND om.role IN ('admin', 'owner')
    )
  );

-- Organization admins can view provisioning events
CREATE POLICY "Org admins can view scim_provisioning_events"
  ON scim_provisioning_events FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM organization_members om
      WHERE om.user_id = auth.uid()::text
      AND om.role IN ('admin', 'owner')
    )
  );

-- ============================================
-- Trigger for updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_scim_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scim_configs_updated_at
  BEFORE UPDATE ON scim_configs
  FOR EACH ROW EXECUTE FUNCTION update_scim_updated_at();

CREATE TRIGGER scim_users_updated_at
  BEFORE UPDATE ON scim_users
  FOR EACH ROW EXECUTE FUNCTION update_scim_updated_at();

CREATE TRIGGER scim_groups_updated_at
  BEFORE UPDATE ON scim_groups
  FOR EACH ROW EXECUTE FUNCTION update_scim_updated_at();

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE scim_configs IS 'SCIM 2.0 provisioning configuration per organization';
COMMENT ON TABLE scim_users IS 'Users provisioned via SCIM from IdP';
COMMENT ON TABLE scim_groups IS 'Groups provisioned via SCIM from IdP';
COMMENT ON TABLE scim_group_memberships IS 'Group membership associations';
COMMENT ON TABLE scim_provisioning_events IS 'Audit log of SCIM provisioning events';
