# Author Memory v3 LLM Phase B Double-Prime Signoff

Generated: 2026-05-03
Branch: feat/npc-memory-pivot

## Scope Completed

- Added explicit BYOK discount sync states: `inactive`, `pending`, `applied`, and `error`.
- Changed BYOK discount persistence so `byok_discount_active=true` is written only after a Stripe subscription coupon update succeeds.
- Added pending handling for missing Stripe customers and customer-only pending subscription states.
- Added error handling for missing Stripe secret and Stripe coupon API failures without blocking BYOK key save/delete flows.
- Updated `/dashboard/billing` to display BYOK discount as `Applied`, `Pending`, `Error`, or `Not active`.
- Wrapped `/api/account/subscription` with `withAuthorUiService()` so Author UI auth, allowlist, CSRF, and normalized profile IDs are consistent with adjacent BYOK/usage routes.
- Added Supabase migration `20260503001_author_byok_discount_status.sql` for `byok_discount_status` and `byok_discount_error`.
- No preview deployment was run.

## Before / After Diff Summary

### BYOK discount state

Before: missing Stripe customer, missing Stripe secret, and customer-only pending cases could still write `byok_discount_active=true`, so the billing UI showed `Applied` even when no Stripe coupon had actually been applied.

After: only subscription coupon success writes `byok_discount_active=true` and `byok_discount_status='applied'`. Missing customer and customer-only paths write `pending`; missing Stripe config and Stripe API failures write `error`.

### Subscription route gate

Before: `/api/account/subscription` used raw `auth()` and manual CSRF checks, unlike Author UI routes such as `/api/account/byok` and `/api/account/usage`.

After: GET and POST go through `withAuthorUiService()`, which applies `getRequestUser()` ID normalization, `AUTHOR_UI_ENABLED` / production allowlist checks, and Author UI CSRF handling.

## Phase B Double-Prime Test Cases

- BYOK discount applies an active subscription coupon and records `applied`.
- BYOK discount removal records `inactive`.
- Customer-only BYOK discount records `pending`.
- Missing Stripe customer records `pending`.
- Missing Stripe secret records `error`.
- Stripe coupon API failure records `error`.
- Subscription route returns 401 when the Author UI request user is missing.
- Subscription route returns 403 when Author UI is disabled.
- Subscription route returns 403 for production users outside the allowlist.
- Subscription route uses normalized Author UI user ID and returns `byok_discount_status`.
- Subscription route applies Author UI CSRF checks to mutations.

## Verification

- Targeted Phase B double-prime tests: `npx vitest run src/__tests__/billing/byok-discount.test.ts src/__tests__/billing/subscription-route.test.ts` -> pass, 2 files, 11 tests.
- Author UI contract JSON parse check -> pass.
- `npm run typecheck` -> pass.
- `npm run test -- --run` -> pass, 129 files, 1092 passed, 16 skipped.
- `npm run lint` -> pass.
- `npm run build` -> pass; route conflict check passed and Next production build completed.

## Notes

- The new migration was added but not applied to a live Supabase database in this local session.
