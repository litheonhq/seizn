# Author Memory v3 LLM Integration - Phase 3 Sign-off

Date: 2026-05-02
Owner: Codex
Scope: Structured extraction prompts, schemas, canon validation, and import-to-candidate wiring for Author Memory v3.

## Implemented

- Added `src/lib/author/extraction/` with:
  - prompt catalog.
  - five extraction prompt files.
  - five JSON schemas.
  - heuristic and LLM extraction orchestrator.
  - canon authority validator.
  - eval seed v3 scoring helper.
- Added `docs/knot-input/canon_authority_rules_machine.json` for machine-enforced KNOT short1 rules.
- Refactored `AuthorUiService.uploadImport()` so parsed import text now runs extraction and creates review candidates.
- Added deterministic non-production heuristic extraction for tests and local development.
- Kept production default on the Phase 2 Anthropic BYOK runtime.
- Replaced one secret-shaped Author UI BYOK test fixture with a non-secret-shaped dummy key.

## KNOT Extraction Evidence

| Check | Result |
|---|---|
| Eval seed v3 category coverage | Pass; 100/100 cases covered, unsupported categories 0 |
| Main short1 registry match | Pass; 7/7 character IDs matched in automated test |
| Supporting heading extraction | Pass; 8 supporting character candidates in automated test |
| Local KNOT `short1-characters.md` smoke | Pass; 7 character candidates |
| Local KNOT `short1-characters-supporting.md` smoke | Pass; 9 character candidates |
| Forbidden short1 leak regression | Pass; validator rejects forbidden-in-scope candidates |
| Tier 2 auto-canon regression | Pass; validator rejects tier:2 auto-canon |
| Duplicate regression | Pass; validator rejects duplicate batch/existing candidates |

## Validation

| Command | Result |
|---|---|
| `npm run test:run -- src/__tests__/author/extraction/eval-seed-v3.test.ts src/__tests__/author-ui/author-ui-service.test.ts src/__tests__/author-ui/author-ui-route.test.ts` | Pass, 19 tests |
| `npm run test:run -- src/__tests__/author src/__tests__/author-ui src/__tests__/author-memory-v3` | Pass, 87 tests |
| `npx ts-node -r tsconfig-paths/register --project tsconfig.node.json -e "...local KNOT extraction smoke..."` | Pass, main 7 and supporting 9 character candidates |
| `node -e "JSON.parse(...)"` for Author UI and KNOT JSON artifacts | Pass |
| `npm run test:run` | Pass, 121 files, 1026 passed, 16 skipped |
| `npm ci --dry-run` | Pass |
| `npm audit --omit=dev --audit-level=moderate` | Pass, 0 vulnerabilities |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run build` | Pass |
| `git diff --check` | Pass |

## Known Limits

- Live paid Anthropic extraction was not executed in this phase. The LLM branch is covered by mocked structured-output tests, JSON-schema validation, and Phase 2 BYOK runtime tests.
- Non-production defaults to heuristic extraction for repeatable tests. Production defaults to the BYOK-backed LLM path unless `AUTHOR_EXTRACTION_MODE` is explicitly overridden.
- Phase 4 backlog generation, Phase 5 audit/replay hardening, and Phase 6 Litheon migration remain next-phase work.
