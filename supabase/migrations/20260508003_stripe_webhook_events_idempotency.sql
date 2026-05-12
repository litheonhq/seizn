-- v9 audit follow-up — Stripe webhook idempotency.
--
-- Stripe retries on 5xx responses (and on >20s timeout) re-deliver the
-- same event ID. Pre-fix the webhook handler had no dedupe layer, so
-- every retry re-ran the full side-effect chain:
--   - api_keys re-update (idempotent — fine)
--   - attachV8Track2ManagedOverage (already_attached short-circuit — fine)
--   - subscriptionSchedules.create (Stripe rejects "already_scheduled")
--   - **recordFunnelEvent fires AGAIN** → inflated CAC + cohort math
--   - **logBillingEvent fires AGAIN** → polluted audit log
--
-- This table is the dedupe primary. Webhook handler INSERTs the event_id
-- at the very top of POST; on PK conflict it returns 200 immediately
-- without processing.
--
-- Append-only: triggers + REVOKE block UPDATE/DELETE. Rows live forever
-- so the dedupe horizon is unbounded; expected scale is ~1000 events/day
-- = ~365K rows/year, comfortable.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  livemode      BOOLEAN NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_created_idx
  ON public.stripe_webhook_events (created_at DESC);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_type_idx
  ON public.stripe_webhook_events (type, created_at DESC);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- service-role only (webhook runs server-side).
DROP POLICY IF EXISTS stripe_webhook_events_service_role_all
  ON public.stripe_webhook_events;
CREATE POLICY stripe_webhook_events_service_role_all
  ON public.stripe_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.stripe_webhook_events IS
  'Stripe webhook idempotency table. Webhook handler INSERTs event_id at top of POST; PK conflict = duplicate retry, return 200 without re-processing.';
COMMENT ON COLUMN public.stripe_webhook_events.processed_at IS
  'Set after the side-effect chain completes successfully. Useful for debugging stalled processing.';
