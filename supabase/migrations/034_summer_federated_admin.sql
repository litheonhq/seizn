-- Summer Federated Admin: Permissions + Access Control + Audit
-- Adds granular permission system for federated source management

-- 1) Access Control table for federated sources
CREATE TABLE IF NOT EXISTS summer_federated_source_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES summer_federated_sources(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT,

  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
  granted_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT source_access_target_check CHECK (organization_id IS NOT NULL OR user_id IS NOT NULL)
);

-- Indexes for access control
CREATE INDEX idx_federated_source_access_source ON summer_federated_source_access(source_id);
CREATE INDEX idx_federated_source_access_org ON summer_federated_source_access(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_federated_source_access_user ON summer_federated_source_access(user_id) WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX idx_federated_source_access_org_unique
ON summer_federated_source_access(source_id, organization_id)
WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX idx_federated_source_access_user_unique
ON summer_federated_source_access(source_id, user_id)
WHERE user_id IS NOT NULL;

-- 2) Admin metadata columns on summer_federated_sources
ALTER TABLE summer_federated_sources
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS created_by TEXT,
ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'failed'));

-- 3) Admin metadata columns on summer_federated_bindings
ALTER TABLE summer_federated_bindings
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS created_by TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- 4) Federated operation logs (extends audit_logs patterns)
CREATE TABLE IF NOT EXISTS summer_federated_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

  operation TEXT NOT NULL CHECK (operation IN (
    'source.create', 'source.update', 'source.delete', 'source.verify',
    'binding.create', 'binding.update', 'binding.delete', 'binding.sync',
    'access.grant', 'access.revoke', 'access.update',
    'search.execute', 'search.error'
  )),

  resource_type TEXT NOT NULL CHECK (resource_type IN ('source', 'binding', 'access', 'search')),
  resource_id UUID,

  details JSONB NOT NULL DEFAULT '{}',
  previous_state JSONB,
  new_state JSONB,

  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'denied')),
  error_message TEXT,

  ip_address TEXT,
  user_agent TEXT,
  request_id TEXT,

  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for operation logs
CREATE INDEX idx_federated_operations_user ON summer_federated_operations(user_id);
CREATE INDEX idx_federated_operations_org ON summer_federated_operations(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_federated_operations_created ON summer_federated_operations(created_at DESC);
CREATE INDEX idx_federated_operations_operation ON summer_federated_operations(operation);
CREATE INDEX idx_federated_operations_resource ON summer_federated_operations(resource_type, resource_id);

-- 5) RLS Policies

ALTER TABLE summer_federated_source_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE summer_federated_operations ENABLE ROW LEVEL SECURITY;

-- Source access policies
CREATE POLICY "Users can view their own access grants"
  ON summer_federated_source_access FOR SELECT
  USING (user_id = auth.uid()::TEXT OR granted_by = auth.uid()::TEXT);

CREATE POLICY "Source owners and org admins can manage access"
  ON summer_federated_source_access FOR ALL
  USING (
    -- Check if user is source owner
    EXISTS (
      SELECT 1 FROM summer_federated_sources s
      WHERE s.id = summer_federated_source_access.source_id
      AND s.user_id = auth.uid()::TEXT
    )
    OR
    -- Check if user is org admin with access to this source
    EXISTS (
      SELECT 1 FROM organization_members om
      JOIN summer_federated_source_access sfa ON sfa.organization_id = om.organization_id
      WHERE sfa.source_id = summer_federated_source_access.source_id
      AND om.user_id = auth.uid()::TEXT
      AND om.role IN ('owner', 'admin')
    )
  );

-- Operation log policies
CREATE POLICY "Users can view their own operation logs"
  ON summer_federated_operations FOR SELECT
  USING (user_id = auth.uid()::TEXT);

CREATE POLICY "Org admins can view org operation logs"
  ON summer_federated_operations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = summer_federated_operations.organization_id
      AND om.user_id = auth.uid()::TEXT
      AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Service role can insert operation logs"
  ON summer_federated_operations FOR INSERT
  WITH CHECK (true);

-- 6) Helper function to check federated permissions
CREATE OR REPLACE FUNCTION check_federated_permission(
  p_user_id TEXT,
  p_source_id UUID,
  p_required_role TEXT DEFAULT 'viewer'
) RETURNS BOOLEAN AS $$
DECLARE
  v_user_role TEXT;
  v_is_owner BOOLEAN;
BEGIN
  -- Check if user is source owner
  SELECT EXISTS (
    SELECT 1 FROM summer_federated_sources
    WHERE id = p_source_id AND user_id = p_user_id
  ) INTO v_is_owner;

  IF v_is_owner THEN
    RETURN TRUE;
  END IF;

  -- Check direct user access
  SELECT role INTO v_user_role
  FROM summer_federated_source_access
  WHERE source_id = p_source_id AND user_id = p_user_id;

  IF v_user_role IS NOT NULL THEN
    RETURN CASE p_required_role
      WHEN 'viewer' THEN TRUE
      WHEN 'editor' THEN v_user_role IN ('editor', 'owner')
      WHEN 'owner' THEN v_user_role = 'owner'
      ELSE FALSE
    END;
  END IF;

  -- Check org-based access
  SELECT COALESCE(MAX(
    CASE sfa.role
      WHEN 'owner' THEN 3
      WHEN 'editor' THEN 2
      WHEN 'viewer' THEN 1
      ELSE 0
    END
  ), 0)
  FROM summer_federated_source_access sfa
  JOIN organization_members om ON om.organization_id = sfa.organization_id
  WHERE sfa.source_id = p_source_id
  AND om.user_id = p_user_id
  INTO v_user_role;

  IF v_user_role IS NOT NULL THEN
    RETURN CASE p_required_role
      WHEN 'viewer' THEN v_user_role::INT >= 1
      WHEN 'editor' THEN v_user_role::INT >= 2
      WHEN 'owner' THEN v_user_role::INT >= 3
      ELSE FALSE
    END;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE summer_federated_source_access IS 'Access control for federated sources - grants user/org access to manage sources';
COMMENT ON TABLE summer_federated_operations IS 'Audit log for all federated operations - sources, bindings, access changes';
COMMENT ON FUNCTION check_federated_permission IS 'Check if user has required permission level for a federated source';
