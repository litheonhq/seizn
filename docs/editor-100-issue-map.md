# Editor 100 Issue Map

Date: 2026-03-05
Owner: Codex session
Scope: v1 memory API internal engine replacement (legacy contract preserved)

## Issue List

| ID | User-visible Gap | Root Cause | Resolution | Status |
|---|---|---|---|---|
| M-100-01 | v1 search quality lagged behind Spring v4 retrieval stack | `/api/v1/memories` used legacy RPC-only search path | Added Spring v4-first bridge search with automatic legacy fallback | Closed |
| M-100-02 | v1 writes were not reflected in Spring v4 notes | v1 POST inserted only into `memories` table | Added dual-write mirror from v1 POST to `spring_memory_notes` (best effort, configurable strict mode) | Closed |
| M-100-03 | Deleting v1 memories could leave mirrored Spring notes stale | No reverse sync on v1 delete | Added mirrored soft-delete sync by `payload_json.legacy_memory_id` | Closed |
| M-100-04 | Rollback safety unclear if Spring mirror write fails | No failure policy for mirror path | Added env-controlled strict mode (`MEMORY_V1_SPRING_BRIDGE_MIRROR_REQUIRED=true`) with rollback and hard error | Closed |
| M-100-06 | Bridge behavior was always-on for mirror writes (operational rollback friction) | No dedicated kill-switch for mirror path | Added `MEMORY_V1_SPRING_BRIDGE_MIRROR=false` kill-switch | Closed |
| M-100-05 | E2E parity execution could not validate live API path in this session | `SEIZN_E2E_API_KEY` not set locally; Playwright suite skipped | Provisioned local E2E key and reran live CRUD suite successfully (9/9) | Closed |
| M-100-07 | Combined E2E runs could attach to the wrong local project and produce false failures | Playwright reused an existing `localhost:3000` server from another repo | Defaulted Playwright to isolated `127.0.0.1:3100`, made server reuse opt-in, and aligned client E2E env injection | Closed |
| M-100-08 | Docs/pricing smoke checks were brittle and quickstart deep links 404ed | Missing `main` landmarks on localized pages and no `/docs/quickstart` route target | Added `main` landmarks in docs/pricing and created localized quickstart redirect page | Closed |
| M-100-09 | Homepage quality audits showed unnecessary first-load work around hero/LCP | Decorative motion mounted immediately and GA loaded in non-production validation runs | Deferred hero motion until idle, removed hero text entry animation, and disabled GA outside production/E2E | Closed |
| AMV3-P1-01 | Author imports did not persist uploaded source files | Existing fixture-backed upload path only created in-memory import records | Added Cloudflare R2 object persistence for Author imports | Closed |
| AMV3-P1-02 | Author imports did not extract real md/docx/pdf/txt content | `uploadImport` did not receive file bytes or call document parsers | Added parser router and format-specific parsers with heading/page span metadata | Closed |
| AMV3-P1-03 | Parsed Author import text had no durable table | No `author_imports_text` persistence layer existed | Added Supabase migration and store for parsed text plus source object metadata | Closed |
| AMV3-P1-04 | Author Inbox could not initiate real uploads from the dashboard surface | Dashboard Author page rendered import rows but no upload control | Wired existing upload mutation into the Inbox panel | Closed |
| AMV3-P2-01 | Author Memory v3 had no reusable Anthropic runtime for real extraction calls | LLM calls were still fixture-oriented and not routed through BYOK | Added `src/lib/author/llm/` with Anthropic client, BYOK resolver, JSON schema validation, 429 backoff, and usage recording | Closed |
| AMV3-P2-02 | Production Author LLM calls could accidentally depend on managed keys | Existing generic provider fallback allowed managed keys broadly | Author resolver now requires Anthropic BYOK in production and allows managed fallback only outside production | Closed |
| AMV3-P2-03 | Author LLM token usage was not persisted for account usage or audit | No `model_usage` ledger existed | Added `model_usage` migration, usage store, and account usage merge path | Closed |
| AMV3-P2-04 | BYOK provider keys could fail for NextAuth profile IDs | `provider_keys.user_id` still followed the older `auth.users` UUID model | Added profile-ID alignment migration for `provider_keys` and `provider_keys_audit` | Closed |

## Files Changed

- `src/app/api/v1/memories/route.ts`
- `src/lib/memory/v1-spring-bridge.ts`
- `src/lib/author/storage/r2-store.ts`
- `src/lib/author/storage/import-text-store.ts`
- `src/lib/author/parser/`
- `src/app/api/projects/[projectId]/imports/route.ts`
- `src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx`
- `supabase/migrations/20260502003_author_imports_text.sql`
- `src/lib/author/llm/`
- `src/app/api/account/byok/route.ts`
- `src/app/api/account/usage/route.ts`
- `src/lib/byok/index.ts`
- `supabase/migrations/20260502004_model_usage.sql`
- `supabase/migrations/20260502005_provider_keys_profile_user_id.sql`

## Follow-up Notes

1. Authenticated dashboard and API-key smoke are now verified via local auto-provision (`PLAYWRIGHT_DISABLE_TURNSTILE=1`, `E2E_ALLOW_AUTO_PROVISION=1`).
2. Playwright local server reuse is now opt-in via `PLAYWRIGHT_REUSE_SERVER=1`; default behavior is isolated startup on `127.0.0.1:3100`.
3. Author Memory v3 Phase 3 can now call the Phase 2 Anthropic runtime; extraction prompts, validators, and candidate persistence remain next-phase work.
