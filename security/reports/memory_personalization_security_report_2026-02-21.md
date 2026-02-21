# Memory Personalization Security Review (2026-02-21)

## Executive Summary
- Scope: `v1` memory personalization/feedback API endpoints and related DB migration.
- Result: No open Critical/High findings in reviewed scope after hardening.
- Actions completed:
  - Applied DB migration `20260221_memory_personalization_learning.sql` to production DB.
  - Added input/namespace validation, metadata size guard, API-key usage check, and same-origin session write guard.
  - Enabled/verified RLS and policies on new personalization tables.

## Findings

### Critical
- None.

### High
- None.

### Medium

#### F-001 (Fixed): Namespace integrity gap in feedback endpoint
- Rule ID: `NEXT-INPUT-VALIDATION-001`
- Severity: Medium
- Location: `src/app/api/v1/memories/feedback/route.ts:107`, `src/app/api/v1/memories/feedback/route.ts:134`
- Evidence:
  - Added namespace format validation.
  - Added namespace consistency check (`requested namespace` must match memory namespace).
- Impact:
  - Without this, a client could poison/adapt a different namespace profile using feedback from another namespace memory.
- Fix:
  - Enforced namespace format and strict namespace match.
- Mitigation:
  - Keep namespace regex consistent across all memory APIs.

#### F-002 (Fixed): Unbounded metadata/query payload in feedback endpoint
- Rule ID: `NEXT-INPUT-BOUNDS-001`
- Severity: Medium
- Location: `src/app/api/v1/memories/feedback/route.ts:24`, `src/app/api/v1/memories/feedback/route.ts:25`, `src/app/api/v1/memories/feedback/route.ts:145`
- Evidence:
  - Added `MAX_METADATA_BYTES` and `MAX_QUERY_LENGTH` guards.
- Impact:
  - Without bounds, oversized request bodies can increase resource usage and degrade availability.
- Fix:
  - Reject metadata larger than 4KB and cap query length.
- Mitigation:
  - Add gateway-level payload limits as defense-in-depth.

### Low

#### F-003 (Fixed): API-key usage check bypass on state-changing endpoints
- Rule ID: `NEXT-AUTH-RATE-001`
- Severity: Low
- Location: `src/app/api/v1/memories/feedback/route.ts:47`, `src/app/api/v1/memories/personalization/route.ts:49`
- Evidence:
  - Changed `authenticateRequest(..., { skipUsageCheck: false })`.
- Impact:
  - Bypass could reduce abuse visibility/quota enforcement for API-key traffic.
- Fix:
  - Enabled usage check for API-key path.
- Mitigation:
  - Keep consistent auth settings for all v1 write endpoints.

#### F-004 (Fixed): Session write endpoints lacked explicit same-origin guard
- Rule ID: `NEXT-CSRF-ORIGIN-001`
- Severity: Low
- Location: `src/app/api/v1/memories/feedback/route.ts:65`, `src/app/api/v1/memories/feedback/route.ts:86`, `src/app/api/v1/memories/personalization/route.ts:67`, `src/app/api/v1/memories/personalization/route.ts:161`, `src/app/api/v1/memories/personalization/route.ts:239`
- Evidence:
  - Added same-origin check using `Origin/Referer` for session-authenticated write requests.
- Impact:
  - Reduces CSRF exposure for browser session traffic.
- Fix:
  - Block cross-origin session write attempts with HTTP 403.
- Mitigation:
  - Consider centralized CSRF middleware/token for all session write routes.

## Database Migration Security Notes
- Migration file: `supabase/migrations/20260221_memory_personalization_learning.sql`
- Compatibility fix:
  - `user_id` adjusted to `TEXT` and policy checks to `auth.uid()::text`.
  - Evidence: `supabase/migrations/20260221_memory_personalization_learning.sql:12`, `supabase/migrations/20260221_memory_personalization_learning.sql:56`, `supabase/migrations/20260221_memory_personalization_learning.sql:116`
- Runtime verification (production DB):
  - Tables exist: `user_memory_learning_profiles`, `memory_feedback_events`
  - RLS enabled on both tables
  - Policies present: 9

## Verification Run
- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run build` ✅

## Residual Risks / Follow-ups
1. Add centralized CSRF middleware/token checks for all session-authenticated state-changing APIs (not only these two routes).
2. Normalize Supabase migration history workflow (CLI linked project + consistent migration ledger) to reduce operational drift risk.
