# Author Memory v3 LLM Phase B Prime Signoff

Generated: 2026-05-03
Branch: feat/npc-memory-pivot

## Scope Completed

- Fixed managed Anthropic fallback so non-BYOK paid users can use Author LLM flows with tier token enforcement.
- Split monthly BYOK history from current BYOK state so BYOK on -> off immediately returns to managed cap enforcement.
- Moved Stripe managed-token overage metering out of the pre-call budget check and into the post-success LLM flow.
- Blocked duplicate checkout for existing subscribers by redirecting active-like subscription states to the billing portal.
- Left Phase B double-prime P2 polish items untouched: BYOK discount pending/error UI and subscription route Author UI gate consistency.
- No preview deployment was run.

## Before / After Diff Summary

### P0 Managed token plans

Before: `resolveAuthorAnthropicKey()` threw `BYOK_REQUIRED` in production when no user BYOK key existed, so managed token plans could not reach tier cap enforcement.

After: missing BYOK falls back to the managed Anthropic key chain (`AUTHOR_ANTHROPIC_DEV_API_KEY`, `AUTHOR_LLM_ANTHROPIC_API_KEY`, `LITHEON_ANTHROPIC_API_KEY`, `ANTHROPIC_API_KEY`). If none is configured, it throws `LLM_NOT_CONFIGURED`.

### P1 BYOK cap bypass

Before: `getAuthorModelUsageSummary()` set `byok_active` from any BYOK usage row in the current month. A user who disabled BYOK after using it once still bypassed managed caps.

After: `byok_active` means currently active. Historic monthly usage is exposed separately as `byok_had_this_month`, and budget bypass uses only the current BYOK state passed from resolver/status checks.

### P1 Overage metering

Before: `enforceAuthorTokenBudget()` emitted Stripe meter events before the Anthropic request using requested `maxTokens`.

After: the pre-call budget check only verifies allowance and meter-path availability. `meterAuthorTokenOverage()` runs after Anthropic success, JSON validation, and usage persistence, using actual `response.usage.output_tokens`. Failed calls and failed JSON validation emit no meter event.

### P1 Duplicate subscriptions

Before: `/api/billing/checkout` always created a new subscription checkout session for an existing Stripe customer.

After: existing subscriptions with active-like local state redirect to a Stripe billing portal session. `canceled`, `cancelled`, `incomplete`, and `incomplete_expired` states are allowed to start a new checkout.

## Phase B Prime Test Cases

- BYOK resolver uses managed production fallback when no BYOK key exists.
- BYOK resolver fails with `LLM_NOT_CONFIGURED` when neither BYOK nor managed key exists.
- Usage summary reports historic BYOK usage separately from current BYOK state.
- Usage summary sets `byok_active` from current BYOK state.
- Budget pre-call allows over-cap managed requests with a meter path but emits no Stripe event.
- Budget post-call emits Stripe meter events using actual output overage.
- Budget post-call emits no Stripe event when actual output remains below cap.
- Budget does not treat historic BYOK usage as current BYOK for cap bypass.
- Anthropic client meters managed overage only after a successful validated response.
- Anthropic client emits no meter event on Anthropic request failure.
- Anthropic client emits no meter event on JSON validation failure.
- Checkout redirects `active`, `trialing`, `past_due`, and missing-status existing subscriptions to the billing portal.
- Checkout allows `canceled`, `incomplete`, and `incomplete_expired` subscription states to start a new checkout.
- Checkout creates a Stripe customer before checkout when no customer exists.

## Verification

- Targeted Phase B prime tests: `npx vitest run src/__tests__/author/llm/byok-resolver.test.ts src/__tests__/author/llm/usage-store.test.ts src/__tests__/author/billing/token-budget.test.ts src/__tests__/author/llm/anthropic-client.test.ts src/__tests__/billing/checkout-route.test.ts` -> pass, 5 files, 31 tests.
- `npm run typecheck` -> pass.
- `npm run test -- --run` -> pass, 128 files, 1085 passed, 16 skipped.
- `npm run lint` -> pass.
- `npm run build` -> pass; route conflict check passed and Next production build completed.
