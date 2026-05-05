-- Track 2 API + MCP key foundations.
--
-- The project already has a legacy public.api_keys table used by device auth,
-- dashboard keys, and runtime verification. This migration extends that table
-- instead of recreating it, then adds Track 2 usage and audit tables.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS prefix TEXT,
  ADD COLUMN IF NOT EXISTS hash TEXT,
  ADD COLUMN IF NOT EXISTS rate_limit_per_minute INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS monthly_quota INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS monthly_quota_period TEXT NOT NULL DEFAULT 'month',
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rotated_from_id UUID REFERENCES public.api_keys(id);

UPDATE public.api_keys
SET
  prefix = COALESCE(prefix, key_prefix),
  hash = COALESCE(hash, key_hash),
  revoked_at = CASE
    WHEN revoked_at IS NULL AND is_active = false THEN COALESCE(updated_at, now())
    ELSE revoked_at
  END
WHERE prefix IS NULL
   OR hash IS NULL
   OR (revoked_at IS NULL AND is_active = false);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'api_keys_monthly_quota_period_check'
  ) THEN
    ALTER TABLE public.api_keys
      ADD CONSTRAINT api_keys_monthly_quota_period_check
      CHECK (monthly_quota_period IN ('day', 'month'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.api_key_usage (
  id BIGSERIAL PRIMARY KEY,
  api_key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  tool TEXT NOT NULL,
  project_id UUID,
  cost_units INTEGER NOT NULL DEFAULT 1,
  llm_cost_usd_milli INTEGER NOT NULL DEFAULT 0,
  llm_provider TEXT,
  llm_model TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.api_key_audit_log (
  id BIGSERIAL PRIMARY KEY,
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id UUID,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'api_key_audit_log_action_check'
  ) THEN
    ALTER TABLE public.api_key_audit_log
      ADD CONSTRAINT api_key_audit_log_action_check
      CHECK (action IN (
        'created',
        'revoked',
        'rotated',
        'rate_limited',
        'quota_exceeded',
        'scope_denied'
      ));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_prefix_uniq
  ON public.api_keys(prefix)
  WHERE revoked_at IS NULL AND prefix IS NOT NULL;

CREATE INDEX IF NOT EXISTS api_keys_user_idx
  ON public.api_keys(user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS api_keys_org_idx
  ON public.api_keys(org_id)
  WHERE revoked_at IS NULL AND org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS api_key_usage_key_month_idx
  ON public.api_key_usage(api_key_id, occurred_at);

CREATE INDEX IF NOT EXISTS api_key_audit_log_user_idx
  ON public.api_key_audit_log(user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS api_key_audit_log_org_idx
  ON public.api_key_audit_log(org_id, occurred_at DESC)
  WHERE org_id IS NOT NULL;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_key_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_key_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "track2 users see own keys" ON public.api_keys;
CREATE POLICY "track2 users see own keys"
  ON public.api_keys
  FOR SELECT
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "track2 users insert own keys" ON public.api_keys;
CREATE POLICY "track2 users insert own keys"
  ON public.api_keys
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "track2 users revoke own keys" ON public.api_keys;
CREATE POLICY "track2 users revoke own keys"
  ON public.api_keys
  FOR UPDATE
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "track2 users see own usage" ON public.api_key_usage;
CREATE POLICY "track2 users see own usage"
  ON public.api_key_usage
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.api_keys
      WHERE api_keys.id = api_key_usage.api_key_id
        AND api_keys.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "track2 users see own audit" ON public.api_key_audit_log;
CREATE POLICY "track2 users see own audit"
  ON public.api_key_audit_log
  FOR SELECT
  USING (auth.uid()::text = user_id);

GRANT SELECT, INSERT, UPDATE ON public.api_keys TO authenticated;
GRANT SELECT ON public.api_key_usage TO authenticated;
GRANT SELECT ON public.api_key_audit_log TO authenticated;
GRANT ALL ON public.api_key_usage TO service_role;
GRANT ALL ON public.api_key_audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.api_key_usage_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.api_key_audit_log_id_seq TO service_role;

COMMIT;
