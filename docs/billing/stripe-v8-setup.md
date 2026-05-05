# Stripe v8 Track 2 product setup

**Scope:** Track 2 (API + MCP, USD) only. Track 1 (Web, KRW) and Track 3 (Tauri, KRW) products are owned by their own track cycles. v7 (`prod_UNGac…`) products stay active for grandfathered Track 1 subscribers and **are not modified by this Phase 3**.

**Status:** Spec only. **No live Stripe API calls** are made from this repo. The actual product/price creation happens during Phase 8 (human task) — see `## Phase 8 — Activation steps` at the bottom.

## Tiers (v8)

| Tier | Monthly USD | Yearly USD | Stripe product | Notes |
|---|---|---|---|---|
| Free | $0 | — | (no product, plan flag only) | 100 calls/day quota |
| Indie | $9 | $90 | `prod_TODO_v8_indie` | BYOK required for `check`/`timeline` |
| Pro | $19 | $190 | `prod_TODO_v8_pro` | + `projects:write` scope |
| Studio | $99 | $990 | `prod_TODO_v8_studio` | + `audit:read` scope, 5 keys/user cap |
| Studio Managed | $299 | $2,990 | `prod_TODO_v8_studio_managed` | + `managed_llm`, $0.15/Opus call metered overage |
| Enterprise | (contact) | (contact) | `prod_TODO_v8_enterprise` | Custom quota / scopes |

**Source of truth in code:** `src/lib/billing/v8-products.ts` (`V8_TRACK2_PRODUCTS` + `V8_TRACK2_QUOTA`). Tier → quota / rate / scope mapping mirrors the Phase 0 task pack Appendix B.

## Env vars (placeholders until Phase 8)

Add to `.env.local` and to the production env. Until Phase 8, use the literal `price_TODO` sentinel — `getV8Track2StripePriceId` treats it as missing.

```bash
STRIPE_PRICE_LOCK_VERSION=v8
STRIPE_PRICE_ID_V8_INDIE_MONTHLY=price_TODO
STRIPE_PRICE_ID_V8_INDIE_YEARLY=price_TODO
STRIPE_PRICE_ID_V8_PRO_MONTHLY=price_TODO
STRIPE_PRICE_ID_V8_PRO_YEARLY=price_TODO
STRIPE_PRICE_ID_V8_STUDIO_MONTHLY=price_TODO
STRIPE_PRICE_ID_V8_STUDIO_YEARLY=price_TODO
STRIPE_PRICE_ID_V8_STUDIO_MANAGED_MONTHLY=price_TODO
STRIPE_PRICE_ID_V8_STUDIO_MANAGED_YEARLY=price_TODO
STRIPE_PRICE_ID_V8_ENTERPRISE_MONTHLY=price_TODO
STRIPE_PRICE_ID_V8_ENTERPRISE_YEARLY=price_TODO
```

## Webhook integration

`src/app/api/webhooks/stripe/route.ts` resolves an inbound price ID against v8 first (`getV8Track2TierFromStripePriceId`), then falls back to v7 (`getPlanFromStripePriceId`). If the v8 lookup matches, only `api_keys` is updated — `profiles.plan` is reserved for Track 1.

| Event | v8 behaviour |
|---|---|
| `customer.subscription.created` | Apply `applyV8Track2TierToApiKeys(userId, tier)` |
| `customer.subscription.updated` | Same — re-apply quota / rate / scopes for the new tier |
| `customer.subscription.deleted` | Down-shift to `free` tier on `api_keys` |

`profiles.subscription_*` columns stay v7-only. v8 subscription state is reflected via the `api_keys` row state for that user.

## v7 deprecation (90-day grandfather)

1. **Day 0:** Pricing page swaps Track 2 SKUs from v7 → v8. New Track 2 signups go through v8 only.
2. **Days 0–90:** Existing v7 Track 2 subscribers keep paying their v7 price. They receive the deprecation notice (`docs/billing/v7-deprecation-notice.md`) — KR + EN — at Day 0.
3. **Day 60:** Reminder email; pricing page links the `/account/billing` self-migrate path.
4. **Day 90:** v7 Track 2 prices are archived in Stripe (`active=false`). Subscribers who did not migrate are moved to v8 Free tier on the next renewal cycle and are notified of the change.

Track 1 v7 subscribers are **not** in scope — that cycle is owned by the Track 1 owner.

## Phase 8 — Activation steps (human, not automated)

Phase 8 is intentionally manual. Use this checklist when activating v8 in live Stripe:

1. Stripe Dashboard → **Products → New product** for each non-free v8 tier above.
   - Set product metadata: `track=2`, `version=v8`.
   - Add monthly + yearly recurring prices. Tax-inclusive: no.
2. (Studio Managed only) Add a **metered** price at `$0.15 USD per Opus call`, billing scheme `per_unit`, aggregation `sum`.
3. Copy each `price_…` ID into the prod env (replacing `price_TODO`).
4. Stripe Dashboard → **Webhooks**: confirm the existing `/api/webhooks/stripe` endpoint is subscribed to `customer.subscription.{created,updated,deleted}` and `invoice.{paid,payment_failed}`.
5. v7 archive: for each v7 Track 2 product (currently 0 — Track 2 was launched on v8 directly), set `active=false`. Skip if there are no v7 Track 2 subscriptions.
6. Send the v7 deprecation notice (`docs/billing/v7-deprecation-notice.md`) to all current Track 2 subscribers (this only applies once Track 2 has ever shipped on v7 — initial v8 launch will skip this).
7. Verify: a test subscription on each tier writes the expected `api_keys` row (quota / rate / scopes match `V8_TRACK2_QUOTA`). Run the `applyV8Track2TierToApiKeys` round-trip test in `pnpm test src/lib/billing` before announcing.

## Related files

- `src/lib/billing/v8-products.ts` — typed catalog + helpers
- `src/lib/billing/__tests__/v8-products.test.ts` — unit tests for catalog + apply helper
- `src/app/api/webhooks/stripe/route.ts` — v8 dispatch in `customer.subscription.*` cases
- `src/lib/stripe-config.ts` — v7 catalog (Track 1 grandfather, untouched)
- `docs/billing/v7-deprecation-notice.md` — KR + EN customer announcement template
