-- Monthly Continuity Report scheduling for Pro+ Managed.
--
-- Locked 2026-05-07. Pro+ Managed gets one auto-generated full-novel
-- continuity scan per month, delivered as a markdown/PDF stored in R2.
-- Cron job /api/cron/continuity-reports picks up pending rows.

CREATE TABLE IF NOT EXISTS public.continuity_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_for   DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  report_r2_key   TEXT,
  llm_cost_cents  INTEGER,
  generated_at    TIMESTAMPTZ,
  failure_reason  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT continuity_reports_status_check
    CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS continuity_reports_user_idx
  ON public.continuity_reports (user_id, scheduled_for DESC);

CREATE INDEX IF NOT EXISTS continuity_reports_pending_idx
  ON public.continuity_reports (scheduled_for)
  WHERE status = 'pending';

ALTER TABLE public.continuity_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS continuity_reports_self_select
  ON public.continuity_reports;
CREATE POLICY continuity_reports_self_select
  ON public.continuity_reports
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS continuity_reports_service_role_all
  ON public.continuity_reports;
CREATE POLICY continuity_reports_service_role_all
  ON public.continuity_reports
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.continuity_reports IS
  'Monthly continuity scan jobs for Pro+ Managed. Cron generates pending → completed.';
COMMENT ON COLUMN public.continuity_reports.report_r2_key IS
  'R2 object key for the generated markdown/PDF. Resolved to a presigned URL on download.';
