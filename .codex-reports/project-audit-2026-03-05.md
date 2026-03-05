# Seizn Project-Wide Audit Report

Date: 2026-03-05
Commit baseline: ef2a5f5
Scope: repository-wide quality/security baseline + targeted code review of high-impact routes/rendering/ingestion paths

## Baseline Gates
- lint: PASS
- typecheck: PASS
- tests: PASS (72 files, 853 passed, 16 skipped)
- build: PASS
- npm audit (prod): 0 vulnerabilities
- npm audit (all): 0 vulnerabilities

## Findings (ordered by severity)

### [M1] CSRF protection missing on session-authenticated connector sync mutation route
- File: C:\Users\admin\Projects\seizn\src\app\api\connectors\[type]\sync\route.ts:29
- Evidence: Route uses `auth()` session cookie and performs state changes (`sync_status` update, DB inserts/updates) but does not call `verifyCsrf`/`verifyCsrfToken`.
- Why it matters: Inconsistent CSRF posture vs other mutable API routes can create cross-site request risk depending on cookie policy and deployment configuration.
- Suggested fix: Add CSRF verification at the start of POST handler and require CSRF header/token on caller side.

### [M2] Error handler can incorrectly mark all connector records as `error`
- File: C:\Users\admin\Projects\seizn\src\app\api\connectors\[type]\sync\route.ts:218
- Evidence: Catch cleanup updates `external_connections` by `user_id + connector_type` only (no specific connection id), so one failing request can flip status for unrelated connections of same type.
- Why it matters: Operational correctness issue; may cause false outage states and user confusion.
- Suggested fix: Track resolved `connection.id` and update only that row in catch path.

### [M3] Connector selection can fail when multiple active rows exist
- File: C:\Users\admin\Projects\seizn\src\app\api\connectors\[type]\sync\route.ts:66
- Evidence: Uses `.single()` even when `connectionId` is omitted, which fails if multiple active connections exist.
- Why it matters: Non-deterministic runtime failure in valid multi-connection states.
- Suggested fix: Enforce uniqueness at schema level or switch to deterministic selection (`order + limit(1)` or require `connectionId`).

### [M4] Potential memory pressure from full-body buffering before size enforcement
- File: C:\Users\admin\Projects\seizn\src\lib\knowledge-gap\filler.ts:1045
- Evidence: `Buffer.from(await response.arrayBuffer())` reads full response body before validating `MAX_REMOTE_CONTENT_BYTES` at line 1051.
- Why it matters: Large response bodies can consume memory before guard rejects payload.
- Suggested fix: Check `content-length` preflight when present and/or stream with incremental byte cap.

### [M5] Window resize listener is never removed in renderer destroy path
- File: C:\Users\admin\Projects\seizn\src\lib\graph-viz\graph-renderer.ts:159
- Evidence: Adds anonymous `window.addEventListener('resize', () => this.handleResize())` and `destroy()` does not remove listener.
- Why it matters: Potential memory leak and duplicated handler execution across mount/unmount cycles.
- Suggested fix: Store bound handler reference and remove it in `destroy()`.

## Assumptions / Open Questions
1. Is `external_connections` guaranteed unique per `(user_id, connector_type)`? If yes, [M3] severity reduces.
2. Are session cookies always deployed with strict CSRF-resistant settings (SameSite + origin checks at edge/WAF)? If yes, [M1] exploitability reduces.

## Residual Gaps in this audit
- Lighthouse/UI capture was skipped because no `--base-url` runtime target was provided to web-quality checker.
- Dynamic runtime threat simulation (live traffic, chaos, load tests) not included.
