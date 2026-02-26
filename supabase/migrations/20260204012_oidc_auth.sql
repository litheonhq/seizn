-- OIDC Authentication Support Migration
-- Epic B: Enterprise Identity - OIDC SSO support
-- Fully defensive migration with type casting

-- =====================================================
-- Step 1: Ensure sso_connections has required columns
-- =====================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sso_connections' AND column_name = 'domains') THEN
        ALTER TABLE sso_connections ADD COLUMN domains TEXT[] DEFAULT ARRAY[]::TEXT[];
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sso_connections' AND column_name = 'is_active') THEN
        ALTER TABLE sso_connections ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sso_connections' AND column_name = 'metadata') THEN
        ALTER TABLE sso_connections ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sso_connections' AND column_name = 'oidc_config') THEN
        ALTER TABLE sso_connections ADD COLUMN oidc_config JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sso_connections' AND column_name = 'saml_config') THEN
        ALTER TABLE sso_connections ADD COLUMN saml_config JSONB;
    END IF;
END $$;

-- =====================================================
-- Step 2: OIDC Auth Requests Table
-- =====================================================
CREATE TABLE IF NOT EXISTS oidc_auth_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES sso_connections(id) ON DELETE CASCADE,
    state TEXT NOT NULL UNIQUE,
    nonce TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    code_verifier TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oidc_auth_requests_state ON oidc_auth_requests(state);
CREATE INDEX IF NOT EXISTS idx_oidc_auth_requests_expires ON oidc_auth_requests(expires_at);

-- =====================================================
-- Step 3: SSO Sessions Table (with full column patching)
-- =====================================================
CREATE TABLE IF NOT EXISTS sso_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    organization_id UUID,
    connection_id UUID,
    provider TEXT NOT NULL DEFAULT 'unknown',
    idp_session_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT
);

-- Add ALL missing columns to sso_sessions
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sso_sessions' AND column_name = 'organization_id') THEN
        ALTER TABLE sso_sessions ADD COLUMN organization_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sso_sessions' AND column_name = 'connection_id') THEN
        ALTER TABLE sso_sessions ADD COLUMN connection_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sso_sessions' AND column_name = 'is_active') THEN
        ALTER TABLE sso_sessions ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sso_sessions' AND column_name = 'revoked_at') THEN
        ALTER TABLE sso_sessions ADD COLUMN revoked_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sso_sessions' AND column_name = 'revoked_reason') THEN
        ALTER TABLE sso_sessions ADD COLUMN revoked_reason TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sso_sessions' AND column_name = 'last_activity_at') THEN
        ALTER TABLE sso_sessions ADD COLUMN last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sso_sessions' AND column_name = 'idp_session_id') THEN
        ALTER TABLE sso_sessions ADD COLUMN idp_session_id TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sso_sessions' AND column_name = 'ip_address') THEN
        ALTER TABLE sso_sessions ADD COLUMN ip_address TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sso_sessions' AND column_name = 'user_agent') THEN
        ALTER TABLE sso_sessions ADD COLUMN user_agent TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sso_sessions' AND column_name = 'provider') THEN
        ALTER TABLE sso_sessions ADD COLUMN provider TEXT NOT NULL DEFAULT 'unknown';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sso_sessions' AND column_name = 'expires_at') THEN
        ALTER TABLE sso_sessions ADD COLUMN expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours';
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sso_sessions_user ON sso_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sso_sessions_expires ON sso_sessions(expires_at);

-- =====================================================
-- Step 4: Helper Functions
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_expired_oidc_requests()
RETURNS void AS $$
BEGIN
    DELETE FROM oidc_auth_requests WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_active_sso_session(p_user_id TEXT, p_org_id UUID)
RETURNS sso_sessions AS $$
DECLARE
    v_session sso_sessions;
BEGIN
    SELECT * INTO v_session FROM sso_sessions
    WHERE user_id = p_user_id
      AND (organization_id = p_org_id OR organization_id IS NULL)
      AND is_active = true
      AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1;
    RETURN v_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION revoke_sso_session(p_session_id UUID, p_reason TEXT DEFAULT 'user_logout')
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE sso_sessions SET is_active = false, revoked_at = NOW(), revoked_reason = p_reason WHERE id = p_session_id;
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION revoke_all_sso_sessions(p_user_id TEXT, p_org_id UUID, p_reason TEXT DEFAULT 'admin_revoke')
RETURNS INTEGER AS $$
DECLARE v_count INTEGER;
BEGIN
    UPDATE sso_sessions SET is_active = false, revoked_at = NOW(), revoked_reason = p_reason
    WHERE user_id = p_user_id AND (organization_id = p_org_id OR organization_id IS NULL) AND is_active = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_sso_session_activity()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_activity_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Step 5: Row Level Security
-- =====================================================
ALTER TABLE oidc_auth_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sso_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oidc_auth_requests_service_only ON oidc_auth_requests;
DROP POLICY IF EXISTS sso_sessions_select ON sso_sessions;
DROP POLICY IF EXISTS sso_sessions_insert ON sso_sessions;
DROP POLICY IF EXISTS sso_sessions_update ON sso_sessions;

CREATE POLICY oidc_auth_requests_service_only ON oidc_auth_requests FOR ALL USING (true);

-- RLS with explicit type casting (user_id is TEXT, auth.uid() is UUID)
CREATE POLICY sso_sessions_select ON sso_sessions FOR SELECT USING (
    user_id = auth.uid()::text
);

CREATE POLICY sso_sessions_insert ON sso_sessions FOR INSERT WITH CHECK (true);

CREATE POLICY sso_sessions_update ON sso_sessions FOR UPDATE USING (
    user_id = auth.uid()::text
);

-- =====================================================
-- Step 6: Triggers
-- =====================================================
DROP TRIGGER IF EXISTS trigger_sso_session_activity ON sso_sessions;
CREATE TRIGGER trigger_sso_session_activity
    BEFORE UPDATE ON sso_sessions FOR EACH ROW
    EXECUTE FUNCTION update_sso_session_activity();
