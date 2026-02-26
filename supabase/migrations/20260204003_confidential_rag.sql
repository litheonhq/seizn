-- ============================================
-- Confidential RAG Mode
-- Tier-S Feature 5: Secure RAG
-- ============================================

-- Encryption keys table
CREATE TABLE IF NOT EXISTS encryption_keys (
    id UUID PRIMARY KEY,

    -- Organization scope
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Key data (in production, use KMS)
    encrypted_key TEXT NOT NULL,
    algorithm TEXT NOT NULL DEFAULT 'aes-256-gcm',

    -- Key metadata
    key_type TEXT NOT NULL DEFAULT 'data' CHECK (key_type IN ('data', 'master', 'backup')),
    purpose TEXT,

    -- Rotation tracking
    version INTEGER DEFAULT 1,
    parent_key_id UUID REFERENCES encryption_keys(id),
    rotated_at TIMESTAMPTZ,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMPTZ
);

-- Index for encryption_keys
CREATE INDEX IF NOT EXISTS idx_encryption_keys_org
    ON encryption_keys(organization_id) WHERE is_active = TRUE;

-- Secure chunks table
CREATE TABLE IF NOT EXISTS secure_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Collection and organization
    collection_id UUID NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Security classification
    classification JSONB NOT NULL DEFAULT '{"level": "internal"}',

    -- Encrypted content
    encrypted_content TEXT NOT NULL,
    content_hash TEXT NOT NULL,

    -- Encryption metadata
    key_id UUID NOT NULL REFERENCES encryption_keys(id),
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,

    -- Additional metadata (unencrypted)
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for secure_chunks
CREATE INDEX IF NOT EXISTS idx_secure_chunks_collection
    ON secure_chunks(collection_id);

CREATE INDEX IF NOT EXISTS idx_secure_chunks_org
    ON secure_chunks(organization_id);

CREATE INDEX IF NOT EXISTS idx_secure_chunks_classification
    ON secure_chunks((classification->>'level'));

-- User security clearances
CREATE TABLE IF NOT EXISTS user_security_clearances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User and organization
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Clearance level
    clearance_level TEXT NOT NULL DEFAULT 'internal' CHECK (clearance_level IN (
        'public', 'internal', 'confidential', 'restricted', 'top_secret'
    )),

    -- Compartments (need-to-know access)
    compartments TEXT[] DEFAULT '{}',

    -- Roles for access control
    roles TEXT[] DEFAULT '{member}',

    -- Validity period
    granted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,

    -- Audit info
    granted_by UUID REFERENCES auth.users(id),
    revoke_reason TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Unique clearance per user per org
    CONSTRAINT unique_user_clearance UNIQUE (user_id, organization_id)
);

-- Index for clearances
CREATE INDEX IF NOT EXISTS idx_user_clearances_user
    ON user_security_clearances(user_id);

CREATE INDEX IF NOT EXISTS idx_user_clearances_org
    ON user_security_clearances(organization_id);

-- Access policies
CREATE TABLE IF NOT EXISTS confidential_access_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Organization scope
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Policy metadata
    name TEXT NOT NULL,
    description TEXT,

    -- Policy rules
    rules JSONB NOT NULL DEFAULT '[]',

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Unique name per org
    CONSTRAINT unique_policy_name UNIQUE (organization_id, name)
);

-- Index for policies
CREATE INDEX IF NOT EXISTS idx_access_policies_org
    ON confidential_access_policies(organization_id) WHERE is_active = TRUE;

-- Access logs (audit trail)
CREATE TABLE IF NOT EXISTS confidential_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Who accessed
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- What was accessed
    chunk_id UUID REFERENCES secure_chunks(id) ON DELETE SET NULL,
    security_level TEXT NOT NULL,

    -- Access decision
    access_granted BOOLEAN NOT NULL,
    denial_reason TEXT,
    access_reason TEXT NOT NULL,

    -- Context
    ip_address INET,
    user_agent TEXT,
    session_id TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for access logs
CREATE INDEX IF NOT EXISTS idx_access_logs_user
    ON confidential_access_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_access_logs_org
    ON confidential_access_logs(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_access_logs_chunk
    ON confidential_access_logs(chunk_id) WHERE chunk_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_access_logs_denied
    ON confidential_access_logs(organization_id, created_at DESC)
    WHERE access_granted = FALSE;

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE encryption_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE secure_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_security_clearances ENABLE ROW LEVEL SECURITY;
ALTER TABLE confidential_access_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE confidential_access_logs ENABLE ROW LEVEL SECURITY;

-- encryption_keys policies (service only for security)
CREATE POLICY "service_only_encryption_keys" ON encryption_keys
    FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

-- secure_chunks policies
CREATE POLICY "org_read_secure_chunks" ON secure_chunks
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
        )
    );

CREATE POLICY "org_insert_secure_chunks" ON secure_chunks
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "service_all_secure_chunks" ON secure_chunks
    FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

-- user_security_clearances policies
CREATE POLICY "user_read_own_clearance" ON user_security_clearances
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "admin_manage_clearances" ON user_security_clearances
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "service_all_clearances" ON user_security_clearances
    FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

-- confidential_access_policies policies
CREATE POLICY "org_read_access_policies" ON confidential_access_policies
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
        )
    );

CREATE POLICY "admin_manage_access_policies" ON confidential_access_policies
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "service_all_access_policies" ON confidential_access_policies
    FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

-- confidential_access_logs policies
CREATE POLICY "admin_read_access_logs" ON confidential_access_logs
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
            AND role IN ('owner', 'admin')
        )
        OR user_id = auth.uid()
    );

CREATE POLICY "service_all_access_logs" ON confidential_access_logs
    FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

-- ============================================
-- Helper Functions
-- ============================================

-- Function to check user clearance
CREATE OR REPLACE FUNCTION check_user_clearance(
    p_user_id UUID,
    p_organization_id UUID,
    p_required_level TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    user_level TEXT;
    level_hierarchy JSONB := '{"public": 0, "internal": 1, "confidential": 2, "restricted": 3, "top_secret": 4}'::JSONB;
BEGIN
    SELECT clearance_level
    INTO user_level
    FROM user_security_clearances
    WHERE user_id = p_user_id
        AND organization_id = p_organization_id
        AND (expires_at IS NULL OR expires_at > NOW())
        AND revoked_at IS NULL;

    IF user_level IS NULL THEN
        user_level := 'internal'; -- Default for org members
    END IF;

    RETURN (level_hierarchy->>user_level)::INT >= (level_hierarchy->>p_required_level)::INT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get access statistics
CREATE OR REPLACE FUNCTION get_access_statistics(
    p_organization_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    total_accesses BIGINT,
    granted_accesses BIGINT,
    denied_accesses BIGINT,
    unique_users BIGINT,
    by_security_level JSONB,
    by_denial_reason JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) AS total_accesses,
        COUNT(*) FILTER (WHERE access_granted = TRUE) AS granted_accesses,
        COUNT(*) FILTER (WHERE access_granted = FALSE) AS denied_accesses,
        COUNT(DISTINCT user_id) AS unique_users,
        (
            SELECT jsonb_object_agg(security_level, cnt)
            FROM (
                SELECT security_level, COUNT(*) as cnt
                FROM confidential_access_logs
                WHERE organization_id = p_organization_id
                    AND created_at >= NOW() - (p_days || ' days')::INTERVAL
                GROUP BY security_level
            ) level_counts
        ) AS by_security_level,
        (
            SELECT jsonb_object_agg(COALESCE(denial_reason, 'N/A'), cnt)
            FROM (
                SELECT denial_reason, COUNT(*) as cnt
                FROM confidential_access_logs
                WHERE organization_id = p_organization_id
                    AND created_at >= NOW() - (p_days || ' days')::INTERVAL
                    AND access_granted = FALSE
                GROUP BY denial_reason
            ) reason_counts
        ) AS by_denial_reason
    FROM confidential_access_logs
    WHERE organization_id = p_organization_id
        AND created_at >= NOW() - (p_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_confidential_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER secure_chunks_updated_at
    BEFORE UPDATE ON secure_chunks
    FOR EACH ROW
    EXECUTE FUNCTION update_confidential_timestamp();

CREATE TRIGGER user_clearances_updated_at
    BEFORE UPDATE ON user_security_clearances
    FOR EACH ROW
    EXECUTE FUNCTION update_confidential_timestamp();

CREATE TRIGGER access_policies_updated_at
    BEFORE UPDATE ON confidential_access_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_confidential_timestamp();

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE encryption_keys IS 'Encryption keys for secure chunk storage';
COMMENT ON TABLE secure_chunks IS 'Encrypted RAG chunks with security classification';
COMMENT ON TABLE user_security_clearances IS 'User security clearance levels and compartments';
COMMENT ON TABLE confidential_access_policies IS 'Access control policies for secure content';
COMMENT ON TABLE confidential_access_logs IS 'Audit trail of access to secure content';

COMMENT ON COLUMN secure_chunks.classification IS 'Security classification (level, compartments, etc.)';
COMMENT ON COLUMN secure_chunks.auth_tag IS 'AES-GCM authentication tag for integrity';
COMMENT ON COLUMN user_security_clearances.compartments IS 'Need-to-know compartment access';

COMMENT ON FUNCTION check_user_clearance IS 'Check if user has required clearance level';
COMMENT ON FUNCTION get_access_statistics IS 'Get access statistics for organization';
