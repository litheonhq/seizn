# Author Memory v3 LLM Phase C Signoff

Date: 2026-05-03
Branch: `feat/npc-memory-pivot`
Phase: C - public sample IP demo

## Summary

Phase C adds a localized, read-only `/[locale]/demo` surface for the synthetic Saebyeok sample IP set. The page renders all seven source artifacts from `docs/marketing/sample_ip/` into mini-screens that map to the real Author UI flow without exposing internal KNOT backlog material.

## Acceptance

- [x] `/[locale]/demo` route added and included in sitemap output.
- [x] Four launch language variants render: `en`, `ko`, `ja`, and `zh-hans`.
- [x] The demo labels the dataset as `Sample IP - Synthetic Demo Data` with localized equivalents.
- [x] All seven sample IP source files are loaded and represented:
  - `saebyeok-readme.md`
  - `saebyeok_canon_v1.json`
  - `saebyeok_world_rules_v1.json`
  - `saebyeok_timeline_v1.json`
  - `saebyeok_relationships_v1.json`
  - `saebyeok_review_cases_v1.json`
  - `saebyeok_simulation_cases_v1.json`
- [x] Seven read-only mini-screens render:
  - Intro
  - Inbox
  - Review
  - Characters
  - Graph
  - Timeline
  - Simulate
- [x] Read-only flow maps to the real Author UI concepts: import inbox, review queue, entity graph, timeline, and simulation cases.
- [x] KNOT separation guard is available as `npm run verify:knot-separation`.
- [x] Pre-deploy checks run the KNOT separation guard before the standard verification chain.
- [x] KNOT separation guard passes with 0 matches on the Phase C surfaces and expected public marketing paths.

## Verification

- `npx vitest run src/__tests__/demo/saebyeok-demo.test.ts` -> pass, 1 file, 6 tests.
- `npm run verify:knot-separation` -> pass, 0 matches.
- `npm run typecheck` -> pass.
- `npm run test -- --run` -> pass, 135 files, 1123 passed, 16 skipped.
- `npm run lint` -> pass.
- `npm run build` -> pass; route conflict check passed and the build route table includes `/[locale]/demo`.
- Local production route smoke:
  - `200 /en/demo`
  - `200 /ko/demo`
  - `200 /ja/demo`
  - `200 /zh-hans/demo`

## Screenshots

- `reports/phaseC-demo-en.png`
- `reports/phaseC-demo-ko-mobile.png`

## Tests Added

- `src/__tests__/demo/saebyeok-demo.test.ts`
  - verifies all seven source files load from `docs/marketing/sample_ip/`
  - verifies sample counts for characters, world rules, timeline events, relationships, review cases, and simulations
  - verifies arrays needed by the seven mini-screens are available
  - verifies four-language demo copy and the seven screen labels
  - verifies the localized demo page renders the server component with data
  - verifies the KNOT separation guard passes on the configured Phase C surfaces
  - verifies the KNOT separation guard fails on an injected forbidden standalone token

## Changed Files

- `docs/author-memory-v3-llm-phaseC-signoff.md`
- `package.json`
- `reports/phaseC-demo-en.png`
- `reports/phaseC-demo-ko-mobile.png`
- `scripts/pre-deploy.sh`
- `scripts/verify-knot-separation.ts`
- `src/__tests__/demo/saebyeok-demo.test.ts`
- `src/app/[locale]/demo/page.tsx`
- `src/app/sitemap.ts`
- `src/components/demo/saebyeok-demo.tsx`
- `src/lib/sample-ip-demo.ts`

## Notes

- The guard intentionally excludes public positioning docs and the sample IP readme because those files document the separation policy itself. The executable guard still scans the demo route, public assets, sample data, and built demo output.
- No preview deployment was run.
