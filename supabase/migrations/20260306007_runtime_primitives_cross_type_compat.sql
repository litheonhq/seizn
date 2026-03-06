BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_profile_id_type TEXT;
  v_org_id_type TEXT;
  v_api_key_id_type TEXT;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
    INTO v_profile_id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'profiles'
    AND a.attname = 'id'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  SELECT format_type(a.atttypid, a.atttypmod)
    INTO v_org_id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'organizations'
    AND a.attname = 'id'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  SELECT format_type(a.atttypid, a.attmod)
    INTO v_api_key_id_type
  FROM (
    SELECT a.*, a.atttypmod AS attmod
    FROM pg_attribute a
  ) a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'api_keys'
    AND a.attname = 'id'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_profile_id_type IS NULL THEN
    RAISE EXCEPTION 'public.profiles.id type not found';
  END IF;

  IF v_org_id_type IS NULL THEN
    RAISE EXCEPTION 'public.organizations.id type not found';
  END IF;

  IF v_api_key_id_type IS NULL THEN
    RAISE EXCEPTION 'public.api_keys.id type not found';
  END IF;

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.device_auth_codes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      device_code TEXT NOT NULL UNIQUE,
      user_code TEXT NOT NULL UNIQUE,
      user_id %1$s REFERENCES public.profiles(id) ON DELETE CASCADE,
      api_key_id %2$s REFERENCES public.api_keys(id) ON DELETE SET NULL,
      access_token TEXT,
      status TEXT NOT NULL DEFAULT ''pending'' CHECK (status IN (''pending'', ''approved'', ''denied'', ''expired'')),
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      approved_at TIMESTAMPTZ
    )',
    v_profile_id_type,
    v_api_key_id_type
  );

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.relay_agents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id %1$s NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      org_id %2$s REFERENCES public.organizations(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      description TEXT,
      agent_key TEXT NOT NULL UNIQUE,
      endpoint_url TEXT,
      capabilities JSONB NOT NULL DEFAULT ''["retrieve"]''::JSONB,
      collections TEXT[] NOT NULL DEFAULT ''{}''::TEXT[],
      connection_mode TEXT NOT NULL DEFAULT ''callback'' CHECK (connection_mode IN (''callback'', ''direct'', ''hybrid'')),
      status TEXT NOT NULL DEFAULT ''inactive'' CHECK (status IN (''inactive'', ''active'', ''error'', ''maintenance'')),
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
    )',
    v_profile_id_type,
    v_org_id_type
  );
END $$;

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

CREATE INDEX IF NOT EXISTS idx_device_auth_codes_device_code
  ON public.device_auth_codes(device_code);
CREATE INDEX IF NOT EXISTS idx_device_auth_codes_user_code
  ON public.device_auth_codes(user_code)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_device_auth_codes_expires_at
  ON public.device_auth_codes(expires_at)
  WHERE status = 'pending';

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

ALTER TABLE public.device_auth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relay_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relay_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relay_pending_callbacks ENABLE ROW LEVEL SECURITY;

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
  USING (auth.uid()::text = user_id::text);

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
  USING (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

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
        AND ra.user_id::text = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.relay_agents ra
      WHERE ra.id = relay_id
        AND ra.user_id::text = auth.uid()::text
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
        AND ra.user_id::text = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.relay_agents ra
      WHERE ra.id = relay_id
        AND ra.user_id::text = auth.uid()::text
    )
  );

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
  p_user_id TEXT,
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
  WHERE ra.user_id::text = p_user_id
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
