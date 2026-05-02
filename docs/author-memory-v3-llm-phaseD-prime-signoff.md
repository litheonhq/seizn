# Phase D Prime Signoff - Author Landing Audit Fixes

Date: 2026-05-03
Branch: `feat/npc-memory-pivot`
Scope: Phase D prime landing fixes from `docs/architecture/seizn-author-audit-fix-handoff.md`.

## Summary

- Replaced the misplaced Inputs section yearly billing note with localized input-mode subtitles for en, ko, ja, and zh-hans.
- Hid `engine.seizn.com` landing links behind `NEXT_PUBLIC_ENGINE_SURFACE_LIVE=1`; default is off until DNS and runtime are live.
- Added explicit external-link attributes for the gated engine nav/footer link path.
- Updated footer ownership copy to `© 2026 Seizn by Litheon LLC`.
- Made the Korean hero title use an intentional two-line break and verified no horizontal overflow across launch locales and desktop/tablet/mobile widths.
- Hardened the Saebyeok sample data loader so missing or invalid source files return partial data plus source-status metadata instead of failing the landing or demo route.
- Added localized fallback placeholder cards for partial sample data on the landing preview and full demo page.

## Acceptance

- [x] Inputs section renders `copy.inputs.subtitle` in all four launch languages.
- [x] Engine cross-links are hidden by default and gated by `NEXT_PUBLIC_ENGINE_SURFACE_LIVE=1`.
- [x] Engine nav link path uses `target="_blank"` and `rel="noopener noreferrer"` when enabled.
- [x] Footer copyright renders only `© 2026 Seizn by Litheon LLC`.
- [x] Korean hero title uses an intentional two-line break; launch locales were checked at 1440, 768, and 360 px with no h1 overflow.
- [x] Saebyeok loader handles normal load, one missing file, JSON parse failure, and all files missing.
- [x] Landing and demo surfaces render localized sample-data-unavailable placeholders when source data is partial.
- [x] `npm run verify:knot-separation` passed after build with 0 matches.
- [x] Preview deployment not run. Preview deployments are prohibited.

## Env Note

- Runtime flag: `NEXT_PUBLIC_ENGINE_SURFACE_LIVE=1`.
- Default remains `0` in `.env.example`.
- Operator registration target after DNS/runtime readiness: `C:\Users\admin\.codex\private\consolidated\litheon.env`, then Vercel Preview and Production scopes as appropriate.

## Verification

- `npm run verify:knot-separation` - passed before and after build, 0 matches.
- Targeted tests: `npm run test:run -- src/__tests__/landing/author-landing.test.ts src/__tests__/demo/saebyeok-demo.test.ts` - 2 files, 30 passed.
- `npm run typecheck` - passed.
- `npm run test:run` - 137 files, 1153 passed, 16 skipped.
- `npm run lint` - passed.
- `npm run build` - passed.
- Playwright CLI local production viewport check on `http://127.0.0.1:3010`:
  - en, ko, ja, zh-hans at 1440, 768, and 360 px.
  - all h1 overflow checks false.
  - default engine link count 0.
  - Korean h1 line count 2 at all checked widths.

## Tests Added

- `src/__tests__/landing/author-landing.test.ts`
  - input subtitle copy coverage and render check.
  - engine surface env gate default/off and enabled external-link attributes.
  - legal entity copyright.
  - Korean hero intentional line break.
- `src/__tests__/demo/saebyeok-demo.test.ts`
  - sample source status metadata.
  - one missing source file fallback.
  - JSON parse fallback.
  - all-source-missing safe snapshot.
  - localized unavailable placeholder render.

## Files Changed

- `.env.example`
- `docs/author-memory-v3-llm-phaseD-prime-signoff.md`
- `src/__tests__/demo/saebyeok-demo.test.ts`
- `src/__tests__/landing/author-landing.test.ts`
- `src/components/demo/saebyeok-demo.tsx`
- `src/components/landing/author-flagship-landing.tsx`
- `src/lib/sample-ip-demo.ts`
