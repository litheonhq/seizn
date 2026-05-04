# Author Memory v3 LLM Phase A Prime Signoff

Generated: 2026-05-03
Branch: `feat/npc-memory-pivot`
Scope: Phase A prime legal beta banner and localized legal navigation fixes from `docs/architecture/seizn-author-audit-fix-handoff.md`.

## Summary

- Moved the beta disclosure banner visibility source of truth to the legal frontmatter `beta_until` field.
- Added `getBetaDisclosureUntil()` so the dashboard layout reads the active beta window from the localized beta disclosure document.
- Added date-based beta banner hide/show behavior using an inclusive UTC end-of-day cutoff.
- Kept the existing dismiss cookie behavior and covered it alongside active and expired beta windows.
- Localized legal navigation labels for en, ko, ja, and zh-hans routes.
- Changed legal document title fallback to use localized labels instead of the previous English-only fallback.

## Acceptance

- [x] Beta disclosure frontmatter `beta_until` is the banner visibility source of truth.
- [x] Banner renders before `beta_until`.
- [x] Banner hides after `beta_until`.
- [x] Banner hides when the dismiss cookie is present.
- [x] Legal nav labels are localized for en, ko, ja, and zh-hans.
- [x] No preview deployment was run. Preview deployments are prohibited.

## Phase A Prime Test Coverage

- Beta banner coverage: active beta window, expired beta window, and dismiss cookie behavior.
- Legal document coverage: localized nav labels for all four launch languages and `beta_until` frontmatter loading.

## Verification

- Targeted Phase A prime tests: `npm run test:run -- src/__tests__/legal/beta-disclosure-banner.test.tsx src/__tests__/legal/legal-docs.test.ts` - passed, 2 files, 13 tests.
- `npm run typecheck` - passed.
- `npm run test:run` - passed, 138 files, 1171 passed, 16 skipped.
- `npm run lint` - passed.
- `npm run build` - passed; route conflict check passed and Next production build completed.
- `npm run verify:knot-separation` - passed, 0 matches.
- `git diff --check` - passed.

## Files Changed

- `docs/author-memory-v3-llm-phaseA-prime-signoff.md`
- `src/__tests__/legal/beta-disclosure-banner.test.tsx`
- `src/__tests__/legal/legal-docs.test.ts`
- `src/app/(dashboard)/layout.tsx`
- `src/components/legal/beta-disclosure-banner.tsx`
- `src/components/legal/legal-document-page.tsx`
- `src/lib/legal-docs.ts`
- `src/lib/legal-routes.ts`
