-- Daily MRR snapshots aggregated from active Stripe subscriptions.
--
-- Locked 2026-05-07. Cron job /api/cron/mrr-snapshot writes one row per day
-- (UTC midnight). Stores aggregate counters by tier and Charter status so
-- the admin metrics dashboard can render time-series without re-querying
-- Stripe on every page load.

CREATE TABLE IF NOT EXISTS public.mrr_snapshots (
  snapshot_date         DATE PRIMARY KEY,
  active_paid_count     INTEGER NOT NULL CHECK (active_paid_count >= 0),
  total_mrr_usd_cents   INTEGER NOT NULL CHECK (total_mrr_usd_cents >= 0),
  by_tier               JSONB,
  by_charter            JSONB,
  by_provider           JSONB,
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mrr_snapshots_date_idx
  ON public.mrr_snapshots (snapshot_date DESC);

ALTER TABLE public.mrr_snapshots ENABLE ROW LEVEL SECURITY;

-- Service-role-only. Admin pages read; cron writes.
DROP POLICY IF EXISTS mrr_snapshots_service_role_all
  ON public.mrr_snapshots;
CREATE POLICY mrr_snapshots_service_role_all
  ON public.mrr_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.mrr_snapshots IS
  'Daily MRR snapshot. Written by cron. Read by admin /admin/metrics dashboard.';
COMMENT ON COLUMN public.mrr_snapshots.by_tier IS
  'JSONB shape: {indie_managed: 12, indie_byok: 8, pro_managed: 3, pro_byok: 2, ...}';
COMMENT ON COLUMN public.mrr_snapshots.by_charter IS
  'JSONB shape: {charter: 18, regular: 5} — count of active subscriptions by Charter status.';
