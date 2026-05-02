# Author Memory v3 LLM Phase B Triple-Prime Signoff

Generated: 2026-05-03
Branch: `feat/npc-memory-pivot`
Scope: Phase B triple-prime billing, budget, BYOK, and settings cadence fixes from `docs/architecture/seizn-author-audit-fix-handoff.md`.

## Summary

- Added a Stripe live subscription check before Author checkout session creation.
- Synced local profile subscription ID, status, and price ID when Stripe reports an active, trialing, or past-due subscription.
- Redirected any non-checkout-allowed live subscription to the billing portal and allowed checkout only for canceled, incomplete, incomplete-expired, or missing live subscription states.
- Changed Author managed token budgeting to use one billable total-token unit for cap checks, display summaries, and post-success metering.
- Estimated pre-call token budget from prompt/system input plus max output tokens.
- Metered post-call overage from actual Anthropic total usage instead of output tokens only.
- Included Anthropic prompt-cache write/read usage in the billable total using the v7 weights.
- Added `clearByok()` to the Author UI service and called it from BYOK DELETE so stale fixture/service state cannot reappear after DB removal.
- Changed account usage BYOK state to follow current BYOK status instead of OR-ing stale service fallback state.
- Added subscription API cadence output and settings UI price rendering from Stripe price ID or API cadence.
- Added yearly settings display with yearly price and a savings note.

## Acceptance

- [x] Checkout route performs `stripe.subscriptions.list({ customer, status: "all", limit: 10 })` before creating Checkout when a Stripe customer exists.
- [x] Active, trialing, and past-due live subscriptions sync the local profile and redirect to `/api/account/billing-portal` behavior without creating a new Checkout session.
- [x] Canceled, incomplete, incomplete-expired, or missing live subscriptions allow a new Checkout session.
- [x] Token cap, display, and overage metering use the single billable total-token unit.
- [x] Pre-call managed budget uses estimated input tokens plus max output tokens.
- [x] Post-call managed overage uses actual total tokens from the Anthropic response.
- [x] BYOK users remain unlimited and unmetered.
- [x] BYOK DELETE clears the Author UI service fallback; subsequent GET and usage responses return missing/inactive instead of stale active.
- [x] Settings subscription display respects monthly/yearly cadence from Stripe price IDs.
- [x] Yearly Indie and Pro settings states show yearly price plus a yearly savings note.
- [x] No preview deployment was run. Preview deployments are prohibited.

## Migration Decision

No database migration is required for this phase.

Reason: the existing `model_usage` ledger already stores per-call `tokens_in` and `tokens_out`, and monthly summaries derive `total_tokens` from those fields. The schema does not need a new total-token column. Historical rows remain valid because they already summarize as `tokens_in + tokens_out`; prompt-cache weighted billable input applies to future Anthropic responses that include cache usage counters.

## Phase B Triple-Prime Test Coverage

- Checkout live subscription coverage: 12 route tests covering local active, webhook-lag live active, stale local active with canceled live subscription, canceled/incomplete states, multiple subscriptions, other live states such as paused, customer creation, and no-card trial session creation.
- Token budget coverage: 10 unit tests covering BYOK unlimited, below-cap usage, pre-call overage path, post-call total-token metering, under-cap actual usage, historic BYOK non-bypass, fail-closed no-meter path, Enterprise unlimited, large input estimate, and cache weighted total tokens.
- Anthropic client coverage: 7 unit tests covering BYOK usage recording, managed budget estimated total tokens, post-success total-token metering, failed request no-meter, and failed JSON validation no-meter.
- BYOK route coverage: 3 route tests covering POST then GET, DELETE then GET, and POST then DELETE then GET stale fallback blocking.
- Settings yearly cadence coverage: 4 UI tests covering Indie monthly, Indie yearly, Pro monthly, and Pro yearly Stripe price ID display.
- Subscription route coverage: cadence mapping from `stripe_price_id` is included in the route guard test.

## Verification

- Targeted Phase B triple-prime tests: `npm run test:run -- src/__tests__/billing/checkout-route.test.ts src/__tests__/author/billing/token-budget.test.ts src/__tests__/author/llm/anthropic-client.test.ts src/__tests__/billing/byok-route.test.ts src/__tests__/author-ui/settings-ui.test.tsx src/__tests__/billing/subscription-route.test.ts` - passed, 6 files, 52 tests.
- `npm run typecheck` - passed.
- `npm run test:run` - passed, 138 files, 1165 passed, 16 skipped.
- `npm run lint` - passed.
- `npm run build` - passed; route conflict check passed and Next production build completed.
- `npm run verify:knot-separation` - passed, 0 matches.

## Files Changed

- `docs/author-memory-v3-llm-phaseB-triple-prime-signoff.md`
- `src/__tests__/author-ui/settings-ui.test.tsx`
- `src/__tests__/author/billing/token-budget.test.ts`
- `src/__tests__/author/llm/anthropic-client.test.ts`
- `src/__tests__/billing/byok-route.test.ts`
- `src/__tests__/billing/checkout-route.test.ts`
- `src/__tests__/billing/subscription-route.test.ts`
- `src/app/api/account/byok/route.ts`
- `src/app/api/account/subscription/route.ts`
- `src/app/api/account/usage/route.ts`
- `src/app/api/billing/checkout/route.ts`
- `src/components/settings/author-settings-types.ts`
- `src/components/settings/subscription-section.tsx`
- `src/lib/author/billing/token-budget.ts`
- `src/lib/author/llm/anthropic-client.ts`
- `src/lib/author/llm/types.ts`
- `src/lib/author/ui/service.ts`
