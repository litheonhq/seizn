-- v9 audit round 2 — DB hardening.
--
-- Locked 2026-05-08. Three classes of guardrails:
--   1. funnel_events.event_type CHECK so unknown event names cannot pollute
--      the funnel and silently break the admin metrics aggregator.
--   2. _self_select RLS policies bound TO authenticated explicitly. Without
--      a TO clause Postgres treats them as PUBLIC, which means the anon
--      role would be evaluated against `auth.uid() = user_id` (auth.uid()
--      returns NULL for anon, so it filters to zero rows — but the policy
--      still fires and leaks intent. Tightening makes the role surface
--      explicit for auditors.
--   3. JSONB shape CHECKs on v9 metric/snapshot columns so a typo at the
--      writer cannot insert array-shaped or scalar-shaped payloads that
--      would crash the dashboard reader.
--
-- Rollback plan: each ADD CONSTRAINT can be dropped individually with
--   ALTER TABLE <t> DROP CONSTRAINT <name>;
-- Each policy can be reverted to the un-roled form by re-running the
-- original DROP/CREATE without the TO clause.

BEGIN;

-- 1. funnel_events.event_type CHECK ----------------------------------------
-- Source of truth: src/lib/analytics/funnel.ts FUNNEL_EVENT_TYPES.
-- When adding a new event type: extend the TS union AND this constraint
-- in the same migration. Drop-then-add is required because IF NOT EXISTS
-- doesn't apply to constraints.

ALTER TABLE public.funnel_events
  DROP CONSTRAINT IF EXISTS funnel_events_event_type_check;

ALTER TABLE public.funnel_events
  ADD CONSTRAINT funnel_events_event_type_check
  CHECK (event_type IN (
    'signup',
    'byok_key_added',
    'byok_test_attempt',
    'first_extract',
    'first_check',
    'first_dialog',
    'hit_check_limit',
    'hit_dialog_limit',
    'hit_chapter_limit',
    'advanced_feature_blocked',
    'subscription_created',
    'subscription_canceled',
    'charter_swap_to_regular'
  ));

-- 2. _self_select RLS — bind to authenticated -----------------------------

DROP POLICY IF EXISTS marketing_attributions_self_select
  ON public.marketing_attributions;
CREATE POLICY marketing_attributions_self_select
  ON public.marketing_attributions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS funnel_events_self_select
  ON public.funnel_events;
CREATE POLICY funnel_events_self_select
  ON public.funnel_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS managed_entitlements_self_select
  ON public.managed_entitlements;
CREATE POLICY managed_entitlements_self_select
  ON public.managed_entitlements
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS continuity_reports_self_select
  ON public.continuity_reports;
CREATE POLICY continuity_reports_self_select
  ON public.continuity_reports
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS feature_usage_log_self_select
  ON public.feature_usage_log;
CREATE POLICY feature_usage_log_self_select
  ON public.feature_usage_log
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. JSONB shape CHECKs ---------------------------------------------------
-- Each metric/snapshot column must be a JSON object (or NULL where the
-- column is nullable). Arrays/scalars from a buggy writer would silently
-- break the dashboard aggregator.

ALTER TABLE public.funnel_events
  DROP CONSTRAINT IF EXISTS funnel_events_metadata_object_check;
ALTER TABLE public.funnel_events
  ADD CONSTRAINT funnel_events_metadata_object_check
  CHECK (metadata IS NULL OR jsonb_typeof(metadata) = 'object');

ALTER TABLE public.mrr_snapshots
  DROP CONSTRAINT IF EXISTS mrr_snapshots_by_tier_object_check;
ALTER TABLE public.mrr_snapshots
  ADD CONSTRAINT mrr_snapshots_by_tier_object_check
  CHECK (by_tier IS NULL OR jsonb_typeof(by_tier) = 'object');

ALTER TABLE public.mrr_snapshots
  DROP CONSTRAINT IF EXISTS mrr_snapshots_by_charter_object_check;
ALTER TABLE public.mrr_snapshots
  ADD CONSTRAINT mrr_snapshots_by_charter_object_check
  CHECK (by_charter IS NULL OR jsonb_typeof(by_charter) = 'object');

ALTER TABLE public.mrr_snapshots
  DROP CONSTRAINT IF EXISTS mrr_snapshots_by_provider_object_check;
ALTER TABLE public.mrr_snapshots
  ADD CONSTRAINT mrr_snapshots_by_provider_object_check
  CHECK (by_provider IS NULL OR jsonb_typeof(by_provider) = 'object');

ALTER TABLE public.managed_entitlements
  DROP CONSTRAINT IF EXISTS managed_entitlements_overrides_object_check;
ALTER TABLE public.managed_entitlements
  ADD CONSTRAINT managed_entitlements_overrides_object_check
  CHECK (custom_prompt_overrides IS NULL OR jsonb_typeof(custom_prompt_overrides) = 'object');

COMMIT;
