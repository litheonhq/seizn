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

## Files Changed

- `src/app/api/v1/memories/route.ts`
- `src/lib/memory/v1-spring-bridge.ts`

## Follow-up Notes

1. Authenticated dashboard and API-key smoke are now verified via local auto-provision (`PLAYWRIGHT_DISABLE_TURNSTILE=1`, `E2E_ALLOW_AUTO_PROVISION=1`).
2. Playwright local server reuse is now opt-in via `PLAYWRIGHT_REUSE_SERVER=1`; default behavior is isolated startup on `127.0.0.1:3100`.
