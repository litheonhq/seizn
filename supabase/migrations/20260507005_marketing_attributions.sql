-- Marketing attribution capture for Author Memory v3 launch (v9 catalog).
--
-- Locked 2026-05-07. Captures UTM params + referrer + landing path at signup
-- so the admin metrics dashboard can compute CAC per channel against the
-- ad_spend_log entries operations writes manually.
--
-- One row per user. Insert-once at signup; never update afterwards.

CREATE TABLE IF NOT EXISTS public.marketing_attributions (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  utm_source       TEXT,
  utm_medium       TEXT,
  utm_campaign     TEXT,
  utm_content      TEXT,
  utm_term         TEXT,
  referrer         TEXT,
  landing_path     TEXT,
  ip_country       TEXT,
  signed_up_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS marketing_attributions_utm_source_idx
  ON public.marketing_attributions (utm_source, signed_up_at DESC);

CREATE INDEX IF NOT EXISTS marketing_attributions_signed_up_idx
  ON public.marketing_attributions (signed_up_at DESC);

ALTER TABLE public.marketing_attributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_attributions_self_select
  ON public.marketing_attributions;
CREATE POLICY marketing_attributions_self_select
  ON public.marketing_attributions
  FOR SELECT
  USING (auth.uid() = user_id);

-- service_role inserts at signup; admins query via service_role.
DROP POLICY IF EXISTS marketing_attributions_service_role_all
  ON public.marketing_attributions;
CREATE POLICY marketing_attributions_service_role_all
  ON public.marketing_attributions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.marketing_attributions IS
  'UTM and referrer capture at signup. Read by /admin/metrics CAC report.';
COMMENT ON COLUMN public.marketing_attributions.utm_source IS
  'UTM source. Example values: reddit, google, newsletter_authortrek, twitter.';
