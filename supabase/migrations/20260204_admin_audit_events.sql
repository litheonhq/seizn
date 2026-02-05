-- Admin Audit Events Migration
-- Enterprise Security: SSO/SCIM/RBAC audit logging

-- =====================================================
-- Admin Audit Events Table
-- Tracks all administrative actions for compliance
-- =====================================================
CREATE TABLE IF NOT EXISTS admin_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Actor information
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_email TEXT,
    actor_role TEXT,
    actor_ip_address INET,
    actor_user_agent TEXT,

    -- Event classification
    event_category TEXT NOT NULL,  -- 'auth', 'sso', 'scim', 'rbac', 'api_key', 'policy', 'settings', 'data'
    event_type TEXT NOT NULL,      -- Specific event type within category
    event_severity TEXT NOT NULL DEFAULT 'info',  -- 'info', 'warning', 'critical'

    -- Event details
    resource_type TEXT,            -- Type of resource affected
    resource_id TEXT,              -- ID of resource affected
    resource_name TEXT,            -- Human-readable name
    action TEXT NOT NULL,          -- 'create', 'read', 'update', 'delete', 'login', 'logout', etc.

    -- Outcome
    success BOOLEAN NOT NULL DEFAULT true,
    error_code TEXT,
    error_message TEXT,

    -- Change tracking
    previous_state JSONB,          -- State before change
    new_state JSONB,               -- State after change
    changes JSONB,                 -- Diff of changes

    -- Context
    request_id TEXT,               -- Correlation ID for tracing
    session_id TEXT,               -- Session that triggered this event
    source TEXT,                   -- 'web', 'api', 'scim', 'system', 'cron'

    -- Metadata
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Indexes for common queries
    CONSTRAINT valid_event_category CHECK (
        event_category IN ('auth', 'sso', 'scim', 'rbac', 'api_key', 'policy', 'settings', 'data', 'billing', 'export')
    ),
    CONSTRAINT valid_event_severity CHECK (
        event_severity IN ('info', 'warning', 'critical')
    )
);

-- =====================================================
-- Indexes
-- =====================================================

-- Primary lookup indexes
CREATE INDEX idx_admin_audit_org_time ON admin_audit_events(organization_id, created_at DESC);
CREATE INDEX idx_admin_audit_actor ON admin_audit_events(actor_id, created_at DESC);
CREATE INDEX idx_admin_audit_category ON admin_audit_events(event_category, created_at DESC);
CREATE INDEX idx_admin_audit_type ON admin_audit_events(event_type, created_at DESC);
CREATE INDEX idx_admin_audit_resource ON admin_audit_events(resource_type, resource_id);
CREATE INDEX idx_admin_audit_severity ON admin_audit_events(event_severity) WHERE event_severity IN ('warning', 'critical');
CREATE INDEX idx_admin_audit_success ON admin_audit_events(success) WHERE success = false;
CREATE INDEX idx_admin_audit_request_id ON admin_audit_events(request_id) WHERE request_id IS NOT NULL;

-- Time-based partitioning index for retention
CREATE INDEX idx_admin_audit_created_at ON admin_audit_events(created_at DESC);

-- =====================================================
-- Pre-defined Event Types
-- =====================================================

-- Create an enum-like reference table for event types
CREATE TABLE IF NOT EXISTS admin_audit_event_types (
    category TEXT NOT NULL,
    event_type TEXT NOT NULL,
    description TEXT,
    severity_default TEXT NOT NULL DEFAULT 'info',
    PRIMARY KEY (category, event_type)
);

INSERT INTO admin_audit_event_types (category, event_type, description, severity_default) VALUES
    -- Auth events
    ('auth', 'login', 'User logged in', 'info'),
    ('auth', 'logout', 'User logged out', 'info'),
    ('auth', 'login_failed', 'Login attempt failed', 'warning'),
    ('auth', 'password_changed', 'User changed password', 'info'),
    ('auth', 'password_reset_requested', 'Password reset requested', 'info'),
    ('auth', 'password_reset_completed', 'Password reset completed', 'info'),
    ('auth', 'mfa_enabled', 'MFA enabled for user', 'info'),
    ('auth', 'mfa_disabled', 'MFA disabled for user', 'warning'),
    ('auth', 'mfa_challenge_failed', 'MFA challenge failed', 'warning'),
    ('auth', 'session_revoked', 'Session was revoked', 'info'),
    ('auth', 'session_expired', 'Session expired', 'info'),

    -- SSO events
    ('sso', 'sso_connection_created', 'SSO connection created', 'info'),
    ('sso', 'sso_connection_updated', 'SSO connection updated', 'info'),
    ('sso', 'sso_connection_deleted', 'SSO connection deleted', 'warning'),
    ('sso', 'sso_connection_enabled', 'SSO connection enabled', 'info'),
    ('sso', 'sso_connection_disabled', 'SSO connection disabled', 'warning'),
    ('sso', 'sso_login', 'User logged in via SSO', 'info'),
    ('sso', 'sso_login_failed', 'SSO login failed', 'warning'),
    ('sso', 'sso_domain_verified', 'SSO domain verified', 'info'),
    ('sso', 'sso_certificate_updated', 'SSO certificate updated', 'info'),

    -- SCIM events
    ('scim', 'scim_enabled', 'SCIM provisioning enabled', 'info'),
    ('scim', 'scim_disabled', 'SCIM provisioning disabled', 'warning'),
    ('scim', 'scim_token_generated', 'SCIM bearer token generated', 'info'),
    ('scim', 'scim_token_revoked', 'SCIM bearer token revoked', 'info'),
    ('scim', 'scim_user_provisioned', 'User provisioned via SCIM', 'info'),
    ('scim', 'scim_user_deprovisioned', 'User deprovisioned via SCIM', 'info'),
    ('scim', 'scim_user_updated', 'User updated via SCIM', 'info'),
    ('scim', 'scim_group_created', 'Group created via SCIM', 'info'),
    ('scim', 'scim_group_updated', 'Group updated via SCIM', 'info'),
    ('scim', 'scim_group_deleted', 'Group deleted via SCIM', 'info'),
    ('scim', 'scim_sync_started', 'SCIM sync started', 'info'),
    ('scim', 'scim_sync_completed', 'SCIM sync completed', 'info'),
    ('scim', 'scim_sync_failed', 'SCIM sync failed', 'critical'),

    -- RBAC events
    ('rbac', 'role_created', 'Custom role created', 'info'),
    ('rbac', 'role_updated', 'Role updated', 'info'),
    ('rbac', 'role_deleted', 'Role deleted', 'warning'),
    ('rbac', 'role_assigned', 'Role assigned to user', 'info'),
    ('rbac', 'role_revoked', 'Role revoked from user', 'info'),
    ('rbac', 'permission_granted', 'Permission granted', 'info'),
    ('rbac', 'permission_revoked', 'Permission revoked', 'info'),
    ('rbac', 'permission_denied', 'Permission check denied', 'warning'),

    -- API Key events
    ('api_key', 'api_key_created', 'API key created', 'info'),
    ('api_key', 'api_key_deleted', 'API key deleted', 'info'),
    ('api_key', 'api_key_rotated', 'API key rotated', 'info'),
    ('api_key', 'api_key_scopes_updated', 'API key scopes updated', 'info'),
    ('api_key', 'api_key_rate_limit_updated', 'API key rate limit updated', 'info'),
    ('api_key', 'api_key_used', 'API key used (sampled)', 'info'),
    ('api_key', 'api_key_blocked', 'API key blocked', 'warning'),

    -- Policy events
    ('policy', 'policy_created', 'Policy created', 'info'),
    ('policy', 'policy_updated', 'Policy updated', 'info'),
    ('policy', 'policy_deleted', 'Policy deleted', 'warning'),
    ('policy', 'policy_enabled', 'Policy enabled', 'info'),
    ('policy', 'policy_disabled', 'Policy disabled', 'warning'),
    ('policy', 'policy_violated', 'Policy violation detected', 'critical'),

    -- Settings events
    ('settings', 'org_settings_updated', 'Organization settings updated', 'info'),
    ('settings', 'security_settings_updated', 'Security settings updated', 'warning'),
    ('settings', 'retention_settings_updated', 'Retention settings updated', 'info'),
    ('settings', 'notification_settings_updated', 'Notification settings updated', 'info'),

    -- Data events
    ('data', 'data_exported', 'Data exported', 'info'),
    ('data', 'data_deleted', 'Data deleted', 'warning'),
    ('data', 'data_retention_applied', 'Data retention policy applied', 'info'),
    ('data', 'rtbf_requested', 'Right to be forgotten requested', 'info'),
    ('data', 'rtbf_completed', 'Right to be forgotten completed', 'info'),

    -- Billing events
    ('billing', 'plan_changed', 'Billing plan changed', 'info'),
    ('billing', 'payment_method_added', 'Payment method added', 'info'),
    ('billing', 'payment_method_removed', 'Payment method removed', 'info'),
    ('billing', 'invoice_generated', 'Invoice generated', 'info'),
    ('billing', 'payment_failed', 'Payment failed', 'critical'),

    -- Export events
    ('export', 'audit_log_exported', 'Audit log exported', 'info'),
    ('export', 'evidence_pack_generated', 'Evidence pack generated', 'info'),
    ('export', 'compliance_report_generated', 'Compliance report generated', 'info')
ON CONFLICT (category, event_type) DO NOTHING;

-- =====================================================
-- Row Level Security
-- =====================================================
ALTER TABLE admin_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_event_types ENABLE ROW LEVEL SECURITY;

-- Audit events: org admins can view, service role can insert
CREATE POLICY admin_audit_select ON admin_audit_events FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin')
        )
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY admin_audit_insert ON admin_audit_events FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin')
        )
    );

-- Event types: public read
CREATE POLICY admin_audit_event_types_select ON admin_audit_event_types FOR SELECT
    USING (true);

-- =====================================================
-- Helper Functions
-- =====================================================

-- Function to log an admin audit event
CREATE OR REPLACE FUNCTION log_admin_audit_event(
    p_organization_id UUID,
    p_actor_id UUID,
    p_event_category TEXT,
    p_event_type TEXT,
    p_action TEXT,
    p_resource_type TEXT DEFAULT NULL,
    p_resource_id TEXT DEFAULT NULL,
    p_resource_name TEXT DEFAULT NULL,
    p_success BOOLEAN DEFAULT true,
    p_error_message TEXT DEFAULT NULL,
    p_previous_state JSONB DEFAULT NULL,
    p_new_state JSONB DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_event_id UUID;
    v_severity TEXT;
    v_actor_email TEXT;
    v_changes JSONB;
BEGIN
    -- Get default severity for this event type
    SELECT severity_default INTO v_severity
    FROM admin_audit_event_types
    WHERE category = p_event_category AND event_type = p_event_type;

    IF v_severity IS NULL THEN
        v_severity := 'info';
    END IF;

    -- Escalate severity on failure
    IF NOT p_success THEN
        v_severity := CASE v_severity
            WHEN 'info' THEN 'warning'
            WHEN 'warning' THEN 'critical'
            ELSE v_severity
        END;
    END IF;

    -- Get actor email
    IF p_actor_id IS NOT NULL THEN
        SELECT email INTO v_actor_email
        FROM auth.users
        WHERE id = p_actor_id;
    END IF;

    -- Calculate changes if both states provided
    IF p_previous_state IS NOT NULL AND p_new_state IS NOT NULL THEN
        v_changes := jsonb_build_object(
            'added', (p_new_state - p_previous_state),
            'removed', (p_previous_state - p_new_state)
        );
    END IF;

    -- Insert audit event
    INSERT INTO admin_audit_events (
        organization_id,
        actor_id,
        actor_email,
        event_category,
        event_type,
        event_severity,
        resource_type,
        resource_id,
        resource_name,
        action,
        success,
        error_message,
        previous_state,
        new_state,
        changes,
        metadata
    ) VALUES (
        p_organization_id,
        p_actor_id,
        v_actor_email,
        p_event_category,
        p_event_type,
        v_severity,
        p_resource_type,
        p_resource_id,
        p_resource_name,
        p_action,
        p_success,
        p_error_message,
        p_previous_state,
        p_new_state,
        v_changes,
        p_metadata
    ) RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get audit events with filtering
CREATE OR REPLACE FUNCTION get_admin_audit_events(
    p_organization_id UUID,
    p_category TEXT DEFAULT NULL,
    p_event_type TEXT DEFAULT NULL,
    p_actor_id UUID DEFAULT NULL,
    p_resource_type TEXT DEFAULT NULL,
    p_resource_id TEXT DEFAULT NULL,
    p_severity TEXT DEFAULT NULL,
    p_success BOOLEAN DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
) RETURNS TABLE (
    id UUID,
    actor_id UUID,
    actor_email TEXT,
    event_category TEXT,
    event_type TEXT,
    event_severity TEXT,
    resource_type TEXT,
    resource_id TEXT,
    resource_name TEXT,
    action TEXT,
    success BOOLEAN,
    error_message TEXT,
    changes JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.actor_id,
        e.actor_email,
        e.event_category,
        e.event_type,
        e.event_severity,
        e.resource_type,
        e.resource_id,
        e.resource_name,
        e.action,
        e.success,
        e.error_message,
        e.changes,
        e.metadata,
        e.created_at
    FROM admin_audit_events e
    WHERE e.organization_id = p_organization_id
        AND (p_category IS NULL OR e.event_category = p_category)
        AND (p_event_type IS NULL OR e.event_type = p_event_type)
        AND (p_actor_id IS NULL OR e.actor_id = p_actor_id)
        AND (p_resource_type IS NULL OR e.resource_type = p_resource_type)
        AND (p_resource_id IS NULL OR e.resource_id = p_resource_id)
        AND (p_severity IS NULL OR e.event_severity = p_severity)
        AND (p_success IS NULL OR e.success = p_success)
        AND (p_start_date IS NULL OR e.created_at >= p_start_date)
        AND (p_end_date IS NULL OR e.created_at <= p_end_date)
    ORDER BY e.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get audit summary statistics
CREATE OR REPLACE FUNCTION get_admin_audit_summary(
    p_organization_id UUID,
    p_days INTEGER DEFAULT 30
) RETURNS TABLE (
    event_category TEXT,
    total_events BIGINT,
    success_count BIGINT,
    failure_count BIGINT,
    warning_count BIGINT,
    critical_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.event_category,
        COUNT(*)::BIGINT AS total_events,
        COUNT(*) FILTER (WHERE e.success = true)::BIGINT AS success_count,
        COUNT(*) FILTER (WHERE e.success = false)::BIGINT AS failure_count,
        COUNT(*) FILTER (WHERE e.event_severity = 'warning')::BIGINT AS warning_count,
        COUNT(*) FILTER (WHERE e.event_severity = 'critical')::BIGINT AS critical_count
    FROM admin_audit_events e
    WHERE e.organization_id = p_organization_id
        AND e.created_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY e.event_category
    ORDER BY total_events DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Comments
-- =====================================================
COMMENT ON TABLE admin_audit_events IS 'Comprehensive audit log for all administrative actions';
COMMENT ON COLUMN admin_audit_events.event_category IS 'Category: auth, sso, scim, rbac, api_key, policy, settings, data, billing, export';
COMMENT ON COLUMN admin_audit_events.event_severity IS 'Severity level: info, warning, critical';
COMMENT ON COLUMN admin_audit_events.previous_state IS 'State of resource before change (for compliance)';
COMMENT ON COLUMN admin_audit_events.new_state IS 'State of resource after change (for compliance)';
COMMENT ON COLUMN admin_audit_events.changes IS 'Computed diff between previous and new state';
