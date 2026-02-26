-- Scoped API Keys Enhancement
-- Migration: 20260202_003_scoped_api_keys.sql
--
-- Adds fine-grained access control for API keys:
-- - Scope configuration (user/organization/project level)
-- - Action-based permissions (read/write/admin)
-- - IP range restrictions
-- - Rate limit overrides

-- ===========================================
-- 1) Add new columns to api_keys table
-- ===========================================

-- Scope configuration (JSON)
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS scope_config JSONB DEFAULT '{
  "level": "user",
  "actions": ["write"]
}'::jsonb;

-- IP restriction configuration (JSON)
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS ip_restriction JSONB;

-- Rate limit override (requests per minute)
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS rate_limit_override INTEGER;

-- Description for documentation
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS description TEXT;

-- Additional metadata
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- ===========================================
-- 2) Add indexes for scope-based queries
-- ===========================================

-- Index for organization-scoped keys
CREATE INDEX IF NOT EXISTS idx_api_keys_scope_org
  ON api_keys ((scope_config->>'organizationId'))
  WHERE scope_config->>'organizationId' IS NOT NULL;

-- Index for scope level queries
CREATE INDEX IF NOT EXISTS idx_api_keys_scope_level
  ON api_keys ((scope_config->>'level'));

-- Index for active keys with scopes
CREATE INDEX IF NOT EXISTS idx_api_keys_active_scoped
  ON api_keys (user_id, is_active, created_at DESC)
  WHERE is_active = true;

-- ===========================================
-- 3) Validation function for scope config
-- ===========================================

CREATE OR REPLACE FUNCTION validate_api_key_scope_config()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate scope level
  IF NEW.scope_config IS NOT NULL THEN
    IF NOT (NEW.scope_config->>'level' IN ('user', 'organization', 'project')) THEN
      RAISE EXCEPTION 'Invalid scope level: %. Must be user, organization, or project',
        NEW.scope_config->>'level';
    END IF;

    -- Validate actions array exists and is not empty
    IF NEW.scope_config->'actions' IS NULL OR
       jsonb_array_length(NEW.scope_config->'actions') = 0 THEN
      RAISE EXCEPTION 'At least one action is required in scope_config';
    END IF;

    -- Validate action values
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(NEW.scope_config->'actions') AS action
      WHERE action NOT IN ('read', 'write', 'admin')
    ) THEN
      RAISE EXCEPTION 'Invalid action in scope_config. Must be read, write, or admin';
    END IF;

    -- Organization scope requires organizationId
    IF NEW.scope_config->>'level' = 'organization' AND
       (NEW.scope_config->>'organizationId' IS NULL OR
        NEW.scope_config->>'organizationId' = '') THEN
      RAISE EXCEPTION 'Organization scope requires organizationId';
    END IF;

    -- Project scope requires organizationId and projectIds
    IF NEW.scope_config->>'level' = 'project' THEN
      IF NEW.scope_config->>'organizationId' IS NULL OR
         NEW.scope_config->>'organizationId' = '' THEN
        RAISE EXCEPTION 'Project scope requires organizationId';
      END IF;
      IF NEW.scope_config->'projectIds' IS NULL OR
         jsonb_array_length(NEW.scope_config->'projectIds') = 0 THEN
        RAISE EXCEPTION 'Project scope requires at least one projectId';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_api_key_scope ON api_keys;
CREATE TRIGGER validate_api_key_scope
  BEFORE INSERT OR UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION validate_api_key_scope_config();

-- ===========================================
-- 4) Function to check scoped permissions
-- ===========================================

CREATE OR REPLACE FUNCTION check_api_key_permission(
  p_key_id UUID,
  p_permission TEXT,
  p_org_id UUID DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_client_ip TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_key RECORD;
  v_scope_level TEXT;
  v_actions TEXT[];
  v_allowed BOOLEAN := FALSE;
  v_reason TEXT;
  v_action_permissions TEXT[];
BEGIN
  -- Fetch the key
  SELECT * INTO v_key
  FROM api_keys
  WHERE id = p_key_id AND is_active = true;

  IF v_key IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'reason', 'API key not found or inactive'
    );
  END IF;

  -- Check expiration
  IF v_key.expires_at IS NOT NULL AND v_key.expires_at < NOW() THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'reason', 'API key has expired'
    );
  END IF;

  -- Check IP restriction
  IF v_key.ip_restriction IS NOT NULL AND p_client_ip IS NOT NULL THEN
    -- If allowedIps is specified and not empty, check if IP is in list
    IF v_key.ip_restriction->'allowedIps' IS NOT NULL AND
       jsonb_array_length(v_key.ip_restriction->'allowedIps') > 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(v_key.ip_restriction->'allowedIps') AS ip
        WHERE p_client_ip LIKE REPLACE(REPLACE(ip, '.', '\.'), '*', '%')
      ) THEN
        IF (v_key.ip_restriction->>'enforce')::boolean IS NOT FALSE THEN
          RETURN jsonb_build_object(
            'allowed', FALSE,
            'reason', 'IP address not allowed: ' || p_client_ip,
            'ipCheckPassed', FALSE
          );
        END IF;
      END IF;
    END IF;
  END IF;

  -- Get scope configuration
  v_scope_level := COALESCE(v_key.scope_config->>'level', 'user');
  SELECT ARRAY_AGG(action) INTO v_actions
  FROM jsonb_array_elements_text(COALESCE(v_key.scope_config->'actions', '["write"]'::jsonb)) AS action;

  -- Check scope constraints
  IF v_scope_level = 'organization' THEN
    IF p_org_id IS NOT NULL AND
       (v_key.scope_config->>'organizationId')::UUID != p_org_id THEN
      RETURN jsonb_build_object(
        'allowed', FALSE,
        'reason', 'API key is scoped to a different organization',
        'scopeLevel', v_scope_level
      );
    END IF;
  ELSIF v_scope_level = 'project' THEN
    IF p_org_id IS NOT NULL AND
       (v_key.scope_config->>'organizationId')::UUID != p_org_id THEN
      RETURN jsonb_build_object(
        'allowed', FALSE,
        'reason', 'API key is scoped to a different organization',
        'scopeLevel', v_scope_level
      );
    END IF;
    IF p_project_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_key.scope_config->'projectIds') AS pid
      WHERE pid::UUID = p_project_id
    ) THEN
      RETURN jsonb_build_object(
        'allowed', FALSE,
        'reason', 'API key is not scoped to this project',
        'scopeLevel', v_scope_level
      );
    END IF;
  END IF;

  -- Define permission mappings for each action level
  -- Read permissions
  IF 'read' = ANY(v_actions) OR 'write' = ANY(v_actions) OR 'admin' = ANY(v_actions) THEN
    v_action_permissions := ARRAY[
      'team:view', 'member:view', 'collection:view', 'collection:search',
      'document:view', 'memory:view', 'memory:search', 'settings:view', 'webhook:view'
    ];
    IF p_permission = ANY(v_action_permissions) THEN
      v_allowed := TRUE;
      v_reason := 'Permission granted by read action';
    END IF;
  END IF;

  -- Write permissions (includes read)
  IF 'write' = ANY(v_actions) OR 'admin' = ANY(v_actions) THEN
    v_action_permissions := ARRAY[
      'collection:create', 'collection:update',
      'document:create', 'document:update',
      'memory:create', 'memory:update',
      'webhook:create', 'webhook:update'
    ];
    IF p_permission = ANY(v_action_permissions) THEN
      v_allowed := TRUE;
      v_reason := 'Permission granted by write action';
    END IF;
  END IF;

  -- Admin permissions (includes write and read)
  IF 'admin' = ANY(v_actions) THEN
    v_action_permissions := ARRAY[
      'team:update', 'member:invite', 'member:remove', 'member:update_role',
      'api_key:view', 'api_key:create', 'api_key:delete',
      'collection:delete', 'document:delete', 'memory:delete',
      'settings:update', 'audit_log:view', 'webhook:delete'
    ];
    IF p_permission = ANY(v_action_permissions) THEN
      v_allowed := TRUE;
      v_reason := 'Permission granted by admin action';
    END IF;
  END IF;

  -- Check custom permissions override
  IF v_key.scope_config->'customPermissions' IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_key.scope_config->'customPermissions') AS perm
      WHERE perm = p_permission
    ) THEN
      v_allowed := TRUE;
      v_reason := 'Permission granted by custom override';
    END IF;
  END IF;

  -- Check denied permissions override
  IF v_key.scope_config->'deniedPermissions' IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_key.scope_config->'deniedPermissions') AS perm
      WHERE perm = p_permission
    ) THEN
      v_allowed := FALSE;
      v_reason := 'Permission explicitly denied';
    END IF;
  END IF;

  IF NOT v_allowed AND v_reason IS NULL THEN
    v_reason := 'Permission not granted by API key scope';
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'reason', v_reason,
    'scopeLevel', v_scope_level,
    'actions', v_actions,
    'ipCheckPassed', TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 5) Function to get effective permissions
-- ===========================================

CREATE OR REPLACE FUNCTION get_api_key_permissions(p_key_id UUID)
RETURNS TEXT[] AS $$
DECLARE
  v_key RECORD;
  v_permissions TEXT[] := '{}';
  v_actions TEXT[];
BEGIN
  SELECT * INTO v_key
  FROM api_keys
  WHERE id = p_key_id AND is_active = true;

  IF v_key IS NULL THEN
    RETURN '{}';
  END IF;

  SELECT ARRAY_AGG(action) INTO v_actions
  FROM jsonb_array_elements_text(COALESCE(v_key.scope_config->'actions', '["write"]'::jsonb)) AS action;

  -- Read permissions
  IF 'read' = ANY(v_actions) OR 'write' = ANY(v_actions) OR 'admin' = ANY(v_actions) THEN
    v_permissions := v_permissions || ARRAY[
      'team:view', 'member:view', 'collection:view', 'collection:search',
      'document:view', 'memory:view', 'memory:search', 'settings:view', 'webhook:view'
    ];
  END IF;

  -- Write permissions
  IF 'write' = ANY(v_actions) OR 'admin' = ANY(v_actions) THEN
    v_permissions := v_permissions || ARRAY[
      'collection:create', 'collection:update',
      'document:create', 'document:update',
      'memory:create', 'memory:update',
      'webhook:create', 'webhook:update'
    ];
  END IF;

  -- Admin permissions
  IF 'admin' = ANY(v_actions) THEN
    v_permissions := v_permissions || ARRAY[
      'team:update', 'member:invite', 'member:remove', 'member:update_role',
      'api_key:view', 'api_key:create', 'api_key:delete',
      'collection:delete', 'document:delete', 'memory:delete',
      'settings:update', 'audit_log:view', 'webhook:delete'
    ];
  END IF;

  -- Add custom permissions
  IF v_key.scope_config->'customPermissions' IS NOT NULL THEN
    SELECT v_permissions || ARRAY_AGG(perm) INTO v_permissions
    FROM jsonb_array_elements_text(v_key.scope_config->'customPermissions') AS perm;
  END IF;

  -- Remove denied permissions
  IF v_key.scope_config->'deniedPermissions' IS NOT NULL THEN
    SELECT ARRAY_AGG(p) INTO v_permissions
    FROM unnest(v_permissions) AS p
    WHERE p NOT IN (
      SELECT perm FROM jsonb_array_elements_text(v_key.scope_config->'deniedPermissions') AS perm
    );
  END IF;

  RETURN COALESCE(v_permissions, '{}');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 6) Audit logging for scoped key operations
-- ===========================================

CREATE OR REPLACE FUNCTION audit_api_key_scope_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND
     (OLD.scope_config IS DISTINCT FROM NEW.scope_config OR
      OLD.ip_restriction IS DISTINCT FROM NEW.ip_restriction) THEN
    INSERT INTO audit_logs (
      user_id, organization_id, action, resource_type, resource_id,
      details, previous_state, new_state, status
    ) VALUES (
      NEW.user_id, NEW.organization_id,
      'api_key.scope_change', 'api_key', NEW.id,
      jsonb_build_object('key_prefix', NEW.key_prefix),
      jsonb_build_object(
        'scope_config', OLD.scope_config,
        'ip_restriction', OLD.ip_restriction
      ),
      jsonb_build_object(
        'scope_config', NEW.scope_config,
        'ip_restriction', NEW.ip_restriction
      ),
      'success'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_audit_api_key_scope ON api_keys;
CREATE TRIGGER trigger_audit_api_key_scope
  AFTER UPDATE ON api_keys
  FOR EACH ROW
  WHEN (OLD.scope_config IS DISTINCT FROM NEW.scope_config OR
        OLD.ip_restriction IS DISTINCT FROM NEW.ip_restriction)
  EXECUTE FUNCTION audit_api_key_scope_change();

-- ===========================================
-- 7) Update existing keys with default scope
-- ===========================================

-- Set default scope config for existing keys that don't have one
UPDATE api_keys
SET scope_config = jsonb_build_object(
  'level', 'user',
  'actions', ARRAY['write']::text[]
)
WHERE scope_config IS NULL;

-- ===========================================
-- 8) Comments
-- ===========================================

COMMENT ON COLUMN api_keys.scope_config IS
'JSON configuration for API key scope: {level: "user"|"organization"|"project", organizationId?: string, projectIds?: string[], actions: ("read"|"write"|"admin")[], customPermissions?: string[], deniedPermissions?: string[]}';

COMMENT ON COLUMN api_keys.ip_restriction IS
'JSON configuration for IP restrictions: {allowedIps?: string[], blockedIps?: string[], enforce?: boolean}';

COMMENT ON COLUMN api_keys.rate_limit_override IS
'Custom rate limit (requests per minute) for this key. NULL uses default plan limit.';

COMMENT ON FUNCTION check_api_key_permission IS
'Check if an API key has a specific permission within its scope constraints';

COMMENT ON FUNCTION get_api_key_permissions IS
'Get all effective permissions for an API key based on its scope configuration';
