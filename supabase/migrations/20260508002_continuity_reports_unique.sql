-- v9 audit follow-up — continuity_reports duplicate insert prevention.
--
-- continuity-reports cron enqueues "next month" rows for every Pro+ Managed
-- user. The check-then-insert pattern (count > 0 → skip) is non-atomic;
-- two concurrent cron invocations (Vercel retries) can both pass the check
-- and both insert duplicate pending rows for the same user/scheduled_for.
-- Each duplicate becomes a duplicate full-novel scan = duplicate $$$ LLM
-- spend on Pro+ Managed users.
--
-- Add a UNIQUE constraint so the insert is fail-closed at the schema layer.
-- The cron will switch to ON CONFLICT DO NOTHING.

ALTER TABLE public.continuity_reports
  ADD CONSTRAINT continuity_reports_user_scheduled_uniq
  UNIQUE (user_id, scheduled_for);

COMMENT ON CONSTRAINT continuity_reports_user_scheduled_uniq
  ON public.continuity_reports IS
  'One report per user per month. Prevents duplicate LLM spend on cron retry.';
