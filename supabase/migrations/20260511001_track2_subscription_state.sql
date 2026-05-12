-- Track 2 (API/MCP) subscriptions can coexist with Track 1 Author Memory
-- subscriptions. Keep their billing state separate instead of overloading
-- profiles.plan / stripe_subscription_id, which are Track 1 fields.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS track2_tier TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS track2_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS track2_subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS track2_price_id TEXT,
  ADD COLUMN IF NOT EXISTS track2_billing_cadence TEXT,
  ADD COLUMN IF NOT EXISTS track2_price_lock_version TEXT,
  ADD COLUMN IF NOT EXISTS track2_current_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS track2_current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS track2_subscription_renews_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS track2_subscription_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS track2_subscription_payment_failed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS track2_subscription_payment_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS track2_subscription_ended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS track2_synced_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_track2_tier_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_track2_tier_check
      CHECK (track2_tier IN ('free', 'indie', 'pro', 'studio', 'studio_managed', 'enterprise'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_track2_billing_cadence_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_track2_billing_cadence_check
      CHECK (track2_billing_cadence IS NULL OR track2_billing_cadence IN ('monthly', 'yearly'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS profiles_track2_subscription_id_idx
  ON public.profiles(track2_subscription_id)
  WHERE track2_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_track2_tier_idx
  ON public.profiles(track2_tier)
  WHERE track2_tier <> 'free';

COMMENT ON COLUMN public.profiles.track2_tier IS
  'Track 2 API/MCP billing tier. Separate from Track 1 Author Memory plan.';
COMMENT ON COLUMN public.profiles.track2_subscription_id IS
  'Stripe subscription id for Track 2 API/MCP billing.';
COMMENT ON COLUMN public.profiles.track2_price_id IS
  'Stripe price id for the active or most recently synced Track 2 subscription.';
