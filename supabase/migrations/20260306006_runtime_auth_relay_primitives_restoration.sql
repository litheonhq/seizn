BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'sso_provider_type'
  ) THEN
    CREATE TYPE public.sso_provider_type AS ENUM ('saml', 'oidc');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'sso_connection_status'
  ) THEN
    CREATE TYPE public.sso_connection_status AS ENUM ('draft', 'testing', 'active', 'disabled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.device_auth_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_code TEXT NOT NULL UNIQUE,
  user_code TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  access_token TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_device_auth_codes_device_code
  ON public.device_auth_codes(device_code);
CREATE INDEX IF NOT EXISTS idx_device_auth_codes_user_code
  ON public.device_auth_codes(user_code)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_device_auth_codes_expires_at
  ON public.device_auth_codes(expires_at)
  WHERE status = 'pending';

ALTER TABLE public.device_auth_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS device_auth_codes_service_role_all ON public.device_auth_codes;
CREATE POLICY device_auth_codes_service_role_all
  ON public.device_auth_codes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS device_auth_codes_owner_select ON public.device_auth_codes;
CREATE POLICY device_auth_codes_owner_select
  ON public.device_auth_codes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.cleanup_expired_device_codes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.device_auth_codes
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < NOW();

  DELETE FROM public.device_auth_codes
  WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$;

CREATE TABLE IF NOT EXISTS public.sso_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  provider_type public.sso_provider_type NOT NULL DEFAULT 'saml',
  status public.sso_connection_status NOT NULL DEFAULT 'draft',
  entity_id VARCHAR(500),
  sso_url VARCHAR(500),
  slo_url VARCHAR(500),
  certificate TEXT,
  oidc_issuer VARCHAR(500),
  oidc_client_id VARCHAR(255),
  oidc_client_secret_encrypted TEXT,
  sp_entity_id VARCHAR(500),
  sp_acs_url VARCHAR(500),
  sp_metadata_url VARCHAR(500),
  email_domains TEXT[] DEFAULT '{}'::TEXT[],
  attribute_mapping JSONB NOT NULL DEFAULT '{"email":"email","firstName":"first_name","lastName":"last_name","displayName":"display_name","groups":"groups"}'::JSONB,
  settings JSONB NOT NULL DEFAULT '{"allowIdpInitiated":true,"forceAuthn":false,"signRequest":true,"wantAssertionsSigned":true,"nameIdFormat":"urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress","authnContextClassRef":"urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport","defaultRole":"member","autoProvision":true,"jitProvisioning":true}'::JSONB,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_tested_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS public.sso_domain_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  domain VARCHAR(255) NOT NULL,
  verification_method VARCHAR(50) NOT NULL DEFAULT 'dns_txt',
  verification_token VARCHAR(255) NOT NULL,
  verified_at TIMESTAMPTZ,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, domain)
);

CREATE TABLE IF NOT EXISTS public.sso_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.sso_connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'unknown',
  idp_session_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sso_sessions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sso_sessions ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES public.sso_connections(id) ON DELETE CASCADE;
ALTER TABLE public.sso_sessions ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE public.sso_sessions ADD COLUMN IF NOT EXISTS idp_session_id TEXT;
ALTER TABLE public.sso_sessions ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.sso_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.sso_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours');
ALTER TABLE public.sso_sessions ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.sso_sessions ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.sso_sessions ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE public.sso_sessions ADD COLUMN IF NOT EXISTS revoked_reason TEXT;

CREATE TABLE IF NOT EXISTS public.sso_login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES public.sso_connections(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  request_id VARCHAR(255),
  relay_state TEXT,
  response_status VARCHAR(50),
  error_code VARCHAR(100),
  error_message TEXT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  email VARCHAR(255),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sso_connections_org ON public.sso_connections(organization_id);
CREATE INDEX IF NOT EXISTS idx_sso_connections_status ON public.sso_connections(status);
CREATE INDEX IF NOT EXISTS idx_sso_connections_domains ON public.sso_connections USING GIN(email_domains);
CREATE INDEX IF NOT EXISTS idx_sso_domain_verifications_domain ON public.sso_domain_verifications(domain);
CREATE INDEX IF NOT EXISTS idx_sso_sessions_user ON public.sso_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sso_sessions_expires ON public.sso_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sso_login_attempts_org ON public.sso_login_attempts(organization_id);
CREATE INDEX IF NOT EXISTS idx_sso_login_attempts_created ON public.sso_login_attempts(created_at DESC);

ALTER TABLE public.sso_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sso_domain_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sso_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sso_login_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sso_connections_service_role_all ON public.sso_connections;
CREATE POLICY sso_connections_service_role_all
  ON public.sso_connections
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS sso_domain_verifications_service_role_all ON public.sso_domain_verifications;
CREATE POLICY sso_domain_verifications_service_role_all
  ON public.sso_domain_verifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS sso_sessions_service_role_all ON public.sso_sessions;
CREATE POLICY sso_sessions_service_role_all
  ON public.sso_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS sso_login_attempts_service_role_all ON public.sso_login_attempts;
CREATE POLICY sso_login_attempts_service_role_all
  ON public.sso_login_attempts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS sso_sessions_owner_select ON public.sso_sessions;
CREATE POLICY sso_sessions_owner_select
  ON public.sso_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.find_sso_connection_by_email(p_email VARCHAR(255))
RETURNS TABLE (
  connection_id UUID,
  organization_id UUID,
  provider_type public.sso_provider_type,
  sso_url VARCHAR(500)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain VARCHAR(255);
BEGIN
  v_domain := split_part(LOWER(p_email), '@', 2);

  RETURN QUERY
  SELECT
    sc.id,
    sc.organization_id,
    sc.provider_type,
    sc.sso_url
  FROM public.sso_connections sc
  JOIN public.sso_domain_verifications dv
    ON dv.organization_id = sc.organization_id
  WHERE sc.status = 'active'
    AND dv.domain = v_domain
    AND dv.is_verified = true
    AND v_domain = ANY(sc.email_domains)
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_sso_connection_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sso_connection_updated ON public.sso_connections;
CREATE TRIGGER trigger_sso_connection_updated
  BEFORE UPDATE ON public.sso_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_sso_connection_timestamp();

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS sso_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS sso_enforced BOOLEAN DEFAULT false;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS default_sso_connection_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organizations_default_sso_connection_id_fkey'
      AND conrelid = 'public.organizations'::regclass
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_default_sso_connection_id_fkey
      FOREIGN KEY (default_sso_connection_id)
      REFERENCES public.sso_connections(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.relay_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  agent_key TEXT NOT NULL UNIQUE,
  endpoint_url TEXT,
  capabilities JSONB NOT NULL DEFAULT '["retrieve"]'::JSONB,
  collections TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  connection_mode TEXT NOT NULL DEFAULT 'callback' CHECK (connection_mode IN ('callback', 'direct', 'hybrid')),
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive', 'active', 'error', 'maintenance')),
  last_heartbeat TIMESTAMPTZ,
  last_error TEXT,
  version TEXT,
  total_requests INTEGER NOT NULL DEFAULT 0,
  successful_requests INTEGER NOT NULL DEFAULT 0,
  failed_requests INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
  ip_whitelist TEXT[],
  tls_required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT relay_agents_user_name_unique UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS public.relay_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relay_id UUID NOT NULL REFERENCES public.relay_agents(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  query_hash TEXT,
  collection_id TEXT,
  top_k INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error', 'timeout')),
  result_count INTEGER,
  latency_ms DOUBLE PRECISION,
  error_message TEXT,
  source_ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.relay_pending_callbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relay_id UUID NOT NULL REFERENCES public.relay_agents(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  callback_url TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'received', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relays_user ON public.relay_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_relays_org ON public.relay_agents(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_relays_key ON public.relay_agents(agent_key);
CREATE INDEX IF NOT EXISTS idx_relays_status ON public.relay_agents(status);
CREATE INDEX IF NOT EXISTS idx_relays_collections ON public.relay_agents USING GIN(collections);
CREATE INDEX IF NOT EXISTS idx_relay_requests_relay ON public.relay_requests(relay_id);
CREATE INDEX IF NOT EXISTS idx_relay_requests_request_id ON public.relay_requests(request_id);
CREATE INDEX IF NOT EXISTS idx_relay_requests_status ON public.relay_requests(status);
CREATE INDEX IF NOT EXISTS idx_relay_requests_created ON public.relay_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_relay_callbacks_relay ON public.relay_pending_callbacks(relay_id);
CREATE INDEX IF NOT EXISTS idx_relay_callbacks_request_id ON public.relay_pending_callbacks(request_id);
CREATE INDEX IF NOT EXISTS idx_relay_callbacks_expires ON public.relay_pending_callbacks(expires_at) WHERE status = 'pending';

ALTER TABLE public.relay_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relay_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relay_pending_callbacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS relay_agents_service_role_all ON public.relay_agents;
CREATE POLICY relay_agents_service_role_all
  ON public.relay_agents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS relay_requests_service_role_all ON public.relay_requests;
CREATE POLICY relay_requests_service_role_all
  ON public.relay_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS relay_pending_callbacks_service_role_all ON public.relay_pending_callbacks;
CREATE POLICY relay_pending_callbacks_service_role_all
  ON public.relay_pending_callbacks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS relay_agents_owner_all ON public.relay_agents;
CREATE POLICY relay_agents_owner_all
  ON public.relay_agents
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS relay_requests_owner_all ON public.relay_requests;
CREATE POLICY relay_requests_owner_all
  ON public.relay_requests
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.relay_agents ra
      WHERE ra.id = relay_id
        AND ra.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.relay_agents ra
      WHERE ra.id = relay_id
        AND ra.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS relay_pending_callbacks_owner_all ON public.relay_pending_callbacks;
CREATE POLICY relay_pending_callbacks_owner_all
  ON public.relay_pending_callbacks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.relay_agents ra
      WHERE ra.id = relay_id
        AND ra.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.relay_agents ra
      WHERE ra.id = relay_id
        AND ra.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.update_relay_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('completed', 'error') AND OLD.status = 'processing' THEN
    UPDATE public.relay_agents
    SET
      total_requests = total_requests + 1,
      successful_requests = CASE WHEN NEW.status = 'completed' THEN successful_requests + 1 ELSE successful_requests END,
      failed_requests = CASE WHEN NEW.status = 'error' THEN failed_requests + 1 ELSE failed_requests END,
      avg_latency_ms = CASE
        WHEN NEW.latency_ms IS NOT NULL AND total_requests > 0
          THEN (avg_latency_ms * total_requests + NEW.latency_ms) / (total_requests + 1)
        ELSE avg_latency_ms
      END,
      updated_at = NOW()
    WHERE id = NEW.relay_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_relay_metrics ON public.relay_requests;
CREATE TRIGGER trigger_update_relay_metrics
  AFTER UPDATE ON public.relay_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_relay_metrics();

CREATE OR REPLACE FUNCTION public.update_relay_agents_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_relay_agents_updated_at ON public.relay_agents;
CREATE TRIGGER trigger_relay_agents_updated_at
  BEFORE UPDATE ON public.relay_agents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_relay_agents_updated_at();

CREATE OR REPLACE FUNCTION public.update_relay_heartbeat(
  p_agent_key TEXT,
  p_version TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, relay_id UUID, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_relay_id UUID;
  v_status TEXT;
BEGIN
  UPDATE public.relay_agents
  SET
    last_heartbeat = NOW(),
    status = 'active',
    version = COALESCE(p_version, version),
    last_error = NULL,
    updated_at = NOW()
  WHERE agent_key = p_agent_key
  RETURNING id, relay_agents.status INTO v_relay_id, v_status;

  IF v_relay_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'unknown'::TEXT;
  ELSE
    RETURN QUERY SELECT TRUE, v_relay_id, v_status;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_relay_for_collection(
  p_user_id UUID,
  p_collection_id TEXT
)
RETURNS TABLE(
  relay_id UUID,
  name TEXT,
  endpoint_url TEXT,
  connection_mode TEXT,
  capabilities JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ra.id,
    ra.name,
    ra.endpoint_url,
    ra.connection_mode,
    ra.capabilities
  FROM public.relay_agents ra
  WHERE ra.user_id = p_user_id
    AND ra.status = 'active'
    AND p_collection_id = ANY(ra.collections)
  ORDER BY ra.last_heartbeat DESC NULLS LAST
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_relay_callbacks()
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM public.relay_pending_callbacks
    WHERE expires_at < NOW()
      AND status = 'pending'
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
