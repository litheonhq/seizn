-- Round 3 cleanup — drop legacy v7 BYOK discount + Lemon Squeezy columns.
--
-- Locked 2026-05-08. The v9 catalog (live since 2026-05-07) prices BYOK as
-- separate Charter price IDs, so the old "50% Stripe coupon discount" code
-- path is dead. Lemon Squeezy was retired earlier (Stripe only). The
-- accompanying PR removes:
--   - src/lib/stripe/byok-discount.ts
--   - src/app/api/webhooks/lemonsqueezy/route.ts
--   - byok_discount_* references from billing/settings UI + types + tests
--
-- This migration drops the now-unused columns. Indexes on those columns
-- (created in 20260502008_author_stripe_billing.sql /
-- 20260503006_author_byok_discount_status.sql /
-- 004_lemonsqueezy_billing.sql) drop automatically with the columns.
--
-- Rollback plan: re-add the columns with their original types. Data is
-- gone after the drop, but those values were no longer load-bearing —
-- v9 derives BYOK status from the Stripe price ID, not these columns.

BEGIN;

-- byok_discount_* family (v8-era Stripe coupon sync)
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS byok_discount_active,
  DROP COLUMN IF EXISTS byok_discount_coupon,
  DROP COLUMN IF EXISTS byok_discount_updated_at,
  DROP COLUMN IF EXISTS byok_discount_status,
  DROP COLUMN IF EXISTS byok_discount_error;

-- Drop the now-orphaned CHECK constraint name in case it survives
-- (DROP COLUMN drops CHECKs that reference the column, but be explicit).
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_byok_discount_status_check;

-- Lemon Squeezy (replaced by Stripe in 067_paddle_billing → fully retired)
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS lemonsqueezy_customer_id,
  DROP COLUMN IF EXISTS lemonsqueezy_subscription_id;

COMMIT;
