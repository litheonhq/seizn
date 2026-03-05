# Editor P1 Sign-off: v1 Memory -> Spring v4 Bridge

Date: 2026-03-05
Updated: 2026-03-06
Status: Verified with live E2E and follow-up hardening

## User-visible Outcome

- `/api/v1/memories` keeps the same API contract.
- Search now prefers Spring v4 retrieval internally and falls back to legacy search automatically.
- New/updated v1 memories are mirrored into Spring v4 so retrieval quality can improve without client changes.
- v1 delete now also soft-deletes mirrored Spring notes.

## Scope Delivered

1. Spring v4-first search bridge for v1 query path.
2. Dual-write mirror on v1 POST.
3. Mirror soft-delete sync on v1 DELETE.
4. Telemetry fields added in search response:
   - `searchBackend`
   - `backendFallbackReason`

## Rollout Controls

- `MEMORY_V1_SPRING_BRIDGE_SEARCH=false`:
  - Disable Spring v4-first search bridge and use legacy-only search.
- `MEMORY_V1_SPRING_BRIDGE_MIRROR=false`:
  - Disable Spring mirror writes from v1 POST while keeping v1 legacy flow intact.
- `MEMORY_V1_SPRING_BRIDGE_MIRROR_REQUIRED=true`:
  - Enforce Spring mirror write success; otherwise rollback v1 memory insert and return error.

## Validation Evidence

- Typecheck: pass (`npm run -s typecheck`)
- Lint: pass (`npm run -s lint`)
- Targeted tests: pass
  - `npm run -s test:run -- src/__tests__/memory/v1-spring-bridge.test.ts`
  - `npm run -s test:run -- src/__tests__/memory/memory-v1-spring-bridge-route.test.ts`
  - `npm run -s test:run -- src/__tests__/memory/memory-post-image-rollback-routes.test.ts`
  - `npm run -s test:run -- src/__tests__/memory`
  - `npm run -s test:run -- src/__tests__/security/api-security.test.ts`
- E2E scenario executed:
  - `npx playwright test e2e/spring-memory-crud.spec.ts --project=chromium --workers=1`
  - Result: pass (9/9)
- Follow-up smoke validation:
  - `$env:PLAYWRIGHT_DISABLE_TURNSTILE='1'; $env:E2E_ALLOW_AUTO_PROVISION='1'; npx playwright test e2e/core-pages.spec.ts e2e/dashboard-smoke.spec.ts e2e/dashboard-auth-smoke.spec.ts e2e/spring-memory-crud.spec.ts e2e/api-key.spec.ts --project=chromium --workers=1`
  - Result: pass (30/30)
- Build + quality validation:
  - `npm run build`
  - `python C:\Users\admin\.codex\skills\web-quality-optimizer\scripts\run_web_quality_checks.py --project C:\Users\admin\Projects\seizn --mode quick --json-out C:\Users\admin\Projects\seizn\.codex-reports\quality-quick-after.json --markdown-out C:\Users\admin\Projects\seizn\.codex-reports\quality-quick-after.md`
  - Result: pass

## Known Limits

1. Existing historical memories are not backfilled by this change; only newly written v1 memories are guaranteed mirrored.

## Next Actions

1. Decide rollout policy:
   - Start with mirror best-effort mode (default), monitor logs.
   - Move to strict mirror mode after confidence window.
2. Optional: run one-time backfill job for legacy `memories -> spring_memory_notes`.
3. Keep local regression coverage on the isolated Playwright server path (`127.0.0.1:3100`) to avoid cross-project contamination during future E2E runs.
