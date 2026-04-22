-- Custom Roles RBAC Migration
-- Epic B: Enterprise Identity - Custom roles beyond basic roles

-- =====================================================
-- Custom Roles Table
-- =====================================================
CREATE TABLE IF NOT EXISTS winter_org_custom_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Role definition
    name TEXT NOT NULL,
    description TEXT,
    base_role TEXT NOT NULL DEFAULT 'member',  -- Inherit from this role

    -- Permissions
    permissions JSONB NOT NULL DEFAULT '[]',
    /*
    Example:
    [
        {"resource": "memories", "actions": ["create", "read", "update"]},
        {"resource": "documents", "actions": ["read"]},
        {"resource": "api_keys", "actions": ["create", "read"]}
    ]
    */

    -- UI display
    color TEXT,  -- Hex color for badge
    icon TEXT,   -- Icon name

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_system BOOLEAN NOT NULL DEFAULT false,  -- System roles cannot be deleted

    -- Usage count
    member_count INTEGER NOT NULL DEFAULT 0,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    CONSTRAINT unique_role_name_per_org UNIQUE (organization_id, name),
    CONSTRAINT valid_base_role CHECK (
        base_role IN ('owner', 'admin', 'member', 'viewer')
    )
);

ALTER TABLE winter_org_custom_roles
    ADD COLUMN IF NOT EXISTS color TEXT,
    ADD COLUMN IF NOT EXISTS icon TEXT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS member_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_custom_roles_org ON winter_org_custom_roles(organization_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_custom_roles_base ON winter_org_custom_roles(base_role);

-- =====================================================
-- Role Assignments Table
-- Map users to custom roles (in addition to their org role)
-- =====================================================
CREATE TABLE IF NOT EXISTS winter_org_role_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    custom_role_id UUID NOT NULL REFERENCES winter_org_custom_roles(id) ON DELETE CASCADE,

    -- Assignment metadata
    assigned_by UUID REFERENCES auth.users(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Expiry (optional)
    expires_at TIMESTAMPTZ,

    -- Context (optional - for scoped assignments)
    context_type TEXT,  -- 'team', 'project', 'collection', etc.
    context_id UUID,

    -- Metadata
    reason TEXT,
    metadata JSONB DEFAULT '{}',

    CONSTRAINT unique_user_role_context UNIQUE (organization_id, user_id, custom_role_id, context_type, context_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_role_assignments_user ON winter_org_role_assignments(user_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_role_assignments_role ON winter_org_role_assignments(custom_role_id);
CREATE INDEX IF NOT EXISTS idx_role_assignments_context ON winter_org_role_assignments(context_type, context_id) WHERE context_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_role_assignments_expires ON winter_org_role_assignments(expires_at) WHERE expires_at IS NOT NULL;

-- =====================================================
-- Permission Templates Table
-- Pre-defined permission sets for quick role creation
-- =====================================================
CREATE TABLE IF NOT EXISTS winter_permission_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Template info
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    category TEXT,  -- 'data', 'admin', 'developer', 'analyst'

    -- Permissions
    permissions JSONB NOT NULL DEFAULT '[]',

    -- UI
    icon TEXT,
    color TEXT,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default permission templates
INSERT INTO winter_permission_templates (name, description, category, permissions, icon, color) VALUES
    (
        'Data Scientist',
        'Full access to memories and documents, read-only for settings',
        'analyst',
        '[
            {"resource": "memories", "actions": ["create", "read", "update", "delete", "export"]},
            {"resource": "documents", "actions": ["create", "read", "update", "delete", "export"]},
            {"resource": "collections", "actions": ["create", "read", "update", "delete"]},
            {"resource": "settings", "actions": ["read"]},
            {"resource": "reports", "actions": ["create", "read", "export"]}
        ]'::jsonb,
        'brain',
        '#8B5CF6'
    ),
    (
        'API Developer',
        'Manage API keys and webhooks, read data',
        'developer',
        '[
            {"resource": "memories", "actions": ["read"]},
            {"resource": "documents", "actions": ["read"]},
            {"resource": "api_keys", "actions": ["create", "read", "update", "delete"]},
            {"resource": "webhooks", "actions": ["create", "read", "update", "delete"]},
            {"resource": "settings", "actions": ["read"]}
        ]'::jsonb,
        'code',
        '#3B82F6'
    ),
    (
        'Content Manager',
        'Manage documents and collections, no memories access',
        'data',
        '[
            {"resource": "documents", "actions": ["create", "read", "update", "delete", "export", "import"]},
            {"resource": "collections", "actions": ["create", "read", "update", "delete"]},
            {"resource": "settings", "actions": ["read"]}
        ]'::jsonb,
        'file-text',
        '#10B981'
    ),
    (
        'Compliance Officer',
        'Read access to all data plus audit logs',
        'admin',
        '[
            {"resource": "memories", "actions": ["read"]},
            {"resource": "documents", "actions": ["read"]},
            {"resource": "collections", "actions": ["read"]},
            {"resource": "audit_logs", "actions": ["read", "export"]},
            {"resource": "policies", "actions": ["read"]},
            {"resource": "reports", "actions": ["read", "export"]},
            {"resource": "settings", "actions": ["read"]}
        ]'::jsonb,
        'shield',
        '#F59E0B'
    ),
    (
        'Support Agent',
        'Read-only access for troubleshooting',
        'admin',
        '[
            {"resource": "memories", "actions": ["read"]},
            {"resource": "documents", "actions": ["read"]},
            {"resource": "collections", "actions": ["read"]},
            {"resource": "members", "actions": ["read"]},
            {"resource": "audit_logs", "actions": ["read"]},
            {"resource": "settings", "actions": ["read"]}
        ]'::jsonb,
        'headphones',
        '#6366F1'
    ),
    (
        'Annotator',
        'Access annotation queues and provide feedback',
        'analyst',
        '[
            {"resource": "memories", "actions": ["read"]},
            {"resource": "documents", "actions": ["read"]},
            {"resource": "annotation_queues", "actions": ["read", "update"]},
            {"resource": "annotations", "actions": ["create", "read", "update"]}
        ]'::jsonb,
        'edit-3',
        '#EC4899'
    )
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- Helper Functions
-- =====================================================

-- Function to get all permissions for a user (org role + custom roles)
CREATE OR REPLACE FUNCTION get_user_permissions(
    p_org_id UUID,
    p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_org_role TEXT;
    v_permissions JSONB := '[]'::jsonb;
    v_custom_role RECORD;
BEGIN
    -- Get org role
    SELECT role INTO v_org_role
    FROM organization_members
    WHERE org_id = p_org_id AND user_id = p_user_id;

    IF v_org_role IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    -- Get custom role permissions
    FOR v_custom_role IN
        SELECT cr.permissions
        FROM winter_org_role_assignments ra
        JOIN winter_org_custom_roles cr ON ra.custom_role_id = cr.id
        WHERE ra.organization_id = p_org_id
          AND ra.user_id = p_user_id
          AND cr.is_active = true
          AND (ra.expires_at IS NULL OR ra.expires_at > NOW())
    LOOP
        v_permissions := v_permissions || v_custom_role.permissions;
    END LOOP;

    RETURN v_permissions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has a specific permission
CREATE OR REPLACE FUNCTION user_has_permission(
    p_org_id UUID,
    p_user_id UUID,
    p_resource TEXT,
    p_action TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_permissions JSONB;
    v_perm JSONB;
BEGIN
    v_permissions := get_user_permissions(p_org_id, p_user_id);

    -- Check if any permission grants the requested action on the resource
    FOR v_perm IN SELECT * FROM jsonb_array_elements(v_permissions)
    LOOP
        IF v_perm->>'resource' = p_resource
           AND v_perm->'actions' ? p_action THEN
            RETURN true;
        END IF;
    END LOOP;

    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update member_count on role assignments
CREATE OR REPLACE FUNCTION update_custom_role_member_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE winter_org_custom_roles
        SET member_count = member_count + 1
        WHERE id = NEW.custom_role_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE winter_org_custom_roles
        SET member_count = GREATEST(0, member_count - 1)
        WHERE id = OLD.custom_role_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_role_member_count
    AFTER INSERT OR DELETE ON winter_org_role_assignments
    FOR EACH ROW EXECUTE FUNCTION update_custom_role_member_count();

-- =====================================================
-- Row Level Security
-- =====================================================
ALTER TABLE winter_org_custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_org_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_permission_templates ENABLE ROW LEVEL SECURITY;

-- Custom roles: org members can view, admins can manage
CREATE POLICY custom_roles_select ON winter_org_custom_roles FOR SELECT
    USING (
        organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text)
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY custom_roles_insert ON winter_org_custom_roles FOR INSERT
    WITH CHECK (
        organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY custom_roles_update ON winter_org_custom_roles FOR UPDATE
    USING (
        organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY custom_roles_delete ON winter_org_custom_roles FOR DELETE
    USING (
        NOT is_system
        AND organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

-- Role assignments: admins can manage
CREATE POLICY role_assignments_select ON winter_org_role_assignments FOR SELECT
    USING (
        user_id = auth.uid()
        OR organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY role_assignments_insert ON winter_org_role_assignments FOR INSERT
    WITH CHECK (
        organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY role_assignments_delete ON winter_org_role_assignments FOR DELETE
    USING (
        organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

-- Permission templates: public read
CREATE POLICY permission_templates_select ON winter_permission_templates FOR SELECT
    USING (is_active = true);

-- =====================================================
-- Triggers for updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_gateway_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_custom_roles_updated_at
    BEFORE UPDATE ON winter_org_custom_roles
    FOR EACH ROW EXECUTE FUNCTION update_gateway_updated_at();

CREATE TRIGGER trigger_permission_templates_updated_at
    BEFORE UPDATE ON winter_permission_templates
    FOR EACH ROW EXECUTE FUNCTION update_gateway_updated_at();
