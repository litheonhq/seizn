-- Data Residency Regions for Seizn Organizations
-- Enables per-organization data residency selection for compliance

-- ============================================
-- Add region column to organizations
-- ============================================

-- Add region column with default
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS data_region VARCHAR(20) NOT NULL DEFAULT 'us-east';

-- Add constraint for valid region codes
ALTER TABLE organizations
ADD CONSTRAINT chk_organizations_data_region
CHECK (data_region IN ('us-east', 'us-west', 'eu-west', 'eu-central', 'ap-northeast', 'ap-southeast'));

-- Add region_locked flag (prevents accidental changes)
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS region_locked BOOLEAN NOT NULL DEFAULT false;

-- Add region_changed_at for audit
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS region_changed_at TIMESTAMP WITH TIME ZONE;

-- ============================================
-- Region change history for compliance
-- ============================================

CREATE TABLE IF NOT EXISTS organization_region_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Region change details
  from_region VARCHAR(20),
  to_region VARCHAR(20) NOT NULL,
  reason VARCHAR(500),

  -- Change metadata
  changed_by TEXT NOT NULL REFERENCES profiles(id),
  change_type VARCHAR(20) NOT NULL DEFAULT 'user_initiated',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add constraint for valid change types
ALTER TABLE organization_region_history
ADD CONSTRAINT chk_region_history_change_type
CHECK (change_type IN ('initial_setup', 'user_initiated', 'admin_migration', 'compliance_requirement'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_region_history_org
ON organization_region_history(organization_id);

CREATE INDEX IF NOT EXISTS idx_org_region_history_created
ON organization_region_history(created_at DESC);

-- ============================================
-- Profiles default region preference
-- ============================================

-- Add default region preference to profiles (for new orgs)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS default_region VARCHAR(20) DEFAULT 'us-east';

-- Add constraint
ALTER TABLE profiles
ADD CONSTRAINT chk_profiles_default_region
CHECK (default_region IS NULL OR default_region IN ('us-east', 'us-west', 'eu-west', 'eu-central', 'ap-northeast', 'ap-southeast'));

-- ============================================
-- Functions
-- ============================================

-- Function to change organization region (with validation)
CREATE OR REPLACE FUNCTION change_organization_region(
  p_org_id UUID,
  p_user_id TEXT,
  p_new_region VARCHAR(20),
  p_reason VARCHAR(500) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_current_region VARCHAR(20);
  v_is_locked BOOLEAN;
  v_user_role VARCHAR(20);
BEGIN
  -- Check user is owner or admin
  SELECT role INTO v_user_role
  FROM organization_members
  WHERE organization_id = p_org_id AND user_id = p_user_id;

  IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient permissions to change region'
    );
  END IF;

  -- Get current region and lock status
  SELECT data_region, region_locked INTO v_current_region, v_is_locked
  FROM organizations
  WHERE id = p_org_id;

  IF v_current_region IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Organization not found'
    );
  END IF;

  -- Check if region is locked
  IF v_is_locked THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Region is locked. Contact support to unlock.'
    );
  END IF;

  -- Check if already in target region
  IF v_current_region = p_new_region THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Organization is already in this region'
    );
  END IF;

  -- Validate new region
  IF p_new_region NOT IN ('us-east', 'us-west', 'eu-west', 'eu-central', 'ap-northeast', 'ap-southeast') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid region code'
    );
  END IF;

  -- Record history
  INSERT INTO organization_region_history (
    organization_id, from_region, to_region, reason, changed_by, change_type
  ) VALUES (
    p_org_id, v_current_region, p_new_region, p_reason, p_user_id, 'user_initiated'
  );

  -- Update organization
  UPDATE organizations
  SET
    data_region = p_new_region,
    region_changed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_org_id;

  RETURN jsonb_build_object(
    'success', true,
    'previous_region', v_current_region,
    'new_region', p_new_region
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to lock region (admin only)
CREATE OR REPLACE FUNCTION lock_organization_region(
  p_org_id UUID,
  p_user_id TEXT,
  p_lock BOOLEAN DEFAULT true
)
RETURNS JSONB AS $$
DECLARE
  v_user_role VARCHAR(20);
BEGIN
  -- Check user is owner
  SELECT role INTO v_user_role
  FROM organization_members
  WHERE organization_id = p_org_id AND user_id = p_user_id;

  IF v_user_role IS NULL OR v_user_role != 'owner' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only organization owner can lock/unlock region'
    );
  END IF;

  UPDATE organizations
  SET
    region_locked = p_lock,
    updated_at = NOW()
  WHERE id = p_org_id;

  RETURN jsonb_build_object(
    'success', true,
    'locked', p_lock
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get region history
CREATE OR REPLACE FUNCTION get_organization_region_history(
  p_org_id UUID,
  p_user_id TEXT,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  from_region VARCHAR(20),
  to_region VARCHAR(20),
  reason VARCHAR(500),
  change_type VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  -- Check user is member
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id AND user_id = p_user_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    h.id,
    h.from_region,
    h.to_region,
    h.reason,
    h.change_type,
    h.created_at
  FROM organization_region_history h
  WHERE h.organization_id = p_org_id
  ORDER BY h.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RLS Policies
-- ============================================

ALTER TABLE organization_region_history ENABLE ROW LEVEL SECURITY;

-- Members can view region history
CREATE POLICY "Members can view region history"
  ON organization_region_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_region_history.organization_id
      AND om.user_id = auth.uid()::text
    )
  );

-- ============================================
-- Audit log integration
-- ============================================

-- Trigger to log region changes to audit_logs
CREATE OR REPLACE FUNCTION log_region_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.data_region IS DISTINCT FROM NEW.data_region THEN
    INSERT INTO audit_logs (
      user_id,
      action,
      resource_type,
      resource_id,
      details,
      ip_address
    ) VALUES (
      COALESCE(auth.uid()::text, 'system'),
      'region_changed',
      'organization',
      NEW.id::text,
      jsonb_build_object(
        'from_region', OLD.data_region,
        'to_region', NEW.data_region,
        'organization_name', NEW.name
      ),
      inet_client_addr()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_log_region_change
  AFTER UPDATE OF data_region ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION log_region_change();

-- ============================================
-- Comments
-- ============================================

COMMENT ON COLUMN organizations.data_region IS 'Data residency region for this organization';
COMMENT ON COLUMN organizations.region_locked IS 'If true, region cannot be changed without admin intervention';
COMMENT ON COLUMN organizations.region_changed_at IS 'Timestamp of last region change';
COMMENT ON TABLE organization_region_history IS 'Audit trail of all region changes for compliance';
COMMENT ON COLUMN profiles.default_region IS 'Default region preference for new organizations';
