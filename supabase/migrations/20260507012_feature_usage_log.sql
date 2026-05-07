-- Per-user monthly feature usage counters for Free tier gating.
--
-- Locked 2026-05-07. Free tier limits: 5 Check / 5 Dialog per calendar month.
-- This table is the single source of truth for those counters. Charter tiers
-- (BYOK and Managed) bypass the gate but still write here for analytics.
--
-- Counter rolls over on the first day of each calendar month (UTC). Reset
-- happens lazily — the gate query reads "WHERE period_start = current month".

CREATE TABLE IF NOT EXISTS public.feature_usage_log (
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature        TEXT NOT NULL,
  period_start   DATE NOT NULL,
  count          INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  last_used_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, feature, period_start),
  CONSTRAINT feature_usage_log_feature_check
    CHECK (feature IN ('check', 'dialog', 'extract', 'backlog'))
);

CREATE INDEX IF NOT EXISTS feature_usage_log_user_period_idx
  ON public.feature_usage_log (user_id, period_start DESC);

ALTER TABLE public.feature_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feature_usage_log_self_select
  ON public.feature_usage_log;
CREATE POLICY feature_usage_log_self_select
  ON public.feature_usage_log
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS feature_usage_log_service_role_all
  ON public.feature_usage_log;
CREATE POLICY feature_usage_log_service_role_all
  ON public.feature_usage_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.feature_usage_log IS
  'Per-user, per-month feature counters. Free tier gate reads count for current month.';
COMMENT ON COLUMN public.feature_usage_log.feature IS
  'Feature slug. Allowed: check | dialog | extract | backlog.';
COMMENT ON COLUMN public.feature_usage_log.period_start IS
  'First day of the calendar month (UTC) the count applies to.';

-- Atomic increment RPC for the feature gate. Falls back path used by the
-- TypeScript helper when upsert hits a race condition.
CREATE OR REPLACE FUNCTION public.increment_feature_usage(
  p_user_id     UUID,
  p_feature     TEXT,
  p_period_start DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.feature_usage_log (user_id, feature, period_start, count, last_used_at)
  VALUES (p_user_id, p_feature, p_period_start, 1, NOW())
  ON CONFLICT (user_id, feature, period_start)
  DO UPDATE SET
    count = public.feature_usage_log.count + 1,
    last_used_at = NOW();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_feature_usage(UUID, TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_feature_usage(UUID, TEXT, DATE) TO service_role;

COMMENT ON FUNCTION public.increment_feature_usage(UUID, TEXT, DATE) IS
  'Atomic upsert+increment for feature_usage_log. Service-role only.';
