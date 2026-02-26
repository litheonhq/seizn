-- Security Fixes Migration
-- Addresses issues from Supabase Security Advisor

-- ============================================
-- 1. Fix dlq_statistics view (remove SECURITY DEFINER)
-- ============================================

-- Drop and recreate view without SECURITY DEFINER
DROP VIEW IF EXISTS dlq_statistics;

CREATE VIEW dlq_statistics AS
WITH failure_code_counts AS (
  SELECT
    user_id,
    COALESCE(failure_code, 'unknown') AS failure_code,
    COUNT(*) AS cnt
  FROM healing_dlq
  WHERE status = 'pending'
  GROUP BY user_id, COALESCE(failure_code, 'unknown')
),
failure_code_agg AS (
  SELECT
    user_id,
    jsonb_object_agg(failure_code, cnt) AS pending_by_failure_code
  FROM failure_code_counts
  GROUP BY user_id
)
SELECT
  d.user_id,
  COUNT(*) FILTER (WHERE d.status = 'pending') AS pending_count,
  COUNT(*) FILTER (WHERE d.status = 'retrying') AS retrying_count,
  COUNT(*) FILTER (WHERE d.status = 'resolved') AS resolved_count,
  COUNT(*) FILTER (WHERE d.status = 'archived') AS archived_count,
  COUNT(*) FILTER (WHERE d.status = 'discarded') AS discarded_count,
  COUNT(*) AS total_count,
  COUNT(*) FILTER (WHERE d.alert_sent = TRUE AND d.alert_acknowledged = FALSE) AS unacknowledged_alerts,
  MIN(d.created_at) FILTER (WHERE d.status = 'pending') AS oldest_pending_at,
  MAX(d.created_at) AS newest_entry_at,
  COALESCE(f.pending_by_failure_code, '{}'::jsonb) AS pending_by_failure_code
FROM healing_dlq d
LEFT JOIN failure_code_agg f ON f.user_id = d.user_id
GROUP BY d.user_id, f.pending_by_failure_code;

-- ============================================
-- 2. Fix SECURITY DEFINER functions - Add SET search_path
-- ============================================

-- DLQ Functions
CREATE OR REPLACE FUNCTION update_scim_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION move_job_to_dlq(
  p_job_id UUID,
  p_failure_reason TEXT,
  p_failure_code TEXT DEFAULT NULL,
  p_failure_details JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_job healing_jobs;
  v_dlq_id UUID;
BEGIN
  SELECT * INTO v_job
  FROM public.healing_jobs
  WHERE id = p_job_id AND status = 'failed';

  IF v_job IS NULL THEN
    RAISE EXCEPTION 'Job not found or not in failed state: %', p_job_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.healing_dlq WHERE original_job_id = p_job_id) THEN
    UPDATE public.healing_dlq
    SET
      failure_reason = p_failure_reason,
      failure_code = p_failure_code,
      failure_details = p_failure_details,
      updated_at = NOW()
    WHERE original_job_id = p_job_id
    RETURNING id INTO v_dlq_id;
    RETURN v_dlq_id;
  END IF;

  INSERT INTO public.healing_dlq (
    original_job_id, collection_id, user_id, org_id, job_type,
    target_issues, priority, failure_reason, failure_code, failure_details,
    original_retry_count, chunks_scanned, chunks_healed, chunks_failed,
    issues_found, actions_taken, errors, original_scheduled_at,
    original_started_at, original_failed_at, original_duration_ms,
    triggered_by, trigger_rule_id
  ) VALUES (
    v_job.id, v_job.collection_id, v_job.user_id, v_job.org_id,
    v_job.job_type, v_job.target_issues, v_job.priority,
    p_failure_reason, p_failure_code, p_failure_details,
    v_job.retry_count, v_job.chunks_scanned, v_job.chunks_healed,
    v_job.chunks_failed, v_job.issues_found, v_job.actions_taken,
    v_job.errors, v_job.scheduled_at, v_job.started_at,
    v_job.completed_at, v_job.actual_duration_ms,
    v_job.triggered_by, v_job.trigger_rule_id
  ) RETURNING id INTO v_dlq_id;

  RETURN v_dlq_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION retry_dlq_entry(
  p_dlq_id UUID,
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  v_dlq healing_dlq;
  v_new_job_id UUID;
BEGIN
  SELECT * INTO v_dlq
  FROM public.healing_dlq
  WHERE id = p_dlq_id AND user_id = p_user_id AND status = 'pending';

  IF v_dlq IS NULL THEN
    RAISE EXCEPTION 'DLQ entry not found or not retryable: %', p_dlq_id;
  END IF;

  IF v_dlq.dlq_retry_count >= v_dlq.max_dlq_retries THEN
    RAISE EXCEPTION 'DLQ entry has exceeded max retries: %', p_dlq_id;
  END IF;

  UPDATE public.healing_dlq
  SET status = 'retrying', dlq_retry_count = dlq_retry_count + 1,
      last_retry_at = NOW(), updated_at = NOW()
  WHERE id = p_dlq_id;

  INSERT INTO public.healing_jobs (
    collection_id, user_id, org_id, job_type, target_issues,
    priority, status, triggered_by, trigger_rule_id, retry_count, max_retries
  ) VALUES (
    v_dlq.collection_id, v_dlq.user_id, v_dlq.org_id, v_dlq.job_type,
    v_dlq.target_issues, v_dlq.priority, 'queued', 'manual',
    v_dlq.trigger_rule_id, 0, 3
  ) RETURNING id INTO v_new_job_id;

  RETURN v_new_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION resolve_dlq_entry(
  p_dlq_id UUID,
  p_user_id UUID,
  p_resolution_notes TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'resolved'
) RETURNS VOID AS $$
BEGIN
  IF p_status NOT IN ('resolved', 'archived', 'discarded') THEN
    RAISE EXCEPTION 'Invalid resolution status: %', p_status;
  END IF;

  UPDATE public.healing_dlq
  SET status = p_status, resolution_notes = p_resolution_notes,
      resolved_by = p_user_id, resolved_at = NOW(), updated_at = NOW()
  WHERE id = p_dlq_id AND user_id = p_user_id AND status IN ('pending', 'retrying');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DLQ entry not found or already resolved: %', p_dlq_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION acknowledge_dlq_alert(
  p_dlq_id UUID,
  p_user_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE public.healing_dlq
  SET alert_acknowledged = TRUE, alert_acknowledged_at = NOW(),
      alert_acknowledged_by = p_user_id, updated_at = NOW()
  WHERE id = p_dlq_id AND user_id = p_user_id
    AND alert_sent = TRUE AND alert_acknowledged = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DLQ entry not found or already acknowledged: %', p_dlq_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_dlq_stats(p_user_id UUID)
RETURNS TABLE (
  pending_count BIGINT,
  retrying_count BIGINT,
  resolved_count BIGINT,
  archived_count BIGINT,
  discarded_count BIGINT,
  total_count BIGINT,
  unacknowledged_alerts BIGINT,
  oldest_pending_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'retrying'),
    COUNT(*) FILTER (WHERE status = 'resolved'),
    COUNT(*) FILTER (WHERE status = 'archived'),
    COUNT(*) FILTER (WHERE status = 'discarded'),
    COUNT(*),
    COUNT(*) FILTER (WHERE alert_sent = TRUE AND alert_acknowledged = FALSE),
    MIN(created_at) FILTER (WHERE status = 'pending')
  FROM public.healing_dlq
  WHERE public.healing_dlq.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- SSO Functions
CREATE OR REPLACE FUNCTION find_sso_connection_by_email(p_email TEXT)
RETURNS TABLE (
  connection_id UUID,
  organization_id UUID,
  idp_type TEXT,
  metadata_url TEXT,
  login_url TEXT
) AS $$
DECLARE
  v_domain TEXT;
BEGIN
  v_domain := split_part(p_email, '@', 2);

  RETURN QUERY
  SELECT
    s.id as connection_id,
    s.organization_id,
    s.idp_type,
    s.metadata_url,
    s.login_url
  FROM public.sso_connections s
  WHERE s.status = 'active'
    AND s.email_domain = v_domain
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION generate_sp_entity_id(p_org_id UUID)
RETURNS TEXT AS $$
BEGIN
  RETURN 'https://seizn.com/saml/metadata/' || p_org_id::text;
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION generate_sp_acs_url(p_org_id UUID)
RETURNS TEXT AS $$
BEGIN
  RETURN 'https://seizn.com/api/auth/saml/callback/' || p_org_id::text;
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION create_sso_connection(
  p_org_id UUID,
  p_idp_type TEXT,
  p_metadata_url TEXT,
  p_email_domain TEXT,
  p_created_by TEXT
) RETURNS UUID AS $$
DECLARE
  v_connection_id UUID;
BEGIN
  INSERT INTO public.sso_connections (
    organization_id, idp_type, metadata_url, email_domain,
    status, created_by
  ) VALUES (
    p_org_id, p_idp_type, p_metadata_url, p_email_domain,
    'pending', p_created_by
  )
  RETURNING id INTO v_connection_id;

  RETURN v_connection_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION update_sso_connection_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- API Key Functions
CREATE OR REPLACE FUNCTION validate_api_key_scope_config()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.scope_config IS NOT NULL THEN
    IF NOT (NEW.scope_config->>'level' IN ('user', 'organization', 'project')) THEN
      RAISE EXCEPTION 'Invalid scope level: %. Must be user, organization, or project',
        NEW.scope_config->>'level';
    END IF;

    IF NEW.scope_config->'actions' IS NULL OR
       jsonb_array_length(NEW.scope_config->'actions') = 0 THEN
      RAISE EXCEPTION 'At least one action is required in scope_config';
    END IF;

    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(NEW.scope_config->'actions') AS action
      WHERE action NOT IN ('read', 'write', 'admin')
    ) THEN
      RAISE EXCEPTION 'Invalid action in scope_config. Must be read, write, or admin';
    END IF;

    IF NEW.scope_config->>'level' = 'organization' AND
       (NEW.scope_config->>'organizationId' IS NULL OR
        NEW.scope_config->>'organizationId' = '') THEN
      RAISE EXCEPTION 'Organization scope requires organizationId';
    END IF;

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
$$ LANGUAGE plpgsql SET search_path = public;

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
  SELECT * INTO v_key
  FROM public.api_keys
  WHERE id = p_key_id AND is_active = true;

  IF v_key IS NULL THEN
    RETURN jsonb_build_object('allowed', FALSE, 'reason', 'API key not found or inactive');
  END IF;

  IF v_key.expires_at IS NOT NULL AND v_key.expires_at < NOW() THEN
    RETURN jsonb_build_object('allowed', FALSE, 'reason', 'API key has expired');
  END IF;

  IF v_key.ip_restriction IS NOT NULL AND p_client_ip IS NOT NULL THEN
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

  v_scope_level := COALESCE(v_key.scope_config->>'level', 'user');
  SELECT ARRAY_AGG(action) INTO v_actions
  FROM jsonb_array_elements_text(COALESCE(v_key.scope_config->'actions', '["write"]'::jsonb)) AS action;

  IF v_scope_level = 'organization' THEN
    IF p_org_id IS NOT NULL AND
       (v_key.scope_config->>'organizationId')::UUID != p_org_id THEN
      RETURN jsonb_build_object(
        'allowed', FALSE, 'reason', 'API key is scoped to a different organization',
        'scopeLevel', v_scope_level
      );
    END IF;
  ELSIF v_scope_level = 'project' THEN
    IF p_org_id IS NOT NULL AND
       (v_key.scope_config->>'organizationId')::UUID != p_org_id THEN
      RETURN jsonb_build_object(
        'allowed', FALSE, 'reason', 'API key is scoped to a different organization',
        'scopeLevel', v_scope_level
      );
    END IF;
    IF p_project_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_key.scope_config->'projectIds') AS pid
      WHERE pid::UUID = p_project_id
    ) THEN
      RETURN jsonb_build_object(
        'allowed', FALSE, 'reason', 'API key is not scoped to this project',
        'scopeLevel', v_scope_level
      );
    END IF;
  END IF;

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

  IF 'write' = ANY(v_actions) OR 'admin' = ANY(v_actions) THEN
    v_action_permissions := ARRAY[
      'collection:create', 'collection:update', 'document:create', 'document:update',
      'memory:create', 'memory:update', 'webhook:create', 'webhook:update'
    ];
    IF p_permission = ANY(v_action_permissions) THEN
      v_allowed := TRUE;
      v_reason := 'Permission granted by write action';
    END IF;
  END IF;

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

  IF v_key.scope_config->'customPermissions' IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_key.scope_config->'customPermissions') AS perm
      WHERE perm = p_permission
    ) THEN
      v_allowed := TRUE;
      v_reason := 'Permission granted by custom override';
    END IF;
  END IF;

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
    'allowed', v_allowed, 'reason', v_reason,
    'scopeLevel', v_scope_level, 'actions', v_actions, 'ipCheckPassed', TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_api_key_permissions(p_key_id UUID)
RETURNS TEXT[] AS $$
DECLARE
  v_key RECORD;
  v_permissions TEXT[] := '{}';
  v_actions TEXT[];
BEGIN
  SELECT * INTO v_key
  FROM public.api_keys
  WHERE id = p_key_id AND is_active = true;

  IF v_key IS NULL THEN
    RETURN '{}';
  END IF;

  SELECT ARRAY_AGG(action) INTO v_actions
  FROM jsonb_array_elements_text(COALESCE(v_key.scope_config->'actions', '["write"]'::jsonb)) AS action;

  IF 'read' = ANY(v_actions) OR 'write' = ANY(v_actions) OR 'admin' = ANY(v_actions) THEN
    v_permissions := v_permissions || ARRAY[
      'team:view', 'member:view', 'collection:view', 'collection:search',
      'document:view', 'memory:view', 'memory:search', 'settings:view', 'webhook:view'
    ];
  END IF;

  IF 'write' = ANY(v_actions) OR 'admin' = ANY(v_actions) THEN
    v_permissions := v_permissions || ARRAY[
      'collection:create', 'collection:update', 'document:create', 'document:update',
      'memory:create', 'memory:update', 'webhook:create', 'webhook:update'
    ];
  END IF;

  IF 'admin' = ANY(v_actions) THEN
    v_permissions := v_permissions || ARRAY[
      'team:update', 'member:invite', 'member:remove', 'member:update_role',
      'api_key:view', 'api_key:create', 'api_key:delete',
      'collection:delete', 'document:delete', 'memory:delete',
      'settings:update', 'audit_log:view', 'webhook:delete'
    ];
  END IF;

  IF v_key.scope_config->'customPermissions' IS NOT NULL THEN
    SELECT v_permissions || ARRAY_AGG(perm) INTO v_permissions
    FROM jsonb_array_elements_text(v_key.scope_config->'customPermissions') AS perm;
  END IF;

  IF v_key.scope_config->'deniedPermissions' IS NOT NULL THEN
    SELECT ARRAY_AGG(p) INTO v_permissions
    FROM unnest(v_permissions) AS p
    WHERE p NOT IN (
      SELECT perm FROM jsonb_array_elements_text(v_key.scope_config->'deniedPermissions') AS perm
    );
  END IF;

  RETURN COALESCE(v_permissions, '{}');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION audit_api_key_scope_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND
     (OLD.scope_config IS DISTINCT FROM NEW.scope_config OR
      OLD.ip_restriction IS DISTINCT FROM NEW.ip_restriction) THEN
    INSERT INTO public.audit_logs (
      user_id, organization_id, action, resource_type, resource_id,
      details, previous_state, new_state, status
    ) VALUES (
      NEW.user_id, NEW.organization_id,
      'api_key.scope_change', 'api_key', NEW.id,
      jsonb_build_object('key_prefix', NEW.key_prefix),
      jsonb_build_object('scope_config', OLD.scope_config, 'ip_restriction', OLD.ip_restriction),
      jsonb_build_object('scope_config', NEW.scope_config, 'ip_restriction', NEW.ip_restriction),
      'success'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Data Residency Functions
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
  SELECT role INTO v_user_role
  FROM public.organization_members
  WHERE organization_id = p_org_id AND user_id = p_user_id;

  IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions to change region');
  END IF;

  SELECT data_region, region_locked INTO v_current_region, v_is_locked
  FROM public.organizations WHERE id = p_org_id;

  IF v_current_region IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Organization not found');
  END IF;

  IF v_is_locked THEN
    RETURN jsonb_build_object('success', false, 'error', 'Region is locked. Contact support to unlock.');
  END IF;

  IF v_current_region = p_new_region THEN
    RETURN jsonb_build_object('success', false, 'error', 'Organization is already in this region');
  END IF;

  IF p_new_region NOT IN ('us-east', 'us-west', 'eu-west', 'eu-central', 'ap-northeast', 'ap-southeast') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid region code');
  END IF;

  INSERT INTO public.organization_region_history (
    organization_id, from_region, to_region, reason, changed_by, change_type
  ) VALUES (p_org_id, v_current_region, p_new_region, p_reason, p_user_id, 'user_initiated');

  UPDATE public.organizations
  SET data_region = p_new_region, region_changed_at = NOW(), updated_at = NOW()
  WHERE id = p_org_id;

  RETURN jsonb_build_object('success', true, 'previous_region', v_current_region, 'new_region', p_new_region);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION lock_organization_region(
  p_org_id UUID,
  p_user_id TEXT,
  p_lock BOOLEAN DEFAULT true
)
RETURNS JSONB AS $$
DECLARE
  v_user_role VARCHAR(20);
BEGIN
  SELECT role INTO v_user_role
  FROM public.organization_members
  WHERE organization_id = p_org_id AND user_id = p_user_id;

  IF v_user_role IS NULL OR v_user_role != 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only organization owner can lock/unlock region');
  END IF;

  UPDATE public.organizations
  SET region_locked = p_lock, updated_at = NOW()
  WHERE id = p_org_id;

  RETURN jsonb_build_object('success', true, 'locked', p_lock);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_org_id AND user_id = p_user_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT h.id, h.from_region, h.to_region, h.reason, h.change_type, h.created_at
  FROM public.organization_region_history h
  WHERE h.organization_id = p_org_id
  ORDER BY h.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION log_region_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.data_region IS DISTINCT FROM NEW.data_region THEN
    INSERT INTO public.audit_logs (
      user_id, action, resource_type, resource_id, details, ip_address
    ) VALUES (
      COALESCE(auth.uid()::text, 'system'),
      'region_changed', 'organization', NEW.id::text,
      jsonb_build_object('from_region', OLD.data_region, 'to_region', NEW.data_region, 'organization_name', NEW.name),
      inet_client_addr()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Healing/Health Functions
CREATE OR REPLACE FUNCTION update_healing_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================
-- 3. Move vector extension to extensions schema
-- ============================================

-- Create extensions schema if not exists
CREATE SCHEMA IF NOT EXISTS extensions;

-- Grant usage to necessary roles
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Note: Moving the vector extension requires recreating dependent objects
-- This is commented out to prevent data loss - should be done manually with care
-- ALTER EXTENSION vector SET SCHEMA extensions;

-- ============================================
-- 4. Service Role RLS Policies Note
-- ============================================
-- The "Service role full access" policies with USING(true) are intentional
-- and correct for service_role. They allow backend services to bypass RLS
-- when using the service_role key. This is the expected pattern in Supabase.
-- No changes needed for these policies.

-- ============================================
-- 5. Comments
-- ============================================
COMMENT ON FUNCTION move_job_to_dlq IS 'Moves a failed job to the DLQ with failure details (search_path secured)';
COMMENT ON FUNCTION retry_dlq_entry IS 'Retries a DLQ entry by creating a new job (search_path secured)';
COMMENT ON FUNCTION check_api_key_permission IS 'Check if an API key has a specific permission (search_path secured)';
COMMENT ON FUNCTION change_organization_region IS 'Change organization data region (search_path secured)';
