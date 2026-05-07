-- Subscription lifecycle columns on profiles for churn analytics.
--
-- Locked 2026-05-07. Stripe webhook handlers populate these so the churn
-- query and cohort analysis don't require Stripe API calls. Source of truth
-- still lives in Stripe — these columns are a denormalized cache.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_ended_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason           TEXT,
  ADD COLUMN IF NOT EXISTS charter_eligible        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS charter_signup_at       TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS profiles_subscription_active_idx
  ON public.profiles (subscription_started_at)
  WHERE subscription_ended_at IS NULL;

CREATE INDEX IF NOT EXISTS profiles_subscription_ended_idx
  ON public.profiles (subscription_ended_at DESC)
  WHERE subscription_ended_at IS NOT NULL;

COMMENT ON COLUMN public.profiles.subscription_started_at IS
  'First subscription start timestamp. Set by Stripe webhook customer.subscription.created.';
COMMENT ON COLUMN public.profiles.subscription_ended_at IS
  'Most recent subscription end timestamp (cancel/expire). NULL while active.';
COMMENT ON COLUMN public.profiles.cancel_reason IS
  'Free-form reason captured at cancellation flow. Optional.';
COMMENT ON COLUMN public.profiles.charter_eligible IS
  'TRUE if subscription started before 2027-05-01 launch window cutoff. Locks Charter price.';
COMMENT ON COLUMN public.profiles.charter_signup_at IS
  'Timestamp when Charter eligibility was assigned. Used by Stripe Schedule for swap-to-regular.';
