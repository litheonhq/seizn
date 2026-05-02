# Author Memory v3 LLM Phase B Signoff

Generated: 2026-05-02
Branch: feat/npc-memory-pivot

## Scope Completed

- Wired Author launch Stripe v7 tiers in `/pricing`: Indie $39, Pro $149, Studio $499, Enterprise $2,500 with monthly/yearly cadence and v7 lock copy.
- Added server-side Stripe Checkout selection by tier/cadence, 30-day subscription trial metadata, customer creation, and BYOK discount application during checkout.
- Added `/api/account/subscription` for current subscription state, portal redirect, cancel, and resume actions.
- Extended Stripe webhook sync for checkout, subscription create/update/delete, invoice paid, and invoice payment failed state.
- Added `/dashboard/billing` with plan status, cancel/resume/manage actions, D-3 trial banner, BYOK discount state, and token usage progress.
- Added BYOK coupon sync for `SEIZN_BYOK_50`, plus BYOK disable handling that removes subscription discounts.
- Added token-budget enforcement for Indie 1M, Pro 5M, Studio 20M, Enterprise unlimited; managed overage emits Stripe meter events when configured, while BYOK remains unlimited.
- Updated Author UI query bindings and data contracts for subscription, usage, BYOK apply, and BYOK disable.
- Added Supabase migration `20260502006_author_stripe_billing.sql` for v7 plan values and Stripe/BYOK subscription state columns.

## Verification

- `npm run typecheck`: pass
- `npm run test:run`: pass, 126 files, 1068 passed, 16 skipped
- `npm run lint`: pass
- `npm run build`: pass
- `node` JSON parse check for `docs/author-ui/author_ui_query_bindings.json` and `docs/author-ui/author_ui_data_contracts.json`: pass
- v7 env-name presence check in `C:\Users\admin\.codex\private\consolidated\litheon.env`: all 8 Stripe price IDs, webhook secret, Stripe secret, and both meter IDs present. Raw values were not printed.
- Legacy pricing grep in touched pricing surfaces: no old v5/v6 price strings, `PaddleInit`, `NEXT_PUBLIC_PADDLE`, or `LemonSqueezy` matches.

## Notes

- Live Stripe checkout, customer portal, invoice, and webhook delivery were not executed from this local session because no authenticated browser/customer flow was available. The implementation is covered by focused Stripe config, BYOK discount, token-budget, artifact-contract, typecheck, lint, full test, and production build gates.
- The migration was added but not applied to a live Supabase database in this session.
