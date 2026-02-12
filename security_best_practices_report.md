# Seizn Security Best Practices Report

Date: 2026-02-12
Scope: `src/` (Next.js + TypeScript API/app routes and related libs)
Reviewer: Codex (`security-best-practices` workflow)

## Executive Summary
The most serious risks are server-side code execution paths (`new Function`) reachable from authenticated API inputs, predictable hardcoded secret fallbacks for token/signature logic, and an OIDC open-redirect path. Prioritize CRIT-01/CRIT-02 first.

## Critical

### CRIT-01: Server-side code execution via custom assertion function
- Impact: Authenticated users can execute arbitrary JavaScript on the server process, which can lead to secret exfiltration and full backend compromise.
- Evidence:
  - `src/app/api/fall/contracts/route.ts:65` allows `custom` assertion type and stores arbitrary `params`.
  - `src/app/api/fall/contracts/validate/route.ts:137` passes untrusted `params` from request into runtime contract.
  - `src/lib/fall/contracts/assertions.ts:628` executes `new Function('value', 'data', fn)`.
- Recommendation:
  - Remove/disable `custom` in API-facing contract definitions, or
  - Evaluate expressions in a hardened isolated sandbox process with strict allowlist and no global object access.

### CRIT-02: Server-side code execution via healing plan transform map/filter
- Impact: Authenticated users can submit malicious healing plans that trigger arbitrary server-side JavaScript execution.
- Evidence:
  - `src/app/api/fall/healing/fix/route.ts:82` accepts raw `plan` from request body.
  - `src/lib/fall/healing/auto-healer.ts:214` iterates and executes all plan actions.
  - `src/lib/fall/healing/strategies.ts:291` and `src/lib/fall/healing/strategies.ts:305` execute `new Function(...)` for `mapFn`/`filterFn`.
- Recommendation:
  - Do not accept client-supplied executable plan structures.
  - Recompute plans server-side from trusted rules only.
  - Remove `map`/`filter` string-eval capability or replace with fixed built-in transforms.

## High

### HIGH-03: Predictable hardcoded signing/auth secret fallbacks
- Impact: If env vars are missing/misconfigured, attackers can forge tokens/signatures and bypass intended access controls.
- Evidence:
  - `src/app/api/review-token/route.ts:5` (`REVIEW_ADMIN_SECRET` fallback)
  - `src/app/api/review-token/route.ts:7` (`REVIEW_TOKEN_SECRET` fallback)
  - `src/lib/review-token.ts:6` (`REVIEW_TOKEN_SECRET` fallback)
  - `src/lib/winter/org/evidence-pack-builder.ts:334` (`EVIDENCE_PACK_SIGNING_KEY` fallback)
- Recommendation:
  - Fail fast on boot/request when required secrets are missing.
  - Remove insecure defaults, rotate existing secrets, and add startup health checks.

### HIGH-04: OIDC callback open redirect
- Impact: Post-authentication redirect can be abused for phishing and token/session flow abuse.
- Evidence:
  - `src/app/api/auth/oidc/[connectionId]/route.ts:80` reads `callbackUrl` from query and stores it directly in cookie.
  - `src/app/api/auth/oidc/callback/route.ts:201` redirects with `new URL(redirectUrl, baseUrl)`.
- Recommendation:
  - Allow only relative internal paths (e.g., must start with `/` and not `//`).
  - Reject absolute URLs and clear invalid cookie values.

## Medium

### MED-05: Client-side callbackUrl redirect not sanitized in auth pages
- Impact: Login/signup completion flows may redirect users to attacker-controlled destinations.
- Evidence:
  - `src/app/(auth)/login/login-form.tsx:12` reads `callbackUrl` from query.
  - `src/app/(auth)/login/login-form.tsx:68` performs `router.push(callbackUrl)`.
  - `src/app/(auth)/signup/signup-form.tsx:12`, `src/app/(auth)/signup/signup-form.tsx:83`, `src/app/(auth)/signup/signup-form.tsx:102`.
- Recommendation:
  - Normalize callback to internal path before pushing.

## Low / Hardening

### LOW-06: Wildcard CORS in preflight handlers on authenticated APIs
- Impact: Lower risk currently (auth still required), but broadens cross-origin surface and future misconfig blast radius.
- Evidence:
  - `src/app/api/onboarding/analyze/route.ts:245`
  - `src/app/api/summer/rag/route.ts:294`
- Recommendation:
  - Restrict `Access-Control-Allow-Origin` to trusted origins.

## Notes
- `src/lib/sso/saml-provider.ts:173` indicates SAML signature validation is not fully implemented; this should remain blocked from production use until complete validation exists.

## Suggested Remediation Order
1. CRIT-01
2. CRIT-02
3. HIGH-03
4. HIGH-04
5. MED-05
6. LOW-06
