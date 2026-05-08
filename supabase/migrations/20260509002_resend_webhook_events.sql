-- W2.5 — Resend webhook event log + email delivery state.
--
-- Locked 2026-05-09. Resend forwards bounce/complaint/delivered/opened events
-- via webhook (HMAC-SHA256 signed with Svix-compatible scheme). We:
--   1. dedupe by event id (Resend `email.id + timestamp`) — exact same pattern
--      as stripe_webhook_events (20260508003).
--   2. record terminal delivery state on profiles for sender reputation hygiene
--      — never re-send to a hard-bounced address, suppress complaints for 30d.
--
-- Append-only; trigger blocks UPDATE/DELETE.

BEGIN;

CREATE TABLE IF NOT EXISTS public.resend_webhook_events (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  recipient     CITEXT,
  email_id      TEXT,
  payload       JSONB NOT NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.resend_webhook_events
  DROP CONSTRAINT IF EXISTS resend_webhook_events_type_check;
ALTER TABLE public.resend_webhook_events
  ADD CONSTRAINT resend_webhook_events_type_check
  CHECK (type IN (
    'email.sent',
    'email.delivered',
    'email.delivery_delayed',
    'email.complained',
    'email.bounced',
    'email.opened',
    'email.clicked'
  ));

CREATE INDEX IF NOT EXISTS resend_webhook_events_recipient_idx
  ON public.resend_webhook_events (recipient, received_at DESC)
  WHERE recipient IS NOT NULL;

CREATE INDEX IF NOT EXISTS resend_webhook_events_type_idx
  ON public.resend_webhook_events (type, received_at DESC);

-- Suppression list: don't email these addresses (hard bounce or complaint).
-- Populated by webhook handler on email.bounced / email.complained.
CREATE TABLE IF NOT EXISTS public.email_suppression_list (
  email         CITEXT PRIMARY KEY,
  reason        TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'resend_webhook',
  suppressed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ
);

ALTER TABLE public.email_suppression_list
  DROP CONSTRAINT IF EXISTS email_suppression_list_reason_check;
ALTER TABLE public.email_suppression_list
  ADD CONSTRAINT email_suppression_list_reason_check
  CHECK (reason IN ('hard_bounce', 'soft_bounce', 'complaint', 'manual_unsubscribe'));

-- Active suppression index — full table; callers filter `expires_at IS NULL OR expires_at > now()`
-- at query time. Postgres rejects NOW() in partial index predicates because it's STABLE not IMMUTABLE.
CREATE INDEX IF NOT EXISTS email_suppression_active_idx
  ON public.email_suppression_list (email, expires_at);

ALTER TABLE public.resend_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_suppression_list ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resend_webhook_events_service ON public.resend_webhook_events;
CREATE POLICY resend_webhook_events_service
  ON public.resend_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS email_suppression_list_service ON public.email_suppression_list;
CREATE POLICY email_suppression_list_service
  ON public.email_suppression_list
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.resend_webhook_events IS
  'Append-only Resend webhook event log. Dedupe key on Svix message id (mapped to TEXT pk).';
COMMENT ON TABLE public.email_suppression_list IS
  'Hard-bounce + complaint suppression. send_email() must check before dispatch.';

COMMIT;

-- Rollback:
-- BEGIN;
--   DROP POLICY IF EXISTS email_suppression_list_service ON public.email_suppression_list;
--   DROP POLICY IF EXISTS resend_webhook_events_service ON public.resend_webhook_events;
--   DROP TABLE IF EXISTS public.email_suppression_list;
--   DROP TABLE IF EXISTS public.resend_webhook_events;
-- COMMIT;
