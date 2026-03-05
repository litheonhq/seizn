# Security Audit Execution Log

Date: 2026-03-05
Project: C:\Users\admin\Projects\seizn
Scope: High-risk changed files from classification

## Findings and Fixes Applied

1) API-key admin bypass risk in enterprise SSO read path
- File: C:\Users\admin\Projects\seizn\src\app\api\enterprise\sso\route.ts
- Risk: API-key authenticated user could rely on profile orgId fallback path without explicit admin role resolution in GET.
- Fix: GET now always resolves org access through `resolveAdminOrgId(userId, requestedOrgId || apiKeyAuth?.orgId || null)`.
- Impact: Non-admin API-key caller can no longer read org SSO config.

2) SSRF redirect-chain bypass risk in remote ingestion
- File: C:\Users\admin\Projects\seizn\src\lib\knowledge-gap\filler.ts
- Risk: Initial URL validation existed, but `fetch(..., redirect:'follow')` could follow to unvalidated redirect targets.
- Fix: Added `fetchWithValidatedRedirects()` with `redirect:'manual'`, max redirect cap, and re-validation (`normalizeOutboundUrl`) on each hop.
- Impact: Private/reserved target bypass via open redirect chain is blocked.

3) Unauthorized organization binding during source connection
- File: C:\Users\admin\Projects\seizn\src\lib\knowledge-gap\filler.ts
- Risk: `organization_id` from connector config could be persisted without membership role verification.
- Fix: Added `resolvePermittedOrganizationId()` checking `organization_members` with owner/admin role.
- Impact: Cross-organization source binding via crafted config is denied.

4) Domain input validation hardening for SSO config
- File: C:\Users\admin\Projects\seizn\src\app\api\enterprise\sso\route.ts
- Risk: Domain list accepted arbitrary strings.
- Fix: Added `parseDomains()` with normalization, dedupe, cap, strict domain regex, and 400 response on invalid values.
- Impact: Invalid/unsafe domain entries are rejected early.

5) MIME hint trust reduction during remote file fetch
- File: C:\Users\admin\Projects\seizn\src\lib\knowledge-gap\filler.ts
- Risk: user-provided mimeType hint could force parser path.
- Fix: Prefer response `content-type`; use hint only when response type is missing.
- Impact: Parser path spoofing by client-controlled mime hint is reduced.

## Validation Commands

- `npm -C "C:\Users\admin\Projects\seizn" run lint` -> PASS
- `npm -C "C:\Users\admin\Projects\seizn" run typecheck` -> PASS
- `npm -C "C:\Users\admin\Projects\seizn" run test:run` -> PASS (72 files, 853 passed)
- `npm -C "C:\Users\admin\Projects\seizn" run test:security:strict` -> PASS (39 passed)

## Residual Risk (not patched in this step)

1) `src/lib/knowledge-gap/filler.ts` still performs external fetch + parsing in request path.
- Risk: Potential latency amplification / resource pressure under high concurrency.
- Mitigation idea: Move fetch/parse to async job queue + per-user rate limiting and circuit breaker.

2) `src/lib/summer/versioning/snapshot.ts` switched to per-row version lookup.
- Risk: N+1 query pattern can increase DB load.
- Mitigation idea: restore join-based fetch or batch version map prefetch.
