-- Append-only funnel events log for conversion analytics.
--
-- Locked 2026-05-07. Single source of truth for the v9 launch funnel:
--   signup → byok_key_added → first_extract → first_check → first_dialog
--          → hit_check_limit / hit_dialog_limit / hit_chapter_limit
--          → subscription_created → subscription_canceled
--
-- Append-only by design — never update or delete. The 30/90-day cohort
-- conversion query and admin metrics dashboard read this table directly.

CREATE TABLE IF NOT EXISTS public.funnel_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  metadata     JSONB,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS funnel_events_user_event_idx
  ON public.funnel_events (user_id, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS funnel_events_event_time_idx
  ON public.funnel_events (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS funnel_events_occurred_idx
  ON public.funnel_events (occurred_at DESC);

ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

-- Block UPDATE and DELETE so the log stays append-only even via service_role.
CREATE OR REPLACE FUNCTION public.funnel_events_reject_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'funnel_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS funnel_events_no_update ON public.funnel_events;
CREATE TRIGGER funnel_events_no_update
  BEFORE UPDATE ON public.funnel_events
  FOR EACH ROW
  EXECUTE FUNCTION public.funnel_events_reject_mutation();

DROP TRIGGER IF EXISTS funnel_events_no_delete ON public.funnel_events;
CREATE TRIGGER funnel_events_no_delete
  BEFORE DELETE ON public.funnel_events
  FOR EACH ROW
  EXECUTE FUNCTION public.funnel_events_reject_mutation();

REVOKE UPDATE, DELETE ON public.funnel_events FROM service_role;

DROP POLICY IF EXISTS funnel_events_self_select
  ON public.funnel_events;
CREATE POLICY funnel_events_self_select
  ON public.funnel_events
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS funnel_events_service_role_insert_select
  ON public.funnel_events;
CREATE POLICY funnel_events_service_role_insert_select
  ON public.funnel_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.funnel_events IS
  'Append-only funnel events. Triggers block UPDATE/DELETE to preserve audit integrity.';
COMMENT ON COLUMN public.funnel_events.event_type IS
  'Allowed values include: signup, byok_key_added, first_extract, first_check, first_dialog, hit_check_limit, hit_dialog_limit, hit_chapter_limit, advanced_feature_blocked, subscription_created, subscription_canceled, charter_swap_to_regular.';
