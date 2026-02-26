-- RBAC (Role-Based Access Control) Enhancements
-- Migration: 20260123_005_rbac_enhancements.sql
--
-- Extends organization_members with:
-- - viewer role support (already in place)
-- - Enhanced permission checking functions
-- - Additional audit log actions

-- ===========================================
-- 1) Ensure viewer role is supported
-- ===========================================

-- The role column in organization_members already supports:
-- owner, admin, member, viewer (as TEXT without enum constraint)

-- Add comment to clarify role hierarchy
COMMENT ON COLUMN organization_members.role IS
'User role in organization: owner (all permissions), admin (manage except delete org), member (create/view), viewer (read-only)';

-- ===========================================
-- 2) Enhanced Permission Checking Function
-- ===========================================

-- Drop existing function if exists to recreate with updated logic
DROP FUNCTION IF EXISTS check_org_permission_v2(UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION check_org_permission_v2(
  p_org_id UUID,
  p_user_id TEXT,
  p_permission TEXT,
  p_resource_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_member RECORD;
  v_allowed BOOLEAN := FALSE;
  v_reason TEXT := 'Permission denied';
BEGIN
  -- Get user's membership
  SELECT role, permissions INTO v_member
  FROM organization_members
  WHERE organization_id = p_org_id
    AND user_id = p_user_id
    AND (status IS NULL OR status = 'active');

  IF v_member IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'reason', 'User is not a member of this organization'
    );
  END IF;

  -- Check custom permission override first
  IF v_member.permissions IS NOT NULL AND
     v_member.permissions ? p_permission THEN
    v_allowed := (v_member.permissions->>p_permission)::boolean;
    v_reason := CASE
      WHEN v_allowed THEN 'Granted by custom permission'
      ELSE 'Denied by custom permission'
    END;

    RETURN jsonb_build_object(
      'allowed', v_allowed,
      'role', v_member.role,
      'reason', v_reason
    );
  END IF;

  -- Check role-based permissions
  v_allowed := CASE v_member.role
    WHEN 'owner' THEN TRUE
    WHEN 'admin' THEN p_permission NOT LIKE 'team:delete%' AND p_permission NOT LIKE 'billing:update%'
    WHEN 'member' THEN p_permission IN (
      'team:view', 'member:view', 'collection:view', 'collection:search',
      'document:create', 'document:view', 'memory:create', 'memory:view',
      'memory:search', 'settings:view', 'api_key:view', 'webhook:view'
    )
    WHEN 'viewer' THEN p_permission IN (
      'team:view', 'member:view', 'collection:view', 'collection:search',
      'document:view', 'memory:view', 'memory:search', 'settings:view'
    )
    ELSE FALSE
  END;

  v_reason := CASE
    WHEN v_allowed THEN 'Granted by role: ' || v_member.role
    ELSE 'Permission not available for role: ' || v_member.role
  END;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'role', v_member.role,
    'reason', v_reason
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 3) Batch Permission Check Function
-- ===========================================

CREATE OR REPLACE FUNCTION check_org_permissions_batch(
  p_user_id TEXT,
  p_checks JSONB -- Array of {org_id, permission}
)
RETURNS JSONB AS $$
DECLARE
  v_check RECORD;
  v_results JSONB := '[]'::JSONB;
  v_result JSONB;
BEGIN
  FOR v_check IN SELECT * FROM jsonb_array_elements(p_checks) AS check_item
  LOOP
    v_result := check_org_permission_v2(
      (v_check.check_item->>'org_id')::UUID,
      p_user_id,
      v_check.check_item->>'permission'
    );

    v_results := v_results || jsonb_build_object(
      'org_id', v_check.check_item->>'org_id',
      'permission', v_check.check_item->>'permission',
      'result', v_result
    );
  END LOOP;

  RETURN v_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 4) Get User Permissions Function
-- ===========================================

CREATE OR REPLACE FUNCTION get_user_org_permissions(
  p_org_id UUID,
  p_user_id TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_member RECORD;
  v_base_permissions TEXT[];
  v_custom_permissions JSONB;
  v_final_permissions TEXT[] := '{}';
  v_perm TEXT;
BEGIN
  -- Get user's membership
  SELECT role, permissions INTO v_member
  FROM organization_members
  WHERE organization_id = p_org_id
    AND user_id = p_user_id
    AND (status IS NULL OR status = 'active');

  IF v_member IS NULL THEN
    RETURN jsonb_build_object(
      'permissions', '[]'::JSONB,
      'role', NULL
    );
  END IF;

  -- Get base permissions for role
  v_base_permissions := CASE v_member.role
    WHEN 'owner' THEN ARRAY[
      'team:delete', 'team:update', 'team:view',
      'member:invite', 'member:remove', 'member:update_role', 'member:view',
      'api_key:create', 'api_key:delete', 'api_key:view',
      'collection:create', 'collection:delete', 'collection:update', 'collection:view', 'collection:search',
      'document:create', 'document:delete', 'document:update', 'document:view',
      'memory:create', 'memory:delete', 'memory:update', 'memory:view', 'memory:search',
      'settings:update', 'settings:view',
      'billing:view', 'billing:update',
      'audit_log:view',
      'webhook:create', 'webhook:delete', 'webhook:update', 'webhook:view'
    ]
    WHEN 'admin' THEN ARRAY[
      'team:update', 'team:view',
      'member:invite', 'member:remove', 'member:update_role', 'member:view',
      'api_key:create', 'api_key:delete', 'api_key:view',
      'collection:create', 'collection:delete', 'collection:update', 'collection:view', 'collection:search',
      'document:create', 'document:delete', 'document:update', 'document:view',
      'memory:create', 'memory:delete', 'memory:update', 'memory:view', 'memory:search',
      'settings:update', 'settings:view',
      'billing:view',
      'audit_log:view',
      'webhook:create', 'webhook:delete', 'webhook:update', 'webhook:view'
    ]
    WHEN 'member' THEN ARRAY[
      'team:view',
      'member:view',
      'api_key:view',
      'collection:view', 'collection:search',
      'document:create', 'document:view',
      'memory:create', 'memory:view', 'memory:search',
      'settings:view',
      'webhook:view'
    ]
    WHEN 'viewer' THEN ARRAY[
      'team:view',
      'member:view',
      'collection:view', 'collection:search',
      'document:view',
      'memory:view', 'memory:search',
      'settings:view'
    ]
    ELSE '{}'
  END;

  -- Apply custom permission overrides
  v_custom_permissions := COALESCE(v_member.permissions, '{}'::JSONB);
  v_final_permissions := v_base_permissions;

  -- Add granted custom permissions
  FOR v_perm IN SELECT key FROM jsonb_each(v_custom_permissions) WHERE (v_custom_permissions->>key)::boolean = TRUE
  LOOP
    IF NOT v_perm = ANY(v_final_permissions) THEN
      v_final_permissions := array_append(v_final_permissions, v_perm);
    END IF;
  END LOOP;

  -- Remove denied custom permissions
  FOR v_perm IN SELECT key FROM jsonb_each(v_custom_permissions) WHERE (v_custom_permissions->>key)::boolean = FALSE
  LOOP
    v_final_permissions := array_remove(v_final_permissions, v_perm);
  END LOOP;

  RETURN jsonb_build_object(
    'permissions', to_jsonb(v_final_permissions),
    'role', v_member.role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 5) Audit Log for Role Changes
-- ===========================================

CREATE OR REPLACE FUNCTION audit_member_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO audit_logs (
      user_id, organization_id, action, resource_type, resource_id,
      details, previous_state, new_state, status
    ) VALUES (
      NEW.user_id, NEW.organization_id,
      'member.role_change', 'organization_member', NEW.id,
      jsonb_build_object('member_user_id', NEW.user_id),
      jsonb_build_object('role', OLD.role),
      jsonb_build_object('role', NEW.role),
      'success'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_audit_member_role_change ON organization_members;
CREATE TRIGGER trigger_audit_member_role_change
  AFTER UPDATE ON organization_members
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION audit_member_role_change();

-- ===========================================
-- 6) Audit Log Retention Index
-- ===========================================

-- Index for efficient audit log queries with date range
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_date_range
  ON audit_logs(organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;

-- Index for action filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type
  ON audit_logs(action, resource_type);

-- ===========================================
-- 7) Comments
-- ===========================================

COMMENT ON FUNCTION check_org_permission_v2 IS
'Check if a user has a specific permission in an organization with detailed result';

COMMENT ON FUNCTION check_org_permissions_batch IS
'Check multiple permissions across organizations in a single call';

COMMENT ON FUNCTION get_user_org_permissions IS
'Get all effective permissions for a user in an organization';

COMMENT ON FUNCTION audit_member_role_change IS
'Automatically log role changes in organization members';
