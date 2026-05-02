# Author Memory v3 LLM Phase A Signoff

Date: 2026-05-03
Branch: `feat/npc-memory-pivot`
Phase: A — legal route, i18n templating, footer/checkout legal links

## Summary

Phase A publishes the 4-language legal source set from `legal/{en,ko,ja,zh}/` through localized legal pages, exposes Privacy/Terms/Beta Disclosure links from launch footers, adds ToS/Privacy acceptance before Stripe checkout creation, and shows a one-time beta disclosure banner on dashboard entry.

## Acceptance

- [x] 4 launch languages x 3 pages verified as 12 HTTP 200 routes on local production server:
  - `en`, `ko`, `ja`, `zh-hans` x `privacy`, `terms`, `beta-disclosure`
- [x] Legal markdown loaded as UTF-8 from `legal/{en,ko,ja,zh}/`.
- [x] Stripe checkout UI displays Terms and Privacy links with `target="_blank"` and blocks checkout until the checkbox is accepted.
- [x] Footer/legal-entry links now point at `/[locale]/legal/privacy`, `/[locale]/legal/terms`, and `/[locale]/legal/beta-disclosure`.
- [x] Dashboard beta disclosure banner appears once and stores `seizn_beta_disclosure_dismissed=1` after dismissal.
- [x] `docs/architecture/decisions.md` includes the beta disclaimer lock decision.
- [x] WCAG/keyboard pass by construction: native checkbox, native links/buttons, visible text labels, semantic nav/main/article regions, and no pointer-only flow.

## Verification

- `npx vitest run src/__tests__/legal/legal-docs.test.ts src/__tests__/billing/checkout-button-legal.test.tsx src/__tests__/legal/beta-disclosure-banner.test.tsx` — pass, 3 files, 11 tests.
- `npm run typecheck` — pass.
- `npm run test -- --run` — pass, 134 files, 1117 passed, 16 skipped.
- `npm run lint` — pass.
- `npm run build` — pass; route conflict check passed and build route table includes:
  - `/[locale]/legal/privacy`
  - `/[locale]/legal/terms`
  - `/[locale]/legal/beta-disclosure`
- Local production route smoke:
  - `200 /en/legal/privacy`
  - `200 /en/legal/terms`
  - `200 /en/legal/beta-disclosure`
  - `200 /ko/legal/privacy`
  - `200 /ko/legal/terms`
  - `200 /ko/legal/beta-disclosure`
  - `200 /ja/legal/privacy`
  - `200 /ja/legal/terms`
  - `200 /ja/legal/beta-disclosure`
  - `200 /zh-hans/legal/privacy`
  - `200 /zh-hans/legal/terms`
  - `200 /zh-hans/legal/beta-disclosure`

## Screenshots

- `reports/phaseA-legal-en-privacy.png`
- `reports/phaseA-pricing-checkout-legal.png`

## Tests Added

- `src/__tests__/legal/legal-docs.test.ts`
  - all 12 launch legal documents load
  - Chinese route variants map to the shared `legal/zh` source
  - legal copy keys are complete
  - legal paths are localized
  - markdown relative links rewrite to legal routes
- `src/__tests__/billing/checkout-button-legal.test.tsx`
  - checkout disabled until agreement
  - Terms/Privacy links open in a new tab
  - checkout POST occurs only after agreement
  - opt-out path stays available for non-checkout reuse
- `src/__tests__/legal/beta-disclosure-banner.test.tsx`
  - first dashboard entry shows beta disclosure link
  - dismissal stores the cookie and hides the banner

## Changed Files

- `docs/architecture/decisions.md`
- `docs/author-memory-v3-llm-phaseA-signoff.md`
- `reports/phaseA-legal-en-privacy.png`
- `reports/phaseA-pricing-checkout-legal.png`
- `src/__tests__/billing/checkout-button-legal.test.tsx`
- `src/__tests__/legal/beta-disclosure-banner.test.tsx`
- `src/__tests__/legal/legal-docs.test.ts`
- `src/app/(auth)/signup/signup-form.tsx`
- `src/app/(dashboard)/layout.tsx`
- `src/app/[locale]/enterprise/enterprise-client.tsx`
- `src/app/[locale]/home-client.tsx`
- `src/app/[locale]/legal/beta-disclosure/page.tsx`
- `src/app/[locale]/legal/privacy/page.tsx`
- `src/app/[locale]/legal/terms/page.tsx`
- `src/app/[locale]/pricing/pricing-client.tsx`
- `src/app/[locale]/service-selector-client.tsx`
- `src/app/[locale]/summer/summer-client.tsx`
- `src/app/[locale]/trust/trust-client.tsx`
- `src/app/sitemap.ts`
- `src/components/checkout-button.tsx`
- `src/components/legal/beta-disclosure-banner.tsx`
- `src/components/legal/legal-document-page.tsx`
- `src/lib/legal-docs.ts`
- `src/lib/legal-routes.ts`

## Notes

- Live Stripe checkout was not executed; the local UI flow and POST contract were validated with unit tests.
- Lawyer review remains explicitly out of scope for this phase.
