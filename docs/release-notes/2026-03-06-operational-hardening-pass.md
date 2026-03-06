# 2026-03-06 Operational Hardening Pass

## Summary

- Hardened server-side auth fallbacks to avoid cross-project Supabase drift.
- Replaced additional raw `console.error` and `console.warn` calls in operationally sensitive API routes with the shared redacted server logger.
- Extended the redacted logger rollout to connector OAuth and budget planning APIs.
- Extended the same logger rollout to recurring cron routes for billing, summaries, and audit batch jobs.
- Extended the rollout to drift analysis and Winter RTBF cron flows.
- Extended the rollout to Spring maintenance cron flows.
- Hardened security workflows so PR secret scans and red-team checks can run with explicit GitHub token permissions and DB-less CI fallback.
- Documented the production smoke flow used before deploy and after merge.
- Added runtime DB primitive verification for device auth, SSO, and relay contracts, and restored missing compat tables/functions for drifted environments.

## Included Areas

- `src/app/api/enterprise/*`
- `src/app/api/adapters/*`
- `src/app/api/admin/federated/*`
- `src/app/api/connectors/*`
- `src/app/api/budget/*`
- `src/app/api/cron/audit-batch/*`
- `src/app/api/cron/subscription-expiry/*`
- `src/app/api/cron/weekly-summary/*`
- `src/app/api/cron/usage-cleanup/*`
- `src/app/api/cron/usage-alerts/*`
- `src/app/api/cron/monthly-reset/*`
- `src/app/api/cron/drift-analysis/*`
- `src/app/api/cron/winter/rtbf/process-queue/*`
- `src/app/api/cron/winter/rtbf/verify-pending/*`
- `src/app/api/cron/spring/beyond-mem0/*`
- `src/app/api/cron/spring/jobs/process/*`
- `src/lib/security/red-team.ts`
- `.github/workflows/security-tests.yml`
- `.github/workflows/red-team-security.yml`
- `src/lib/server/logger.ts`
- `docs/deployment/production-smoke-checklist.md`
- `scripts/db-verify-runtime-primitives.mjs`
- `scripts/run-migration-file.mjs`
- `scripts/pre-deploy.sh`
- `supabase/migrations/20260306006_runtime_auth_relay_primitives_restoration.sql`
- `src/app/api/status/*`
- `src/app/api/tenant-policy/*`
- `src/app/api/retention/*`
- `src/app/api/relay/*`
- `src/app/api/sso/*`
- `src/lib/auth.ts`
- `src/lib/sso/*`

## Operational Impact

- Server error paths now pass through redaction before emission.
- Failure logs from enterprise inquiry, SSO configuration, adapter lifecycle, federated admin routes, connector OAuth flows, budget APIs, recurring operational cron routes, drift analysis, Winter RTBF cron flows, and Spring maintenance cron flows no longer risk leaking bearer tokens, API keys, cookies, or emails.
- Pre-deploy and migration workflows now fail fast when device auth, SSO, or relay runtime primitives are missing.
- No API contract changes were introduced.
- Added a compat restoration migration for missing device auth, SSO, and relay runtime objects in drifted environments.

## Verification

- `npm run lint -- --max-warnings=0`
- `npm run typecheck`
- `npm run verify:e2e-encryption-db`
- `npm run verify:runtime-primitives`
- `npm run test`
- `npm run build`
- `PLAYWRIGHT_DISABLE_TURNSTILE=1 E2E_ALLOW_AUTO_PROVISION=1 npx playwright test e2e/dashboard-smoke.spec.ts e2e/dashboard-auth-smoke.spec.ts e2e/api-key.spec.ts e2e/spring-memory-crud.spec.ts --project=chromium --workers=1`

## Related Merges

- `#42` server auth fallback hardening
- `#43` operational hardening pass
