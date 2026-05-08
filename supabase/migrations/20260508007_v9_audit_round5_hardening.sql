-- Round 5 audit hardening — multi-fix migration.
--
-- Locked 2026-05-08. Fixes round 4 audit findings that need DB changes:
--
--   1. ad_spend_log: add UNIQUE (channel, period_start) so the admin
--      marketing spend route can use a real upsert. Without this constraint
--      a lookup-then-insert race produces duplicate rows that double-count
--      in CAC computation.
--
-- Code-only fixes (no DB change) are bundled in the same PR.
--
-- Rollback: ALTER TABLE public.ad_spend_log DROP CONSTRAINT
--   ad_spend_log_channel_period_unique;

BEGIN;

-- 1. UNIQUE backing the upsert pattern.
-- Preflight (2026-05-08): SELECT channel, period_start, COUNT(*)
--   FROM ad_spend_log GROUP BY ... HAVING COUNT(*) > 1 returned 0 rows.
-- Safe to add without de-duping first.

ALTER TABLE public.ad_spend_log
  DROP CONSTRAINT IF EXISTS ad_spend_log_channel_period_unique;

ALTER TABLE public.ad_spend_log
  ADD CONSTRAINT ad_spend_log_channel_period_unique
  UNIQUE (channel, period_start);

COMMIT;
