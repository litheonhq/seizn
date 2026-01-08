-- Organization/Team Management for Seizn B2B
-- Enables multi-user organizations with role-based access

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,

  -- Billing
  plan VARCHAR(20) NOT NULL DEFAULT 'team',
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),

  -- Limits (overridable per org)
  memory_limit INT NOT NULL DEFAULT 100000,
  api_calls_limit INT NOT NULL DEFAULT 100000,

  -- Settings
  settings JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Organization members
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Role: owner, admin, member
  role VARCHAR(20) NOT NULL DEFAULT 'member',

  -- Permissions (can override default role permissions)
  permissions JSONB DEFAULT '{}',

  -- Invite tracking
  invited_by TEXT REFERENCES profiles(id),
  invited_at TIMESTAMP WITH TIME ZONE,
  accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(organization_id, user_id)
);

-- Organization invites (pending invitations)
CREATE TABLE IF NOT EXISTS organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  invited_by TEXT NOT NULL REFERENCES profiles(id),
  token VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(organization_id, email)
);

-- Add organization_id to existing tables
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_invites_email ON organization_invites(email);
CREATE INDEX IF NOT EXISTS idx_org_invites_token ON organization_invites(token);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memories_org ON memories(organization_id) WHERE organization_id IS NOT NULL;

-- RLS Policies for organizations
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invites ENABLE ROW LEVEL SECURITY;

-- Organization access policy (members can view their orgs)
CREATE POLICY "Members can view their organizations"
  ON organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()::text
    )
  );

-- Only owners/admins can update org
CREATE POLICY "Admins can update organizations"
  ON organizations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()::text
      AND om.role IN ('owner', 'admin')
    )
  );

-- Organization members policies
CREATE POLICY "Members can view org members"
  ON organization_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_members.organization_id
      AND om.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Admins can manage org members"
  ON organization_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_members.organization_id
      AND om.user_id = auth.uid()::text
      AND om.role IN ('owner', 'admin')
    )
  );

-- Invite policies
CREATE POLICY "Admins can manage invites"
  ON organization_invites FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_invites.organization_id
      AND om.user_id = auth.uid()::text
      AND om.role IN ('owner', 'admin')
    )
  );

-- Function to create organization with owner
CREATE OR REPLACE FUNCTION create_organization(
  p_name VARCHAR(100),
  p_slug VARCHAR(50),
  p_owner_id TEXT
)
RETURNS UUID AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Create organization
  INSERT INTO organizations (name, slug)
  VALUES (p_name, p_slug)
  RETURNING id INTO v_org_id;

  -- Add owner
  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (v_org_id, p_owner_id, 'owner');

  RETURN v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check user's role in organization
CREATE OR REPLACE FUNCTION get_user_org_role(
  p_org_id UUID,
  p_user_id TEXT
)
RETURNS VARCHAR(20) AS $$
BEGIN
  RETURN (
    SELECT role FROM organization_members
    WHERE organization_id = p_org_id
    AND user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get organization usage stats
CREATE OR REPLACE FUNCTION get_organization_usage(
  p_org_id UUID,
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days'
)
RETURNS TABLE (
  total_api_calls BIGINT,
  total_memories BIGINT,
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  member_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM usage_logs WHERE organization_id = p_org_id AND created_at >= p_start_date),
    (SELECT COUNT(*) FROM memories WHERE organization_id = p_org_id AND is_deleted = false),
    (SELECT COALESCE(SUM(input_tokens), 0) FROM usage_logs WHERE organization_id = p_org_id AND created_at >= p_start_date),
    (SELECT COALESCE(SUM(output_tokens), 0) FROM usage_logs WHERE organization_id = p_org_id AND created_at >= p_start_date),
    (SELECT COUNT(*) FROM organization_members WHERE organization_id = p_org_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE organizations IS 'Organizations for B2B team management';
COMMENT ON TABLE organization_members IS 'Organization membership with roles';
COMMENT ON TABLE organization_invites IS 'Pending organization invitations';
