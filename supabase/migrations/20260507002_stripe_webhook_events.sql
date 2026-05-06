-- Stripe webhook event idempotency layer.
--
-- Pre-audit, the webhook route had no event-id deduplication. Stripe retries
-- on 5xx, network timeouts, or any handler that takes >30s. Each retry
-- re-ran every side effect: audit_logs insert, Stripe API attach/detach,
-- profiles update. Concrete consequences observed in the audit:
--   * audit_logs rows for a single subscription event accumulated on retry,
--     making MRR / customer lifecycle analytics overcount.
--   * subscription.created retried during the Studio Managed launch
--     re-attached the metered Opus overage (the helper's "already attached"
--     guard was a TOCTOU window, not a true mutex).
--
-- This table is the single source of truth for "have we processed this
-- Stripe event yet". The route inserts ON CONFLICT DO NOTHING; if the row
-- already exists we short-circuit with a 200, telling Stripe the event is
-- handled without re-running any side effect.
--
-- Table is INSERT-only from app code; cleanup via scheduled job (see
-- comment at the bottom). 30-day retention is plenty: Stripe's retry
-- window is ~3 days for production webhooks.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  livemode BOOLEAN NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- For periodic cleanup of rows older than retention window.
CREATE INDEX IF NOT EXISTS stripe_webhook_events_processed_at_idx
  ON public.stripe_webhook_events (processed_at DESC);

-- Service-role-only access; the webhook route uses the service-role client
-- and no other code path should ever read or mutate this table.
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- No policies = no access for anon/auth roles. Service role bypasses RLS.
-- (Documented intent: this table is internal billing infrastructure.)

COMMENT ON TABLE public.stripe_webhook_events IS
  'Idempotency table for Stripe webhook events. INSERT ON CONFLICT DO NOTHING gates duplicate processing. Cleanup: delete rows older than 30 days via scheduled job.';
