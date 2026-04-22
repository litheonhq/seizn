-- License System Migration
-- Epic C: Self-Hosted - License keys and feature flags

-- =====================================================
-- License Keys Table
-- For self-hosted enterprise deployments
-- =====================================================
CREATE TABLE IF NOT EXISTS license_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- License identification
    license_key TEXT NOT NULL UNIQUE,
    license_key_hash TEXT NOT NULL UNIQUE,  -- SHA256 hash for verification

    -- Customer information
    customer_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT,

    -- License type
    license_type TEXT NOT NULL DEFAULT 'enterprise',  -- 'trial', 'starter', 'professional', 'enterprise', 'unlimited'

    -- Validity period
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ NOT NULL,

    -- Usage limits
    max_users INTEGER,  -- NULL = unlimited
    max_memory_gb INTEGER,  -- Memory storage limit
    max_requests_per_month BIGINT,  -- API request limit
    max_traces_per_month BIGINT,  -- Trace storage limit

    -- Feature flags (what features are enabled)
    features JSONB NOT NULL DEFAULT '{}',
    /*
    Example:
    {
        "sso": true,
        "scim": true,
        "audit_logs": true,
        "custom_roles": true,
        "data_residency": true,
        "advanced_analytics": true,
        "priority_support": true,
        "white_label": false,
        "air_gapped": false
    }
    */

    -- Deployment restrictions
    deployment_type TEXT NOT NULL DEFAULT 'cloud',  -- 'cloud', 'self_hosted', 'air_gapped'
    allowed_domains TEXT[],  -- Restrict to specific domains
    allowed_ips INET[],  -- Restrict to specific IPs

    -- Hardware fingerprint (for self-hosted)
    hardware_id TEXT,  -- Machine fingerprint
    max_instances INTEGER DEFAULT 1,

    -- Status
    status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'suspended', 'expired', 'revoked'
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,

    -- Metadata
    notes TEXT,
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_license_type CHECK (
        license_type IN ('trial', 'starter', 'professional', 'enterprise', 'unlimited')
    ),
    CONSTRAINT valid_deployment_type CHECK (
        deployment_type IN ('cloud', 'self_hosted', 'air_gapped')
    ),
    CONSTRAINT valid_status CHECK (
        status IN ('active', 'suspended', 'expired', 'revoked')
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_license_keys_customer ON license_keys(customer_id);
CREATE INDEX IF NOT EXISTS idx_license_keys_status ON license_keys(status, valid_until);
CREATE INDEX IF NOT EXISTS idx_license_keys_hash ON license_keys(license_key_hash);

-- =====================================================
-- License Activations Table
-- Track where licenses are activated
-- =====================================================
CREATE TABLE IF NOT EXISTS license_activations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID NOT NULL REFERENCES license_keys(id) ON DELETE CASCADE,

    -- Instance identification
    instance_id TEXT NOT NULL,  -- Unique instance identifier
    hardware_fingerprint TEXT,  -- Machine fingerprint
    hostname TEXT,
    ip_address INET,

    -- Version information
    product_version TEXT,
    build_number TEXT,

    -- Activation details
    activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_heartbeat_at TIMESTAMPTZ,
    deactivated_at TIMESTAMPTZ,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    CONSTRAINT unique_license_instance UNIQUE (license_id, instance_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_license_activations_license ON license_activations(license_id, is_active);
CREATE INDEX IF NOT EXISTS idx_license_activations_heartbeat ON license_activations(last_heartbeat_at) WHERE is_active = true;

-- =====================================================
-- Feature Flags Table
-- Runtime feature flags (separate from license)
-- =====================================================
CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Flag identification
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    category TEXT,  -- 'experimental', 'beta', 'ga', 'deprecated'

    -- Flag type
    flag_type TEXT NOT NULL DEFAULT 'boolean',  -- 'boolean', 'percentage', 'json', 'string'

    -- Default value
    default_value JSONB NOT NULL DEFAULT 'false',

    -- Targeting rules
    rules JSONB DEFAULT '[]',
    /*
    Example:
    [
        {
            "condition": {"org_id": {"$in": ["org1", "org2"]}},
            "value": true
        },
        {
            "condition": {"user_role": {"$eq": "admin"}},
            "value": true
        },
        {
            "condition": {"random": {"$lt": 0.1}},
            "value": true,
            "description": "10% rollout"
        }
    ]
    */

    -- Status
    is_enabled BOOLEAN NOT NULL DEFAULT true,

    -- Metadata
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    CONSTRAINT valid_flag_type CHECK (
        flag_type IN ('boolean', 'percentage', 'json', 'string', 'number')
    )
);

ALTER TABLE feature_flags
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS flag_type TEXT NOT NULL DEFAULT 'boolean',
    ADD COLUMN IF NOT EXISTS default_value JSONB NOT NULL DEFAULT 'false',
    ADD COLUMN IF NOT EXISTS rules JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Index for flag lookups
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags(is_enabled) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_feature_flags_category ON feature_flags(category);

-- =====================================================
-- Feature Flag Overrides Table
-- Per-org or per-user flag overrides
-- =====================================================
CREATE TABLE IF NOT EXISTS feature_flag_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_id UUID NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,

    -- Target (one of these should be set)
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Override value
    value JSONB NOT NULL,

    -- Expiry
    expires_at TIMESTAMPTZ,

    -- Audit
    reason TEXT,
    created_by UUID REFERENCES auth.users(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT one_target_required CHECK (
        (org_id IS NOT NULL AND user_id IS NULL) OR
        (org_id IS NULL AND user_id IS NOT NULL)
    ),
    CONSTRAINT unique_flag_override UNIQUE (flag_id, org_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_flag_overrides_org ON feature_flag_overrides(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_flag_overrides_user ON feature_flag_overrides(user_id) WHERE user_id IS NOT NULL;

-- =====================================================
-- License Usage Tracking Table
-- =====================================================
CREATE TABLE IF NOT EXISTS license_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID NOT NULL REFERENCES license_keys(id) ON DELETE CASCADE,

    -- Period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Usage metrics
    active_users INTEGER NOT NULL DEFAULT 0,
    memory_used_gb NUMERIC(10,2) NOT NULL DEFAULT 0,
    api_requests BIGINT NOT NULL DEFAULT 0,
    traces_stored BIGINT NOT NULL DEFAULT 0,

    -- Peak usage
    peak_users INTEGER NOT NULL DEFAULT 0,
    peak_memory_gb NUMERIC(10,2) NOT NULL DEFAULT 0,

    -- Alerts
    over_limit_users BOOLEAN NOT NULL DEFAULT false,
    over_limit_memory BOOLEAN NOT NULL DEFAULT false,
    over_limit_requests BOOLEAN NOT NULL DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_license_period UNIQUE (license_id, period_start)
);

-- Index for usage lookups
CREATE INDEX IF NOT EXISTS idx_license_usage_license ON license_usage(license_id, period_start DESC);

-- =====================================================
-- Helper Functions
-- =====================================================

-- Function to validate license key
CREATE OR REPLACE FUNCTION validate_license_key(p_license_key TEXT)
RETURNS JSONB AS $$
DECLARE
    v_license license_keys;
    v_activation_count INTEGER;
BEGIN
    -- Hash the key for lookup
    SELECT * INTO v_license
    FROM license_keys
    WHERE license_key_hash = encode(sha256(p_license_key::bytea), 'hex')
      AND status = 'active'
      AND valid_from <= NOW()
      AND valid_until > NOW();

    IF v_license IS NULL THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'License key not found or expired'
        );
    END IF;

    -- Check activation count
    SELECT COUNT(*) INTO v_activation_count
    FROM license_activations
    WHERE license_id = v_license.id
      AND is_active = true;

    IF v_license.max_instances IS NOT NULL AND v_activation_count >= v_license.max_instances THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'Maximum activations reached',
            'max_instances', v_license.max_instances,
            'current_activations', v_activation_count
        );
    END IF;

    RETURN jsonb_build_object(
        'valid', true,
        'license_id', v_license.id,
        'customer_id', v_license.customer_id,
        'customer_name', v_license.customer_name,
        'license_type', v_license.license_type,
        'valid_until', v_license.valid_until,
        'features', v_license.features,
        'max_users', v_license.max_users,
        'max_memory_gb', v_license.max_memory_gb,
        'deployment_type', v_license.deployment_type
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get feature flag value
CREATE OR REPLACE FUNCTION get_feature_flag(
    p_flag_name TEXT,
    p_org_id UUID DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_context JSONB DEFAULT '{}'
) RETURNS JSONB AS $$
DECLARE
    v_flag feature_flags;
    v_override feature_flag_overrides;
    v_result JSONB;
BEGIN
    -- Get flag definition
    SELECT * INTO v_flag
    FROM feature_flags
    WHERE name = p_flag_name
      AND is_enabled = true;

    IF v_flag IS NULL THEN
        -- Flag not found, return null
        RETURN NULL;
    END IF;

    -- Check for user override first
    IF p_user_id IS NOT NULL THEN
        SELECT * INTO v_override
        FROM feature_flag_overrides
        WHERE flag_id = v_flag.id
          AND user_id = p_user_id
          AND (expires_at IS NULL OR expires_at > NOW());

        IF v_override IS NOT NULL THEN
            RETURN v_override.value;
        END IF;
    END IF;

    -- Check for org override
    IF p_org_id IS NOT NULL THEN
        SELECT * INTO v_override
        FROM feature_flag_overrides
        WHERE flag_id = v_flag.id
          AND org_id = p_org_id
          AND (expires_at IS NULL OR expires_at > NOW());

        IF v_override IS NOT NULL THEN
            RETURN v_override.value;
        END IF;
    END IF;

    -- Evaluate rules (simplified - complex rules would need app logic)
    -- For now, just return default value
    RETURN v_flag.default_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record license activation
CREATE OR REPLACE FUNCTION activate_license(
    p_license_key TEXT,
    p_instance_id TEXT,
    p_hardware_fingerprint TEXT DEFAULT NULL,
    p_hostname TEXT DEFAULT NULL,
    p_product_version TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_validation JSONB;
    v_license_id UUID;
    v_activation_id UUID;
BEGIN
    -- Validate license first
    v_validation := validate_license_key(p_license_key);

    IF NOT (v_validation->>'valid')::boolean THEN
        RETURN v_validation;
    END IF;

    v_license_id := (v_validation->>'license_id')::UUID;

    -- Create or update activation
    INSERT INTO license_activations (
        license_id, instance_id, hardware_fingerprint,
        hostname, product_version, last_heartbeat_at
    ) VALUES (
        v_license_id, p_instance_id, p_hardware_fingerprint,
        p_hostname, p_product_version, NOW()
    )
    ON CONFLICT (license_id, instance_id) DO UPDATE
    SET
        hardware_fingerprint = COALESCE(p_hardware_fingerprint, license_activations.hardware_fingerprint),
        hostname = COALESCE(p_hostname, license_activations.hostname),
        product_version = COALESCE(p_product_version, license_activations.product_version),
        last_heartbeat_at = NOW(),
        is_active = true,
        deactivated_at = NULL
    RETURNING id INTO v_activation_id;

    RETURN jsonb_build_object(
        'success', true,
        'activation_id', v_activation_id,
        'license', v_validation
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Seed Default Feature Flags
-- =====================================================
INSERT INTO feature_flags (key, name, description, category, flag_type, default_value, rules) VALUES
    ('sso_enabled', 'sso_enabled', 'Enable SSO authentication', 'auth', 'boolean', 'false', '[]'),
    ('scim_enabled', 'scim_enabled', 'Enable SCIM provisioning', 'auth', 'boolean', 'false', '[]'),
    ('custom_roles', 'custom_roles', 'Enable custom RBAC roles', 'auth', 'boolean', 'false', '[]'),
    ('audit_export', 'audit_export', 'Enable audit log export', 'compliance', 'boolean', 'false', '[]'),
    ('data_residency', 'data_residency', 'Enable data residency controls', 'compliance', 'boolean', 'false', '[]'),
    ('advanced_analytics', 'advanced_analytics', 'Enable advanced analytics dashboard', 'analytics', 'boolean', 'false', '[]'),
    ('ai_gateway', 'ai_gateway', 'Enable AI Gateway features', 'gateway', 'boolean', 'true', '[]'),
    ('semantic_cache', 'semantic_cache', 'Enable semantic caching', 'gateway', 'boolean', 'true', '[]'),
    ('tool_review', 'tool_review', 'Enable tool call review workflow', 'safety', 'boolean', 'true', '[]'),
    ('annotation_queues', 'annotation_queues', 'Enable annotation queue system', 'feedback', 'boolean', 'true', '[]'),
    ('evidence_packs', 'evidence_packs', 'Enable evidence pack generation', 'provenance', 'boolean', 'true', '[]')
ON CONFLICT DO NOTHING;

-- =====================================================
-- Row Level Security
-- =====================================================
ALTER TABLE license_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flag_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_usage ENABLE ROW LEVEL SECURITY;

-- License keys: service role only (these are sensitive)
DROP POLICY IF EXISTS license_keys_service_only ON license_keys;
CREATE POLICY license_keys_service_only ON license_keys FOR ALL
    USING (
        EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

-- License activations: service role only
DROP POLICY IF EXISTS license_activations_service_only ON license_activations;
CREATE POLICY license_activations_service_only ON license_activations FOR ALL
    USING (
        EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

-- Feature flags: everyone can read, admins can modify
DROP POLICY IF EXISTS feature_flags_select ON feature_flags;
CREATE POLICY feature_flags_select ON feature_flags FOR SELECT
    USING (true);  -- Public read

DROP POLICY IF EXISTS feature_flags_modify ON feature_flags;
CREATE POLICY feature_flags_modify ON feature_flags FOR ALL
    USING (
        EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

-- Feature flag overrides: org admins for org overrides, service for user overrides
DROP POLICY IF EXISTS feature_flag_overrides_select ON feature_flag_overrides;
CREATE POLICY feature_flag_overrides_select ON feature_flag_overrides FOR SELECT
    USING (
        user_id = auth.uid()
        OR org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text)
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

DROP POLICY IF EXISTS feature_flag_overrides_modify ON feature_flag_overrides;
CREATE POLICY feature_flag_overrides_modify ON feature_flag_overrides FOR ALL
    USING (
        org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

-- License usage: service role only
DROP POLICY IF EXISTS license_usage_service_only ON license_usage;
CREATE POLICY license_usage_service_only ON license_usage FOR ALL
    USING (
        EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

-- =====================================================
-- Triggers
-- =====================================================
DROP TRIGGER IF EXISTS trigger_license_keys_updated_at ON license_keys;
CREATE TRIGGER trigger_license_keys_updated_at
    BEFORE UPDATE ON license_keys
    FOR EACH ROW EXECUTE FUNCTION update_gateway_updated_at();

DROP TRIGGER IF EXISTS trigger_license_activations_updated_at ON license_activations;
CREATE TRIGGER trigger_license_activations_updated_at
    BEFORE UPDATE ON license_activations
    FOR EACH ROW EXECUTE FUNCTION update_gateway_updated_at();

DROP TRIGGER IF EXISTS trigger_feature_flags_updated_at ON feature_flags;
CREATE TRIGGER trigger_feature_flags_updated_at
    BEFORE UPDATE ON feature_flags
    FOR EACH ROW EXECUTE FUNCTION update_gateway_updated_at();

DROP TRIGGER IF EXISTS trigger_feature_flag_overrides_updated_at ON feature_flag_overrides;
CREATE TRIGGER trigger_feature_flag_overrides_updated_at
    BEFORE UPDATE ON feature_flag_overrides
    FOR EACH ROW EXECUTE FUNCTION update_gateway_updated_at();

DROP TRIGGER IF EXISTS trigger_license_usage_updated_at ON license_usage;
CREATE TRIGGER trigger_license_usage_updated_at
    BEFORE UPDATE ON license_usage
    FOR EACH ROW EXECUTE FUNCTION update_gateway_updated_at();
