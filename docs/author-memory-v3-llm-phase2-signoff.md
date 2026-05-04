# Author Memory v3 LLM Integration - Phase 2 Sign-off

Date: 2026-05-02
Owner: Codex
Scope: Anthropic SDK runtime, BYOK integration, and token usage persistence for Author Memory v3.

## Implemented

- Added `src/lib/author/llm/` with:
  - Anthropic client wrapper.
  - BYOK-first Anthropic key resolver.
  - production `BYOK_REQUIRED` fail-closed behavior.
  - non-production managed-key fallback.
  - 429 retry backoff.
  - JSON response parsing and schema validation.
  - model usage persistence.
- Exported the Author BYOK resolver from `src/lib/byok/index.ts`.
- Integrated `/api/account/byok` with encrypted provider-key storage and masked status reads.
- Integrated `/api/account/usage` with monthly `model_usage` aggregation.
- Added `model_usage` table for Author LLM usage ledger rows.
- Aligned `provider_keys.user_id` and `provider_keys_audit.user_id` with `profiles.id TEXT` for NextAuth-compatible Author BYOK storage.
- Documented Author-specific dev fallback and model override env vars in `.env.example`.

## Database Evidence

| Check | Result |
|---|---|
| `node scripts/run-migration-file.mjs supabase/migrations/20260502004_model_usage.sql` | Pass; migration applied |
| Post-migration `npm run verify:e2e-encryption-db` after `model_usage` | Pass |
| Post-migration `npm run verify:runtime-primitives` after `model_usage` | Pass |
| `node scripts/run-migration-file.mjs supabase/migrations/20260502005_provider_keys_profile_user_id.sql` | Pass; migration applied |
| Post-migration `npm run verify:e2e-encryption-db` after provider-key alignment | Pass |
| Post-migration `npm run verify:runtime-primitives` after provider-key alignment | Pass |
| `model_usage` + `provider_keys` smoke | Pass; profile-ID insert/select verified in a transaction and rolled back |

## Validation

| Command | Result |
|---|---|
| `node -e "JSON.parse(...author_ui_data_contracts.json); JSON.parse(...author_ui_query_bindings.json)"` | Pass |
| `npm run test:run -- src/__tests__/author/llm/byok-resolver.test.ts src/__tests__/author/llm/anthropic-client.test.ts` | Pass, 9 tests |
| `npm run test:run -- src/__tests__/author/llm/byok-resolver.test.ts src/__tests__/author/llm/anthropic-client.test.ts src/__tests__/author-ui/author-ui-service.test.ts src/__tests__/author-ui/author-ui-route.test.ts src/__tests__/author-memory-v3/author-artifacts.test.ts` | Pass, 26 tests |
| `npm run test:run` | Pass, 120 files, 1020 passed, 16 skipped |
| `npm ci --dry-run` | Pass |
| `npm audit --omit=dev --audit-level=moderate` | Pass, 0 vulnerabilities |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run build` | Pass |
| `git diff --check` | Pass |
| Secret scan over git diff | Pass, no non-empty key material matched |

## Known Limits

- Phase 3 extraction prompts, canon authority validator, candidate persistence, and eval-seed scoring are not included in this Phase 2 commit.
- The live paid Anthropic call path was not executed in this phase. The wrapper is covered with mocked Anthropic responses, retry behavior, BYOK branching, JSON validation, and live DB persistence smoke.
- `claude-opus-4-7` is the default Author model per the integration spec; production can override it with `AUTHOR_LLM_DEFAULT_MODEL` if Anthropic model naming changes.
