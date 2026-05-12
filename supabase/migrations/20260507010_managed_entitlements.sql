-- Charter Managed entitlements for tier-specific perks.
--
-- Locked 2026-05-07. Tracks Managed-only benefits enforced by the app:
--   * priority queue routing (all Managed)
--   * 48h support tier (all Managed)
--   * beta features access flag (all Managed)
--   * collaborator seats (Pro+ 2, Studio+ 5, Enterprise unlimited)
--   * custom prompt overrides (Studio+)
--   * founding member badge (Charter eligible)
--
-- One row per Managed user. Sync logic lives in Stripe webhook handlers.

CREATE TABLE IF NOT EXISTS public.managed_entitlements (
  user_id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier                      TEXT NOT NULL,
  founding_member           BOOLEAN NOT NULL DEFAULT FALSE,
  beta_features_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  priority_support_sla_hours INTEGER NOT NULL DEFAULT 48,
  collaborator_seats        INTEGER NOT NULL DEFAULT 0 CHECK (collaborator_seats >= 0),
  custom_prompt_overrides   JSONB,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT managed_entitlements_tier_check
    CHECK (tier IN ('indie', 'pro', 'studio', 'enterprise'))
);

CREATE INDEX IF NOT EXISTS managed_entitlements_tier_idx
  ON public.managed_entitlements (tier);

ALTER TABLE public.managed_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS managed_entitlements_self_select
  ON public.managed_entitlements;
CREATE POLICY managed_entitlements_self_select
  ON public.managed_entitlements
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS managed_entitlements_service_role_all
  ON public.managed_entitlements;
CREATE POLICY managed_entitlements_service_role_all
  ON public.managed_entitlements
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.managed_entitlements_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS managed_entitlements_touch_updated_at_trg
  ON public.managed_entitlements;
CREATE TRIGGER managed_entitlements_touch_updated_at_trg
  BEFORE UPDATE ON public.managed_entitlements
  FOR EACH ROW
  EXECUTE FUNCTION public.managed_entitlements_touch_updated_at();

COMMENT ON TABLE public.managed_entitlements IS
  'Charter Managed tier perks (Priority Queue, 48h support, seats, etc.). Synced from Stripe webhooks.';
COMMENT ON COLUMN public.managed_entitlements.priority_support_sla_hours IS
  'Support SLA in hours. Managed=48, BYOK/Free=72 (default). Read by support routing.';
