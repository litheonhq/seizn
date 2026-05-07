-- Manual ad spend log for CAC tracking.
--
-- Locked 2026-05-07. Operator enters monthly spend per channel via
-- /admin/marketing/spend. Joined against marketing_attributions in the CAC
-- query: spend / signups for the matching period and channel.
--
-- Channel naming convention: lowercase slug matching utm_source values.
-- Examples: reddit, google, newsletter_authortrek, twitter, micro_influencer.

CREATE TABLE IF NOT EXISTS public.ad_spend_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel       TEXT NOT NULL,
  campaign      TEXT,
  spend_usd     NUMERIC(10, 2) NOT NULL CHECK (spend_usd >= 0),
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  recorded_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ad_spend_log_period_valid
    CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS ad_spend_log_channel_period_idx
  ON public.ad_spend_log (channel, period_start DESC);

CREATE INDEX IF NOT EXISTS ad_spend_log_period_idx
  ON public.ad_spend_log (period_start DESC);

ALTER TABLE public.ad_spend_log ENABLE ROW LEVEL SECURITY;

-- Only service_role (admin pages run service-role queries) can read/write.
DROP POLICY IF EXISTS ad_spend_log_service_role_all
  ON public.ad_spend_log;
CREATE POLICY ad_spend_log_service_role_all
  ON public.ad_spend_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.ad_spend_log IS
  'Manual ad spend log keyed by channel slug. Joined with marketing_attributions for CAC.';
COMMENT ON COLUMN public.ad_spend_log.channel IS
  'Lowercase slug. Must match utm_source for CAC join. Examples: reddit, google, newsletter_authortrek.';
