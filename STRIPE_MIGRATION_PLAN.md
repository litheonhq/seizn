# Stripe Migration Plan: Seizn Payment System

> **Date**: 2026-03-05
> **Status**: Research / Planning (no code changes yet)
> **Author**: Claude Code analysis

---

## 1. Current Architecture Summary

Seizn currently has **three** payment provider integrations in various states:

### 1.1 LemonSqueezy (Legacy, Dormant)
- **Webhook**: `src/app/api/webhooks/lemonsqueezy/route.ts`
- **DB Migration**: `supabase/migrations/004_lemonsqueezy_billing.sql`
- **DB Columns**: `profiles.lemonsqueezy_customer_id` (INTEGER), `profiles.lemonsqueezy_subscription_id` (INTEGER)
- **Variant Mapping**: Hardcoded `VARIANT_TO_PLAN` map (variant IDs -> plan names)
- **Status**: First payment provider. Columns retained for historical data. No longer the active checkout flow.

### 1.2 Paddle (Current Primary)
- **Client Checkout**: `src/components/checkout-button.tsx` (Paddle.Checkout.open overlay)
- **Script Loader**: `src/components/paddle-init.tsx` (loads `cdn.paddle.com/paddle/v2/paddle.js`)
- **Config**: `src/lib/paddle-config.ts` (price ID mapping, plan utilities)
- **Webhook**: `src/app/api/webhooks/paddle/route.ts` (full implementation)
- **DB Migration**: `supabase/migrations/067_paddle_billing.sql`
- **DB Columns**: `profiles.paddle_customer_id` (TEXT), `profiles.paddle_subscription_id` (TEXT)
- **Env Vars**: `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `NEXT_PUBLIC_PADDLE_ENVIRONMENT`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`
- **Status**: Active primary checkout. Used by pricing page and summer landing page. Price IDs are placeholders (`pri_placeholder_*`).

### 1.3 Stripe (Partially Implemented)
- **Config**: `src/lib/stripe-config.ts` (price ID mapping, plan utilities, subscription status mapping)
- **Webhook**: `src/app/api/webhooks/stripe/route.ts` (full implementation with audit logging and email notifications)
- **DB Columns**: `profiles.stripe_customer_id` (TEXT), `profiles.stripe_subscription_id` (TEXT) -- from `001_initial_schema.sql`
- **Env Vars**: `STRIPE_WEBHOOK_SECRET` (in `.env.example`)
- **Status**: Webhook handler and config already exist. **Missing**: client-side checkout, Stripe SDK, API key config, customer portal.

### 1.4 Shared Infrastructure (Payment-Agnostic)
- **Plan Limits**: `src/lib/plan-limits.ts` -- plans: free / starter / plus / pro / enterprise
- **DB Plan Column**: `profiles.plan` (TEXT, CHECK constraint: free/plus/pro/enterprise) -- **Note: "starter" is NOT in the DB CHECK constraint**
- **Plan Trigger**: `update_plan_limits()` function (auto-updates memory_limit and api_calls_limit)
- **Subscription Fields**: `subscription_ends_at`, `subscription_renews_at`, `subscription_cancelled`, `plan_updated_at`
- **Payment Failure Fields**: `subscription_payment_failed`, `subscription_payment_failed_at` (used by Paddle and Stripe webhooks but not in any migration -- may need adding)
- **Subscription Expiry Cron**: `src/app/api/cron/subscription-expiry/route.ts` (daily midnight, downgrades expired users)
- **Database Types**: `src/types/database.ts` (Profile interface has `stripe_customer_id` and `stripe_subscription_id`)
- **Client Pages**: `src/app/[locale]/pricing/pricing-client.tsx`, `src/app/[locale]/summer/summer-client.tsx`
- **Pricing Tiers**: Free ($0), Starter ($9/mo), Plus ($29/mo), Pro ($99/mo), Enterprise ($499/mo)

---

## 2. Stripe Equivalent for Each Component

| Current (Paddle)                     | Stripe Equivalent                              | Status     |
|--------------------------------------|-------------------------------------------------|------------|
| `checkout-button.tsx` (Paddle overlay) | Stripe Checkout (redirect) or Stripe.js Elements | **Needs creation** |
| `paddle-init.tsx` (Paddle.js loader)   | `@stripe/stripe-js` loadStripe()               | **Needs creation** |
| `paddle-config.ts` (price mapping)     | `stripe-config.ts` (already exists)            | **Needs real price IDs** |
| Paddle webhook route                    | Stripe webhook route (already exists)           | **Already done** |
| `PADDLE_API_KEY`                        | `STRIPE_SECRET_KEY`                             | **Needs adding** |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`       | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`           | **Needs adding** |
| `PADDLE_WEBHOOK_SECRET`                 | `STRIPE_WEBHOOK_SECRET` (exists in .env.example) | **Exists** |
| Paddle Customer Portal                  | Stripe Customer Portal (`/api/billing/portal`)  | **Needs creation** |
| No Stripe SDK dependency                | `stripe` npm package (server), `@stripe/stripe-js` (client) | **Needs installation** |

---

## 3. Files to Create / Modify

### 3.1 New Files to Create

| File | Purpose |
|------|---------|
| `src/components/stripe-checkout-button.tsx` | Client component that creates Stripe Checkout sessions |
| `src/app/api/billing/create-checkout/route.ts` | API route to create Stripe Checkout Session server-side |
| `src/app/api/billing/portal/route.ts` | API route to create Stripe Customer Portal session |
| `src/app/api/billing/subscription/route.ts` | API route to query/manage current subscription status |
| `supabase/migrations/069_stripe_full_migration.sql` | DB migration for any missing columns |

### 3.2 Existing Files to Modify

| File | Changes |
|------|---------|
| `src/lib/stripe-config.ts` | Replace placeholder price IDs with real Stripe `price_*` IDs |
| `src/app/[locale]/pricing/pricing-client.tsx` | Replace `<CheckoutButton>` (Paddle) with Stripe checkout; remove `<PaddleInit />`; remove `window.createLemonSqueezy` |
| `src/app/[locale]/summer/summer-client.tsx` | Same as pricing: replace Paddle checkout with Stripe |
| `src/components/checkout-button.tsx` | Rewrite to use Stripe (or replace with `stripe-checkout-button.tsx` and update imports) |
| `src/components/paddle-init.tsx` | **Delete** (no longer needed) |
| `src/lib/paddle-config.ts` | **Delete** (replaced by `stripe-config.ts`) |
| `src/app/api/webhooks/paddle/route.ts` | **Keep temporarily** for in-flight subscriptions, then delete |
| `src/app/api/webhooks/lemonsqueezy/route.ts` | **Delete** (fully deprecated) |
| `.env.example` | Add `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; remove Paddle vars |
| `.env.docker.example` | Remove LemonSqueezy vars; add Stripe vars |
| `package.json` | Add `stripe` and `@stripe/stripe-js` dependencies |
| `src/types/database.ts` | Already has `stripe_customer_id` and `stripe_subscription_id` -- no changes needed |
| `src/lib/plan-limits.ts` | Update comment (line 6: "Connected to billing (Paddle)" -> "Connected to billing (Stripe)") |
| `src/app/api/webhooks/stripe/route.ts` | Already complete -- may want to add `subscription_paused` column support if Stripe pause is used |

### 3.3 Files That Need No Changes (Already Stripe-Compatible)
- `src/app/api/cron/subscription-expiry/route.ts` -- uses generic `profiles` columns
- `src/lib/plan-limits.ts` -- plan logic is provider-agnostic
- `src/types/database.ts` -- already has Stripe columns in Profile interface

---

## 4. Database Schema Changes

### 4.1 Current Billing Columns on `profiles`

```
-- From 001_initial_schema.sql
stripe_customer_id TEXT          -- Already exists
stripe_subscription_id TEXT      -- Already exists

-- From 004_lemonsqueezy_billing.sql
lemonsqueezy_customer_id INTEGER -- Legacy
lemonsqueezy_subscription_id INTEGER -- Legacy
plan_updated_at TIMESTAMPTZ      -- Shared
subscription_ends_at TIMESTAMPTZ -- Shared
subscription_renews_at TIMESTAMPTZ -- Shared
subscription_cancelled BOOLEAN   -- Shared

-- From 067_paddle_billing.sql
paddle_customer_id TEXT          -- Current primary
paddle_subscription_id TEXT      -- Current primary
```

### 4.2 Migration Needed (069_stripe_full_migration.sql)

```sql
-- Seizn AI Memory Server - Complete Stripe Migration
-- Stripe is now the sole payment processor.

-- 1. Add missing subscription status columns (referenced by webhooks but may not exist)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS subscription_payment_failed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS subscription_payment_failed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_paused BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS subscription_paused_at TIMESTAMPTZ;

-- 2. Update plan CHECK constraint to include 'starter'
-- The current CHECK only allows: free, plus, pro, enterprise
-- The plan-limits.ts and stripe-config.ts both define 'starter'
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_plan_check
    CHECK (plan IN ('free', 'starter', 'plus', 'pro', 'enterprise'));

-- 3. Index for Stripe customer lookup (if not exists from initial schema)
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer
    ON profiles(stripe_customer_id)
    WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription
    ON profiles(stripe_subscription_id)
    WHERE stripe_subscription_id IS NOT NULL;

-- 4. Update the plan limits trigger to include 'starter' tier
CREATE OR REPLACE FUNCTION update_plan_limits()
RETURNS TRIGGER AS $$
BEGIN
    CASE NEW.plan
        WHEN 'free' THEN
            NEW.memory_limit := 12000;
            NEW.api_calls_limit := 1000;
        WHEN 'starter' THEN
            NEW.memory_limit := 50000;
            NEW.api_calls_limit := 5000;
        WHEN 'plus' THEN
            NEW.memory_limit := 100000;
            NEW.api_calls_limit := 10000;
        WHEN 'pro' THEN
            NEW.memory_limit := 1000000;
            NEW.api_calls_limit := 100000;
        WHEN 'enterprise' THEN
            NEW.memory_limit := -1;
            NEW.api_calls_limit := -1;
        ELSE
            NEW.memory_limit := 12000;
            NEW.api_calls_limit := 1000;
    END CASE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Comments
COMMENT ON COLUMN profiles.stripe_customer_id IS 'Stripe customer ID (e.g., cus_xxx). Primary payment processor as of 2026-03.';
COMMENT ON COLUMN profiles.stripe_subscription_id IS 'Stripe subscription ID (e.g., sub_xxx). Links to active subscription in Stripe.';

-- 6. (Optional) After confirming no active Paddle/LS subscriptions remain:
-- ALTER TABLE profiles DROP COLUMN IF EXISTS paddle_customer_id;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS paddle_subscription_id;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS lemonsqueezy_customer_id;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS lemonsqueezy_subscription_id;
-- DROP INDEX IF EXISTS idx_profiles_paddle_customer;
-- DROP INDEX IF EXISTS idx_profiles_paddle_subscription;
-- DROP INDEX IF EXISTS idx_profiles_lemonsqueezy_customer;
```

### 4.3 Critical DB Issue Found

The `profiles.plan` CHECK constraint in `001_initial_schema.sql` only allows `('free', 'plus', 'pro', 'enterprise')` but both `plan-limits.ts` and `stripe-config.ts` define a `'starter'` tier. Any webhook trying to set `plan = 'starter'` will fail with a constraint violation. This must be fixed in the migration.

---

## 5. Environment Variables

### 5.1 Variables to Add

| Variable | Scope | Description |
|----------|-------|-------------|
| `STRIPE_SECRET_KEY` | Server | Stripe secret key (`sk_live_*` or `sk_test_*`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client | Stripe publishable key (`pk_live_*` or `pk_test_*`) |

### 5.2 Variables Already Present
| Variable | Status |
|----------|--------|
| `STRIPE_WEBHOOK_SECRET` | Already in `.env.example` |

### 5.3 Variables to Remove (After Migration)
| Variable | Reason |
|----------|--------|
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | Paddle no longer used |
| `NEXT_PUBLIC_PADDLE_ENVIRONMENT` | Paddle no longer used |
| `PADDLE_API_KEY` | Paddle no longer used |
| `PADDLE_WEBHOOK_SECRET` | Paddle no longer used |
| `LEMONSQUEEZY_API_KEY` | LemonSqueezy no longer used |
| `LEMONSQUEEZY_STORE_ID` | LemonSqueezy no longer used |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | LemonSqueezy no longer used |

### 5.4 Vercel Environment Setup
- Add `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to Vercel project settings
- Keep `STRIPE_WEBHOOK_SECRET` (update value to match Stripe webhook endpoint)
- Remove Paddle and LemonSqueezy vars after transition period

---

## 6. NPM Dependencies

### 6.1 Add
```bash
npm install stripe @stripe/stripe-js
```

- `stripe` (server-side): Stripe Node.js SDK for creating checkout sessions, managing subscriptions, customer portal
- `@stripe/stripe-js` (client-side): Stripe.js loader for redirectToCheckout

### 6.2 Remove (After Migration)
- No Paddle or LemonSqueezy npm packages are currently installed (they use CDN scripts)

---

## 7. Step-by-Step Migration Order

### Phase 0: Preparation (No User Impact)
1. **Create Stripe account** and configure products/prices in Stripe Dashboard
   - Products: Starter ($9/mo, $90/yr), Plus ($29/mo, $290/yr), Pro ($99/mo, $990/yr), Enterprise ($499/mo, $4990/yr)
   - Record all `price_*` IDs
2. **Install npm packages**: `stripe` and `@stripe/stripe-js`
3. **Run database migration** `069_stripe_full_migration.sql`:
   - Add missing columns (`subscription_payment_failed`, `subscription_paused`, etc.)
   - Fix `plan` CHECK constraint to include `'starter'`
   - Update `update_plan_limits()` function
   - Add Stripe indexes
4. **Update `stripe-config.ts`** with real Stripe price IDs
5. **Set environment variables** in Vercel (test keys first)
6. **Configure Stripe webhook** endpoint: `https://www.seizn.com/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `customer.created`, `customer.updated`

### Phase 1: Build Stripe Checkout (Behind Feature Flag)
7. **Create Stripe server library** (`src/lib/stripe.ts`):
   ```typescript
   import Stripe from 'stripe';
   export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
     apiVersion: '2025-12-18.acacia',
   });
   ```
8. **Create checkout API route** (`src/app/api/billing/create-checkout/route.ts`):
   - Accepts `priceId`, `userId`
   - Creates Stripe Checkout Session with `mode: 'subscription'`
   - Passes `client_reference_id: userId` and `metadata: { user_id: userId }`
   - Returns session URL
9. **Create customer portal API route** (`src/app/api/billing/portal/route.ts`):
   - Creates Stripe Customer Portal session for managing subscriptions
10. **Create Stripe checkout button component** (`src/components/stripe-checkout-button.tsx`):
    - Calls `/api/billing/create-checkout` then redirects to Stripe
11. **Configure Stripe Customer Portal** in Stripe Dashboard:
    - Allow plan changes, cancellation, payment method updates

### Phase 2: Switch Checkout Flow
12. **Update pricing page** (`pricing-client.tsx`):
    - Remove `<PaddleInit />` component
    - Remove `window.createLemonSqueezy` code
    - Replace `<CheckoutButton>` with Stripe checkout button
    - Update `PLAN_VARIANTS` imports to use Stripe price IDs
13. **Update summer landing page** (`summer-client.tsx`):
    - Same changes as pricing page
14. **Delete Paddle files**:
    - `src/components/paddle-init.tsx`
    - `src/lib/paddle-config.ts`
15. **Rewrite `checkout-button.tsx`** to use Stripe instead of Paddle overlay

### Phase 3: Cleanup Legacy Code
16. **Delete LemonSqueezy webhook**: `src/app/api/webhooks/lemonsqueezy/route.ts`
17. **Keep Paddle webhook temporarily** for any in-flight subscriptions (users who subscribed via Paddle and haven't renewed via Stripe yet)
18. **Update `.env.example`** and `.env.docker.example`
19. **Update `plan-limits.ts`** comment

### Phase 4: Final Cleanup (After All Paddle Subscriptions Expire)
20. **Delete Paddle webhook**: `src/app/api/webhooks/paddle/route.ts`
21. **Run column cleanup migration** (the commented-out DROP statements in step 3)
22. **Remove Paddle environment variables** from Vercel

---

## 8. Detailed File Changes Summary

### New Files
| # | File | Lines (est.) |
|---|------|-------------|
| 1 | `src/lib/stripe.ts` | ~10 |
| 2 | `src/app/api/billing/create-checkout/route.ts` | ~80 |
| 3 | `src/app/api/billing/portal/route.ts` | ~50 |
| 4 | `src/app/api/billing/subscription/route.ts` | ~60 |
| 5 | `supabase/migrations/069_stripe_full_migration.sql` | ~60 |

### Modified Files
| # | File | Nature of Change |
|---|------|-----------------|
| 1 | `src/lib/stripe-config.ts` | Replace placeholder price IDs |
| 2 | `src/components/checkout-button.tsx` | Rewrite: Paddle -> Stripe redirect |
| 3 | `src/app/[locale]/pricing/pricing-client.tsx` | Remove Paddle/LS, use Stripe checkout |
| 4 | `src/app/[locale]/summer/summer-client.tsx` | Remove Paddle/LS, use Stripe checkout |
| 5 | `.env.example` | Add Stripe keys, remove Paddle/LS |
| 6 | `.env.docker.example` | Add Stripe keys, remove LS |
| 7 | `package.json` | Add stripe, @stripe/stripe-js |
| 8 | `src/lib/plan-limits.ts` | Comment update only |

### Deleted Files (Eventually)
| # | File | When |
|---|------|------|
| 1 | `src/components/paddle-init.tsx` | Phase 2 |
| 2 | `src/lib/paddle-config.ts` | Phase 2 |
| 3 | `src/app/api/webhooks/lemonsqueezy/route.ts` | Phase 3 |
| 4 | `src/app/api/webhooks/paddle/route.ts` | Phase 4 |

---

## 9. Rollback Plan

### If Issues Occur During Phase 1 (Build)
- No user impact. Simply revert the git branch. Paddle remains active.

### If Issues Occur During Phase 2 (Switch)
1. **Immediate**: Revert the pricing page and summer page to use Paddle `<CheckoutButton>` again
2. **Restore** `<PaddleInit />` component in pricing-client.tsx
3. **Paddle webhook** is still active and handles existing subscriptions
4. **DB is backward-compatible**: Stripe columns don't conflict with Paddle columns. Both can coexist.

### If Issues Occur During Phase 3/4 (Cleanup)
- Phase 3 only deletes legacy (LemonSqueezy) code that is already unused
- Phase 4 should only run after confirming zero active Paddle subscriptions
- Database column drops are wrapped in `IF EXISTS` for safety

### Key Rollback Principles
- **Never delete Paddle webhook** before all Paddle subscriptions have either expired or been migrated
- **Keep all provider DB columns** until fully confident (months after migration)
- **Feature flag** the checkout flow so Paddle and Stripe can coexist during transition
- **All webhook routes** can coexist at different URL paths without conflict

---

## 10. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `plan = 'starter'` rejected by DB CHECK | Webhook failures for starter plan | Fix CHECK constraint before enabling Stripe checkout |
| `subscription_payment_failed` column missing | Stripe webhook errors | Add column in migration before going live |
| Existing Paddle subscribers disrupted | Loss of paying users | Keep Paddle webhook active; only delete after all subs expire |
| Stripe price IDs misconfigured | Wrong plan assigned | Test thoroughly in Stripe sandbox with test webhooks |
| Double-billing during transition | User charged by both | Disable Paddle checkout before enabling Stripe; never run both simultaneously |
| Webhook signature verification fails | Missed subscription events | Test with Stripe CLI (`stripe listen --forward-to`) before production |

---

## 11. Testing Checklist

- [ ] Stripe sandbox products/prices created
- [ ] `stripe listen --forward-to localhost:3000/api/webhooks/stripe` works locally
- [ ] Checkout creates subscription and sets `plan` correctly
- [ ] Plan upgrade (starter -> pro) updates correctly
- [ ] Plan downgrade works
- [ ] Cancellation sets `subscription_cancelled = true`
- [ ] Subscription expiry cron downgrades to free
- [ ] Payment failure email sends
- [ ] Customer portal accessible and functional
- [ ] `starter` plan accepted by DB (CHECK constraint fixed)
- [ ] Existing free users unaffected
- [ ] Audit logs capture all billing events
