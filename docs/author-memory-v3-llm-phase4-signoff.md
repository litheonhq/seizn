# Author Memory v3 LLM Integration - Phase 4 Sign-off

Date: 2026-05-02
Owner: Codex
Scope: Character backlog generation for Author Memory v3.

## Implemented

- Added `src/lib/author/extraction/prompts/generate-backlog.md`.
- Added `generateBacklogForCharacter()` to `src/lib/author/extraction/extractor.ts`.
- Added `POST /api/projects/{projectId}/characters/{characterId}/backlog`.
- Added `useGenerateAuthorBacklog()` to `src/hooks/useAuthorMemoryV3.ts`.
- Added Author dashboard Character screen controls:
  - character selector.
  - Generate backlog button.
  - inline generated-candidate preview.
- Inserted generated backlog items into the Review Queue as `fact` candidates tagged with `backlog`, category, and character ID.
- Added `export_markdown` to the API response for detail-guide section X.6 manual sync/export.

## KNOT Dogfood Evidence

| Check | Result |
|---|---|
| Sori generation | Pass; 20 candidates, four categories, 5 each |
| Reika generation | Pass; 20 candidates, four categories, 5 each |
| Nana generation | Pass; 20 candidates, four categories, 5 each |
| Lulu generation | Pass; 20 candidates, four categories, 5 each |
| Yui generation | Pass; 20 candidates, four categories, 5 each |
| Cross-character duplicate content | Pass; 0 duplicates in automated test |
| Forbidden backlog term regression | Pass; validator rejects forbidden visual/Tier 2 terms |
| Detail-guide export | Pass; API/service returns markdown headed for section X.6 |

## Validation

| Command | Result |
|---|---|
| `npm run test:run -- src/__tests__/author/extraction/generate-backlog.test.ts src/__tests__/author/extraction/eval-seed-v3.test.ts src/__tests__/author-ui/author-ui-service.test.ts src/__tests__/author-ui/author-ui-route.test.ts` | Pass, 24 tests |
| `npm run test:run -- src/__tests__/author src/__tests__/author-ui src/__tests__/author-memory-v3` | Pass, 92 tests |
| `npm run test:run` | Pass, 1031 passed and 16 skipped |
| `npm ci --dry-run` | Pass |
| `npm audit --omit=dev --audit-level=moderate` | Pass, 0 vulnerabilities |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run build` | Pass |
| `git diff --check` | Pass |
| Author UI/KNOT JSON parse via Node `JSON.parse` | Pass |
| Added-line and Author Memory v3 secret scans | Pass, no matches |

## Known Limits

- Live paid Anthropic backlog generation was not executed. The LLM path is covered with mocked structured-output tests.
- Automatic write-back to KNOT source files is not enabled. The API returns `export_markdown` for manual detail-guide sync/export.
- Persistent audit and deterministic replay of backlog generation remain Phase 5 work.
