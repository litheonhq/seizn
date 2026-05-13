-- Partial unique index on funnel_events for "first_*" event types.
--
-- recordFirstFunnelEvent (src/lib/analytics/funnel.ts:91) currently does
-- SELECT-then-INSERT, which has a race window: two concurrent Coach
-- analyzes on first run can both pass the lookup and both insert. This
-- partial unique index lets us switch the helper to INSERT ... ON CONFLICT
-- DO NOTHING for the four "first_*" event types, eliminating the race.
--
-- Why partial: most event types (subscription_canceled, hit_check_limit,
-- etc.) ARE expected to repeat. The "first_*" group is the only one with
-- per-user uniqueness semantics.

CREATE UNIQUE INDEX IF NOT EXISTS funnel_events_first_unique
  ON public.funnel_events (user_id, event_type)
  WHERE event_type IN (
    'first_extract',
    'first_check',
    'first_dialog',
    'first_coach_analyze'
  );

COMMENT ON INDEX public.funnel_events_first_unique IS
  'Enforces one row per (user_id, event_type) for first_* events. Pairs with INSERT ... ON CONFLICT DO NOTHING in recordFirstFunnelEvent.';
