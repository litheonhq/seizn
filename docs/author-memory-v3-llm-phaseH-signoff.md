# Author Memory v3 LLM Phase H Signoff

Generated: 2026-05-03
Branch: feat/npc-memory-pivot

## Scope Completed

- Added Author Settings at `/dashboard/author/settings` and localized alias `/[locale]/dashboard/author/settings`.
- Built 4 Settings sections: API Keys (BYOK), Subscription & Billing, Usage, and Sync placeholder.
- Wired BYOK save/delete to `/api/account/byok` with Anthropic as the fixed provider and raw key display blocked.
- Added account-scoped billing portal route `/api/account/billing-portal` using `withAuthorUiService()` gate, CSRF, normalized user ID, and Stripe Customer Portal.
- Displayed BYOK discount states `Applied`, `Pending`, `Error`, and `Inactive` from the Phase B double-prime state contract.
- Displayed v7 plan, trial, renewal date, token usage, tier cap, overage, and `Unlimited (BYOK)`.
- Added 4-language Settings copy via component-local i18n equivalent: `en`, `ko`, `ja`, `zh-hans` plus `zh-hant` fallback coverage.
- Removed the Author dashboard yellow fallback banner text `Settings could not be loaded`.
- Added dashboard navigation entries for Author Memory and Author Settings.
- No preview deployment was run.

## Before / After Diff Summary

### Settings surface

Before: Author Memory v3 had no working settings surface and displayed a yellow fallback banner when project settings could not load.

After: `/dashboard/author/settings` renders the account-level Settings UI with BYOK, subscription, usage, and sync sections. The old yellow fallback banner was removed from the Author dashboard.

### BYOK settings

Before: BYOK key management existed as API routes but had no dedicated Author settings UI.

After: the Settings UI can save and remove the Anthropic BYOK key, shows only the final 4 characters, and renders the Phase B double-prime discount states.

### Billing portal

Before: the launch spec referenced `/api/account/billing-portal`, but the account-scoped Author UI route was absent.

After: `/api/account/billing-portal` creates Stripe Customer Portal sessions behind the same Author UI service gate used by adjacent account routes.

## Phase H Test Cases

- Settings UI renders API Keys, Subscription & Billing, Usage, and Sync sections.
- Active BYOK state shows final 4 characters only and does not expose raw API keys.
- BYOK discount states render for `applied`, `pending`, `error`, and `inactive`.
- BYOK save sends `provider=anthropic` and the API key to `/api/account/byok`.
- BYOK remove sends `DELETE /api/account/byok`.
- Manage Billing sends `POST /api/account/billing-portal` and navigates to the returned Stripe portal URL.
- Usage section shows `Unlimited (BYOK)` when no managed token cap applies.
- Settings copy exists for `en`, `ko`, `ja`, and `zh-hans`.
- Billing portal route creates a Stripe portal session for the normalized Author UI user.
- Billing portal route returns 404 when no Stripe customer exists.
- Billing portal route applies Author UI CSRF protection.

## Verification

- Targeted Phase H tests: `npm run test:run -- src/__tests__/author-ui/settings-ui.test.tsx src/__tests__/billing/billing-portal-route.test.ts` -> pass, 2 files, 14 tests.
- Yellow banner grep on new Settings surfaces -> pass, no `Settings could not be loaded` matches.
- KNOT separation grep on new Settings surfaces -> pass, no matches.
- `npm run typecheck` -> pass.
- `npm run test -- --run` -> pass, 131 files, 1106 passed, 16 skipped.
- `npm run lint` -> pass, no warnings.
- `npm run build` -> pass; route conflict check passed, `/dashboard/author/settings`, `/[locale]/dashboard/author/settings`, and `/api/account/billing-portal` were present in the build route table.

## Notes

- The localized Settings route is provided as an alias because the existing authenticated dashboard surface is rooted at `/dashboard`, while the launch task pack also asked for a `[locale]` route.
- Live Stripe portal navigation was not executed against a real customer in this local session; the route is covered by focused route tests and production build.
