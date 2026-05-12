# 2026-05-11 — P0 prod incident: memories invisible + Stripe webhook dead-on-arrival

**Status:** Root-cause analysis complete. Runtime hotfixes applied to prod. **Code-level hardening pending — this doc is the handoff.**

**Audience:** Codex (next engineering session).
**Investigator:** Claude (Opus 4.7).
**Verified deployment at time of analysis:** `dpl_8ndoY6ZMxmwfGXyNzeMH6uXqwW5t` (2026-05-10 build by Codex).

---

## TL;DR

Four production bugs were uncovered while smoke-testing a Track 2 Pro API purchase:

| # | Bug | Severity | Status | Owner |
|---|---|---|---|---|
| 1 | `memories.is_deleted` schema drift makes all rows invisible to GET | P0 | **Hotfix applied to prod** (backfill) + code patch needed | Codex (this handoff) |
| 2 | Stripe webhook URL `seizn.com → www.seizn.com` 308 redirect causes all events to stay `pending` | P0 | **Hotfix applied** (URL updated to www in Stripe Dashboard) | Done — verification ongoing |
| 3 | `profiles.plan` is never updated by Stripe webhook for Track 2 buyers; user shows `free` in `/api/me` even with active Pro sub | P0 | **One-user hotfix applied** (manual `UPDATE` on operator account) + handler patch needed | Codex (this handoff) |
| 4 | `MEMORY_V1_SPRING_BRIDGE_MIRROR=enabled` but `spring_memory_notes` table is missing → log noise on every POST | P1 | Pending decision (apply schema vs disable flag) | Codex (this handoff) |

Bonus P2: `?mode=hybrid` search hits Vercel 60s timeout on cold start — separate issue, documented in `ISSUES.md`.

---

## Bug 1 — `memories.is_deleted` schema drift (root cause for "memories invisible")

### Evidence

```sql
-- Column metadata in prod DB (2026-05-11):
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='memories' AND column_name='is_deleted';
-- → is_deleted, YES, null

-- Distribution before hotfix:
SELECT is_deleted::text, COUNT(*) FROM memories GROUP BY is_deleted;
-- → NULL: 20, 'false': 1174, 'true': 72
```

Migration `supabase/migrations/025_summer_versioning.sql:11` declares
`ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE`,
but prod actual column is `nullable, default null`. The column likely
existed before 025 was authored (with a looser definition), so the
`IF NOT EXISTS` guard short-circuited the new constraint. The 20 NULL
rows are the rows inserted after the drift but before backfill.

POST `/api/v1/memories` (`src/app/api/v1/memories/route.ts:903-950`) omits
`is_deleted` from `insertPayload`, relying on the DB default — but the
default is NULL, not false. All GET paths filter `.eq('is_deleted', false)`
which is false for `is_deleted = NULL` under PostgreSQL three-valued logic.

### What I already did (runtime hotfix)

```sql
-- Applied 2026-05-11 ~03:14 UTC
UPDATE memories SET is_deleted = false WHERE is_deleted IS NULL;
-- 20 rows updated.
```

GET-by-id, browse, search now return rows for affected users.

### What you (Codex) need to ship

**1.1 — Defensive insert payload** (single-file change, immediate ship):

In `src/app/api/v1/memories/route.ts` insertPayload (around line 903):

```diff
   const insertPayload = {
     user_id: userId,
     ...
     content_hash: contentHash,
     tier: 'hot',
+    is_deleted: false,
+    deleted_at: null,
     pinned: rawBody.pinned === true,
     ...
```

Same check across all other `from('memories').insert(...)` callers — grep for them:
`grep -rn "from('memories').*insert\|\.from('memories')" src/ | grep -i insert`.

**1.2 — Schema convergence migration**:

Create `supabase/migrations/20260511_memories_is_deleted_not_null.sql`:

```sql
-- Ensure is_deleted is non-nullable with FALSE default to prevent
-- repeat of 2026-05-11 NULL-rows-invisible incident. Migration 025
-- declared this but was skipped by IF NOT EXISTS against a pre-existing
-- nullable column. Backfill done out-of-band on 2026-05-11.

BEGIN;

-- Sanity: no NULL rows should remain (out-of-band backfill done).
DO $$
DECLARE null_count INT;
BEGIN
  SELECT COUNT(*) INTO null_count FROM public.memories WHERE is_deleted IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'memories.is_deleted has % NULL rows; backfill before applying', null_count;
  END IF;
END$$;

ALTER TABLE public.memories
  ALTER COLUMN is_deleted SET NOT NULL,
  ALTER COLUMN is_deleted SET DEFAULT FALSE;

COMMIT;
```

Apply via `node run-migration-file.mjs supabase/migrations/20260511_memories_is_deleted_not_null.sql`.

**1.3 — E2E regression test** (currently missing):

Add a Playwright or vitest test that does POST → GET-by-id round-trip
through `/api/v1/memories` and asserts the row is retrievable. This bug
shipped because no such test exists.

---

## Bug 2 — Stripe webhook URL apex → www redirect (root cause for stuck `pending` events)

### Evidence

```
Stripe webhook endpoint id: we_1TJdnB8XSoMws9Ufpu272MHY
Registered URL (before fix): https://seizn.com/api/webhooks/stripe
Probe:
  curl -X POST https://seizn.com/api/webhooks/stripe -d '{}'
  → HTTP 308, Location: https://www.seizn.com/api/webhooks/stripe
Stripe behavior: does NOT follow webhook redirects → marks delivery failed → retries indefinitely.

Affected events for cus_UUbogaNptWlOF5 (test user): all 5 critical billing events stuck pending: 1:
  - evt_1TVdvc8XSoMws9UfhQsEnUKl checkout.session.completed
  - evt_1TVdvc8XSoMws9UfIoOCUmD1 customer.subscription.created
  - evt_1TVdvc8XSoMws9UfPorLUaiz invoice.paid
  - evt_1TVdvc8XSoMws9Uf3muntynk customer.updated
  - evt_1TVdvc8XSoMws9Uf1xcx13VY customer.updated
```

This affects ALL paying customers since the apex→www redirect was set up
(presumably some time before 2026-05-10 because Codex's same-day fix
"Fix dashboard API key issuance" worked around this by directly reading
Stripe state at key creation, but did not fix the webhook).

### What I already did (runtime hotfix)

`PATCH https://api.stripe.com/v1/webhook_endpoints/we_1TJdnB8XSoMws9Ufpu272MHY`
with `url=https://www.seizn.com/api/webhooks/stripe`.

Verified `after.url == https://www.seizn.com/api/webhooks/stripe`.
Stripe will auto-retry the pending events on its exponential backoff
schedule (next retry within hours, total retry window 3 days).

### What you (Codex) need to ship

**2.1 — Verify retry success**: After several hours, requery Stripe events
and confirm the `pending` counts have dropped to 0:

```js
fetch('https://api.stripe.com/v1/events?limit=30', {headers:{Authorization:`Bearer ${STRIPE_SECRET_KEY}`}})
  .then(r=>r.json())
  .then(d => d.data.filter(e => e.pending_webhooks > 0))
```

**2.2 — Hard guard against apex/www split for billing endpoints**:

Either:
- A. Add a Vercel redirect rule (in `vercel.json` or `next.config.ts`) that 308s `seizn.com/api/*` to `www.seizn.com/api/*` BUT for the webhook path issue a 200 proxy instead of a redirect — Stripe doesn't follow redirects.
- B. Set the apex domain to serve directly (same Next.js app), removing the redirect entirely.
- C. Update CI smoke (`scripts/production-smoke.mjs`?) to POST to the apex webhook URL and assert 4xx/5xx with body, never 3xx — would have caught this immediately.

I recommend **C** as the minimal anti-regression; A/B is a bigger infra change.

**2.3 — Stripe webhook URL drift detector**:

Cron or CI assertion: query Stripe API for `webhook_endpoints[].url` and
assert it matches expected prod URL. Stripe Dashboard accidental edits
will be caught the same day.

---

## Bug 3 — `profiles.plan` never synced for Track 2 buyers

### Evidence

`src/app/api/webhooks/stripe/route.ts` handlers:

- `checkout.session.completed` (575-636): updates `stripe_customer_id`,
  `stripe_subscription_id`, `stripe_subscription_status`,
  `price_lock_version`, `plan_updated_at` — **does NOT update `plan`**.
- `customer.subscription.created` (638-...): calls `maybeApplyV9Track2`
  → `applyV9Track2TierToApiKeys` (`src/lib/billing/v9-products.ts:387`)
  which **only updates `api_keys`** (monthly_quota, rate_limit_per_minute, scopes).

Meanwhile:
- `/api/me` (`src/app/api/me/route.ts:65-91`) reads `profile.memory_count` and uses `planConfig` keyed on `profile.plan` to populate `limits`.
- `src/lib/api-auth.ts:210-219` reads `profile.plan` to compute rate limits via `checkRateLimitAsync(userId, plan)`.

So Track 2 buyers correctly get Pro-tier `api_keys` quotas at key
creation time (thanks to Codex's same-day fix), but `profile.plan`
stays `'free'` and `/api/me` continues to report Free limits.

### What I already did (one-user hotfix)

```sql
UPDATE profiles SET plan='pro', updated_at=NOW()
WHERE id='34821db7-71e6-401f-a376-e9f1e215cd7c';
```

`/api/me` now correctly reports `plan.name: "pro"` for the operator account.

### What you (Codex) need to ship

**3.1 — Decide source of truth for `plan`**:

Two paths, both valid:

- **Path A (recommended)**: `profile.plan` is THE plan field. Webhook
  handler should set `profile.plan = 'pro' | 'studio' | …` based on the
  highest-tier active subscription (Track 1 OR Track 2). The plan field
  needs values like `'track1_pro'`, `'track2_pro'`, or a flat tier that
  composes both. Simplest: a single `tier` enum maxed across tracks.

- **Path B**: `/api/me` and rate-limit lookups read entitlements from a
  derived view (subscription rows + api_keys + profile) rather than the
  raw `profile.plan` column. More flexible but bigger refactor.

Path A is faster to ship. Document the new tier semantics if introducing
new values.

**3.2 — Webhook handler patch (matches Path A)**:

In `src/app/api/webhooks/stripe/route.ts` `customer.subscription.created`
branch (~line 678), after `applyV9Track2TierToApiKeys` succeeds:

```ts
// Reflect Track 2 tier in profile.plan so /api/me and rate-limit lookups
// see the user as a paying customer. (Track 1 web-app plan is still
// determined by Track 1 subscriptions if those exist — adjust the merge
// semantics here when both tracks can be active.)
await supabase.from('profiles').update({
  plan: v9.tier,            // 'indie' | 'pro' | 'studio' | …
  plan_updated_at: new Date().toISOString(),
}).eq('id', user.id);
```

Mirror in `customer.subscription.updated` and `customer.subscription.deleted` (downgrade/cancel → plan back to 'free').

**3.3 — Backfill query for any other affected users**:

```sql
-- Find users with active Stripe subscription but profile.plan='free'.
-- Run from Stripe API side and cross-reference; or join via stripe_customer_id.
SELECT p.id, p.email, p.plan, p.stripe_customer_id, p.stripe_subscription_id, p.stripe_subscription_status
FROM profiles p
WHERE p.stripe_subscription_id IS NOT NULL
  AND p.stripe_subscription_status = 'active'
  AND p.plan = 'free';
```

Manually patch (or wait for the redelivered webhook from Bug 2 fix to do it automatically once 3.2 ships).

---

## Bug 4 — SpringV4 bridge enabled but target table missing

### Evidence

```
DB query: SELECT relation 'public.spring_memory_notes' → does not exist
POST /api/v1/memories response always contains:
  bridge.springV4.mirrored: false
  bridge.springV4.skippedReason: "mirror_failed"
Each POST logs '[v1/memories] Spring v4 mirror error' (Sentry noise).
```

`MEMORY_V1_SPRING_BRIDGE_MIRROR_REQUIRED=false` is in effect (otherwise
POST would 500 and rollback the memory). DB writes succeed via the legacy
`memories` table; the mirror to `spring_memory_notes` throws because the
table doesn't exist.

### Recommended fix (Codex pick one)

- **A.** Apply `supabase/migrations/020_spring_schema.sql` to prod (full SpringV4 schema). Then mirror starts working.
- **B.** In Vercel env, set `MEMORY_V1_SPRING_BRIDGE_MIRROR=false`. Clean logs; no mirror until SpringV4 is ready to ship.

B is safer if SpringV4 isn't ready. A only if SpringV4 read path is also wired up (which would need verifying against `searchViaSpringV4Bridge` and the bridge's tests).

---

## Bonus P2 — `?mode=hybrid` search 504

`GET /api/v1/memories?query=...&mode=hybrid` exceeds Vercel 60s function
timeout on cold start even with empty memory pool. Likely culprits:
Voyage AI embedding cold start + SpringV4 search fallback hang (no
timeout on the bridge call in `src/app/api/v1/memories/route.ts:1887-1920`).

Not fixed today. Lower priority because:
- `?mode=keyword` and `?mode=vector` paths are not timing out.
- Browse mode and GET-by-id work fine after Bug 1 backfill.

Recommended: wrap `searchViaSpringV4Bridge` with `AbortController` + 5s
timeout, and add an explicit fetch timeout to Voyage API calls.

---

## Verification log (operator-facing)

```
2026-05-11 ~03:11 UTC  UPDATE profiles SET plan='pro' WHERE id='34821db7-...' (1 row)
2026-05-11 ~03:13 UTC  Stripe webhook URL: seizn.com → www.seizn.com (we_1TJdnB8XSoMws9Ufpu272MHY)
2026-05-11 ~03:14 UTC  UPDATE memories SET is_deleted=false WHERE is_deleted IS NULL (20 rows)
2026-05-11 ~03:15 UTC  Verified: GET /api/v1/memories/{id} 200, GET browse returns 2 test rows
2026-05-11 ~03:16 UTC  Verified: /api/me reports plan='pro'
2026-05-11 ~03:17 UTC  DELETE test memories (2 rows)
```

## Appendix A — Broader sweep (similar-pattern bugs found 2026-05-11)

After the four primary bugs were fixed/handed off, a system-wide sweep
was run to find sibling issues. Findings:

### A.1 Schema drift across 10 boolean columns (currently dormant)

The same `nullable + null default` pattern as `memories.is_deleted` was
found in **10 columns**. Live NULL counts are 0 right now, but new
inserts that don't specify a value will create NULL rows that filters
exclude.

| Table | Column | Risk if NULL |
|---|---|---|
| `memories` | `is_encrypted` | **High** — `src/lib/memory-optimizer.ts` filters `.eq('is_encrypted', false)` in 5 places (compact/decay/personalization). NULL row → optimizer skips it. |
| `memories` | `is_deleted` | Fixed today. Listed for completeness. |
| `provider_keys_public` | `is_active`, `is_default` | BYOK key validity / default selection silently fails. |
| `policy_pack_catalog` | `is_official`, `publisher_verified` | Policy catalog UI badges silently disappear. |
| `winter_rtbf_verification_summary` | `is_verified` | RTBF verification status filter excludes new rows. |
| `answer_contracts` | `is_grounded` | Currently 0 rows; harmless until table populated. |
| `flight_recorder_traces` | `sampled` | Sampling toggle skipped. |
| `plan_selections` | `user_satisfied` | Currently 0 rows. |

**Recommendation (codex):**

Bundle a schema-convergence migration that applies to all 10:

```sql
-- For each column, after backfilling NULL to its intended default:
ALTER TABLE public.<table>
  ALTER COLUMN <column> SET NOT NULL,
  ALTER COLUMN <column> SET DEFAULT FALSE;
```

And audit insert paths for each table to explicitly set values rather
than rely on DB defaults.

`api_keys.is_active` (nullable but `default=true`) is **NOT** at risk
under this pattern — inserts that omit the field get TRUE, matching
caller expectations.

### A.2 `profile.memory_count` counter drift on soft-delete

The `on_memory_change` DB trigger fires AFTER INSERT/UPDATE/DELETE and
calls `update_memory_count()`. Concrete drift observed:

- `admin@seizn.com`: total rows=1241, alive=1184, soft-deleted=57, counter=1239
- Counter ≈ all rows minus hard-deletes; does NOT decrement on soft-delete

Effect: users who soft-delete heavily will hit their plan quota earlier
than the active row count suggests.

**Recommendation:** Update `update_memory_count()` PL/pgSQL function to
detect `OLD.is_deleted = false AND NEW.is_deleted = true` (decrement)
and `OLD.is_deleted = true AND NEW.is_deleted = false` (increment).
Then run a one-time recompute pass on existing profiles:

```sql
UPDATE profiles p SET memory_count = (
  SELECT COUNT(*)::int FROM memories m
  WHERE m.user_id::text = p.id::text AND COALESCE(m.is_deleted, false) = false
);
```

### A.3 Other webhook endpoints — verify URL apex/www externally

Stripe webhook drift was an externally-registered URL issue, not in our
code. Same risk applies to other inbound webhooks that aren't visible
from inside the repo:

- `https://www.seizn.com/api/webhooks/github`
- `https://www.seizn.com/api/webhooks/resend`
- `https://www.seizn.com/api/webhooks/bug-tracker/[provider]` (outbound)
- `https://www.seizn.com/api/webhooks/deliveries`

**Action (operator):** in GitHub repo settings → Webhooks, and Resend
dashboard → Webhooks, verify each registered URL begins with `www.`. If
any are apex-only, change to www. Then add a smoke check similar to
A.2 above for each.

### A.4 No other paying customers stuck on Free

Cross-check (2026-05-11): zero profiles match `stripe_subscription_status
= 'active' AND plan IN ('free', NULL)` besides the operator account
which we already hotfixed. The webhook handler bug (§3) would have
affected anyone else, but there are no other paying customers right now
— so we only had the 1 to repair manually.

### A.5 Test fixtures with inflated `api_keys.monthly_quota`

~30 e2e test profile rows have `plan='free'` but `monthly_quota=100`
(Free V9 quota is 50/day). These are test fixtures, not real bug
exposure — flagged only because the same query would catch real plan
drift if it occurred. Consider standardising fixtures to match V9
quotas to keep the drift detector clean.

### A.6 No apex URL hardcoded in code/config

`grep -rE "https?://seizn\.com[/\"']" --include='*.ts' --include='*.json' src/ scripts/ vercel.json next.config.ts` returned 0 hits. The
Stripe URL drift was a one-off Stripe Dashboard registration error, not
a systemic code issue.

---

## Operator action items (not code)

1. **Rotate the 4 DB passwords** exposed via the env-sourcing accident
   earlier in the session (see also `feedback_env_sourcing.md` in Claude
   memory). The exposed values were in transcript only, not pushed
   anywhere, but rotation is still warranted. After rotation, update
   `~/.codex/private/consolidated/litheon.env`.
2. **Revoke the test API key `sk_seizn_b524eb3d_…`** when the next
   session no longer needs it; remove the corresponding line from
   `iruhana25.env`.
3. Verify Stripe pending webhook count drops to 0 over the next 24h
   (Bug 2 retry window).
