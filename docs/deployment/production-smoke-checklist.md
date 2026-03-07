# Production Smoke Checklist

## Scope

Use this checklist immediately before and after promoting `main` to production. It covers the routes and operational flows most likely to regress after auth, audit, memory, trace, and tooling changes.

## Pre-Deploy Gates

Run these commands on the exact commit being deployed.

```bash
npm run lint -- --max-warnings=0
npm run typecheck
npm run verify:e2e-encryption-db
npm run verify:runtime-primitives
npm run build
npx vitest run src/__tests__/api/request-user.test.ts src/__tests__/profile/upsert.test.ts src/__tests__/server/logger.test.ts
PLAYWRIGHT_DISABLE_TURNSTILE=1 E2E_ALLOW_AUTO_PROVISION=1 npx playwright test e2e/dashboard-smoke.spec.ts e2e/dashboard-auth-smoke.spec.ts e2e/api-key.spec.ts e2e/spring-memory-crud.spec.ts --project=chromium --workers=1
```

## Dedicated Smoke Account

Use the production smoke helper to pull Vercel production env, ensure a dedicated smoke user exists in Supabase Auth, persist the local-only credentials, and run authenticated bearer/API-key smoke checks without creating a preview deployment.

```bash
npm run smoke:production
```

Expected local artifact:

- `C:\Users\admin\Projects\seizn\.env.production.smoke.local`

The file is ignored by git and stores the dedicated smoke credentials for repeat runs.

Current automated smoke coverage:

- `GET /api/keys`
- `POST /api/keys`
- `GET /dashboard/playground` with Auth.js session cookie
- `GET /api/dashboard/stats` with Auth.js session cookie
- `POST /api/playground/query`
- Trace tab rendering on `/dashboard/playground`
- `GET /api/traces`
- `POST /api/v1/memories`
- `GET /api/v1/memories`
- `DELETE /api/v1/memories`

## Environment Verification

- Confirm `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` target the intended project.
- Confirm `NEXT_PUBLIC_SUPABASE_URL` matches the same project or is intentionally overridden only for client-side use.
- Confirm runtime primitive foreign-key columns still match the referenced base types by running `npm run verify:runtime-primitives` against the target database.
- Confirm `TURNSTILE_SECRET_KEY` exists in production if signup CAPTCHA is expected.
- Confirm `NEXT_PUBLIC_APP_URL` points to the production hostname used by trace share links and device auth flows.
- Confirm mail delivery credentials are valid before enabling welcome emails.

## Functional Smoke

### Auth

- `POST /api/auth/signup`: create a fresh account and verify profile creation plus default API key provisioning.
- `POST /api/auth/device`: start device flow and verify code creation.
- `POST /api/auth/device/verify`: verify pending device code lookup works.
- `POST /api/auth/device/token`: verify a pending code returns `428 authorization_pending` before approval.
- `POST /api/auth/device/approve`: approve a pending device code and verify API key issuance.
- OIDC login: start `GET /api/auth/oidc/[connectionId]` and confirm callback completes without server-side 500.
- SSO runtime primitives: confirm `sso_connections`, `sso_sessions`, `sso_login_attempts`, and `find_sso_connection_by_email` exist in the target DB before deploy.

### Audit

- `GET /api/audit-logs`: verify personal audit log page loads.
- `GET /api/teams/[id]/audit-logs`: verify team audit log page loads.
- `GET /api/admin/audit?summary=true`: verify admin audit summary returns.
- Trigger one write path and confirm either `audit_logs` or legacy `audit_log` records are readable.

### Memory

- Dashboard memory list loads.
- Memory create/update/delete works from the dashboard.
- Search works with and without vector/RPC availability.
- `npm run verify:e2e-encryption-db` still passes against the target database.
- `npm run verify:runtime-primitives` still passes against the target database.

### Traces

- `GET /api/traces`: list traces for an authenticated user.
- `GET /api/traces/[id]`: fetch a specific trace.
- `POST /api/traces/compare`: compare two known traces.
- `POST /api/traces/[id]/share`: create a share link and confirm shared view resolves.
- `GET /api/traces/shared/[shareId]`: open a shared trace anonymously and confirm redacted output.

### Tools And Approvals

- `GET /api/tools`, `POST /api/tools`: admin can list and create tools.
- `GET /api/tool-tokens`, `POST /api/tool-tokens`: admin can create a token and secret is only shown once.
- `GET /api/tool-approvals`, `POST /api/tool-approvals/[id]`: reviewer can list and decide approvals.

## Operational Checks

- Review server logs for any `Request failed`, `Audit logging error`, `Trace ... error`, or `Tool ... error` entries.
- Confirm logged payloads redact bearer tokens, JWTs, email addresses, passwords, API keys, and secret query parameters.
- Confirm Vercel preview and production checks are green before merge/promotion.

## Rollback Triggers

Rollback or hold deployment if any of the following occur:

- Auth routes return 500 instead of 401/403/4xx for invalid or missing credentials.
- Signup creates auth users without profile rows or default API keys.
- Audit log reads fail for both `audit_logs` and `audit_log`.
- Trace sharing leaks raw trace content or secrets in logs.
- Tool token creation exposes token hashes or raw secrets after creation response.
