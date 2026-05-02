-- Author launch Phase B: Stripe v7 subscription state, BYOK discount, and token caps.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free', 'starter', 'plus', 'indie', 'pro', 'studio', 'enterprise'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_current_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_payment_failed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_payment_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS byok_discount_active BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS byok_discount_coupon TEXT,
  ADD COLUMN IF NOT EXISTS byok_discount_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_lock_version TEXT DEFAULT 'v7';

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
  ON public.profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription_id
  ON public.profiles (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_author_plan
  ON public.profiles (plan)
  WHERE plan IN ('indie', 'pro', 'studio', 'enterprise');

COMMENT ON COLUMN public.profiles.stripe_subscription_status IS
  'Raw Stripe subscription status from the latest subscription webhook.';
COMMENT ON COLUMN public.profiles.subscription_status IS
  'Internal normalized subscription status used by dashboard billing.';
COMMENT ON COLUMN public.profiles.stripe_price_id IS
  'Current Stripe v7 price ID for the author billing tier and cadence.';
COMMENT ON COLUMN public.profiles.byok_discount_active IS
  'Whether the SEIZN_BYOK_50 discount has been applied or queued for the billing customer.';
COMMENT ON COLUMN public.profiles.price_lock_version IS
  'Author launch billing price lock version, currently v7.';
