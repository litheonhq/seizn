# Phase D Signoff - Author Flagship Landing

Date: 2026-05-03
Branch: `feat/npc-memory-pivot`
Scope: `seizn.com` Author landing minimum viable build after Phase H, A, B, C.

## Summary

- Replaced the locale home route with an Author flagship landing that uses Phase C Saebyeok sample IP data.
- Rebuilt localized pricing for the v7 billing model with four active tiers and monthly/yearly checkout cadence.
- Added non-localized redirect aliases for `/pricing`, `/demo`, and legal routes so external launch links resolve to `/en/...`.
- Added footer legal links and `https://engine.seizn.com` cross-link.
- Added Phase D route, pricing, i18n, checkout matrix, and KNOT separation coverage.
- Fixed the final Lighthouse findings found during dogfood: low-contrast legal/sample/footer text and logo link accessible-name mismatch.

## Acceptance

- [x] Hero and sample IP demo widget render on the landing page.
- [x] Pricing page exposes four active Author tiers and both monthly/yearly checkout cadence selections.
- [x] Footer links include privacy, terms, beta disclosure, and `engine.seizn.com`.
- [x] Four launch locales return 200 OK for landing, pricing, demo, and legal routes.
- [x] Non-localized aliases redirect to the English launch routes.
- [x] WCAG AA target met: Lighthouse accessibility score 100.
- [x] Phase D screenshots captured for 4 languages.
- [x] `npm run build` passed.
- [x] Preview deployment not run. Preview deployments are prohibited in this environment.

## Checkout Model Note

The task pack acceptance text says "5 tier x 2 cadence = 10 flows", but the v7 billing lock and Phase B implementation define four checkout tiers: `indie`, `pro`, `studio`, `enterprise`. Metered overage is a Stripe billing meter, not a fifth checkout card. Phase D therefore validates four tiers x two cadence values = eight checkout selections, plus the separate metered-overage copy.

## Verification

- `npm run typecheck` - passed after final accessibility patch.
- `npm run test -- --run` - passed after final accessibility patch: 136 files, 1138 passed, 16 skipped.
- `npm run lint` - passed after final accessibility patch.
- `npm run build` - passed after final accessibility patch.
- `npm run verify:knot-separation` - passed after final build, 0 matches.
- Route smoke on local production `http://localhost:3128` - 24/24 routes returned 200.
- Alias redirect smoke on local production `http://localhost:3128` - 6/6 redirects returned expected 307 locations.
- Playwright overflow check - 4/4 landing locales had no horizontal overflow at 1440px.
- Lighthouse accessibility JSON - `reports/phaseD-lighthouse-en-accessibility.json`, score 100, 0 failing audits.

Lighthouse CLI returned a Windows temp-directory cleanup `EPERM` after writing the JSON report. The generated JSON was parsed and passed the score/failing-audit gate.

## Screenshots

- `reports/phaseD-landing-en.png`
- `reports/phaseD-landing-ko.png`
- `reports/phaseD-landing-ja.png`
- `reports/phaseD-landing-zh-hans.png`

## Tests Added

- `src/__tests__/landing/author-landing.test.ts`
  - complete landing copy exists for en, ko, ja, zh-hans
  - English launch copy has no CJK/Hangul/Hiragana/Katakana leakage
  - non-English launch copy contains local script coverage
  - localized landing page loads Phase C sample IP data
  - complete pricing copy exists for en, ko, ja, zh-hans
  - active Author tier x cadence checkout matrix covers 8 selections
  - metered overage remains a billing meter note, not a fifth checkout tier

## Files Changed

- `docs/author-memory-v3-llm-phaseD-signoff.md`
- `reports/phaseD-landing-en.png`
- `reports/phaseD-landing-ko.png`
- `reports/phaseD-landing-ja.png`
- `reports/phaseD-landing-zh-hans.png`
- `reports/phaseD-lighthouse-en-accessibility.json`
- `scripts/verify-knot-separation.ts`
- `src/__tests__/landing/author-landing.test.ts`
- `src/app/[locale]/page.tsx`
- `src/app/[locale]/pricing/page.tsx`
- `src/app/[locale]/pricing/pricing-client.tsx`
- `src/app/demo/page.tsx`
- `src/app/legal/beta-disclosure/page.tsx`
- `src/app/legal/privacy/page.tsx`
- `src/app/legal/terms/page.tsx`
- `src/app/pricing/page.tsx`
- `src/app/sitemap.ts`
- `src/components/checkout-button.tsx`
- `src/components/landing/author-flagship-landing.tsx`
- `src/lib/checkout-copy.ts`
