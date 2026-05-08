# Incident Response Runbook (W5.8)

> Last updated: 2026-05-09. Owner: Litheon LLC oncall (currently solo founder + AI).
>
> Severity ladder, breach notification timelines, and 4 named scenarios.

## Severity ladder

| Sev | Definition | Response time | Examples |
|-----|------------|---------------|----------|
| **P0** | Total outage or security breach exfiltrating PII | < 5 min ack | DB compromise, BYOK key leak, full landing 5xx |
| **P1** | Major degradation, payments blocked, or auth broken | < 15 min ack | Stripe webhook 100% fail, NextAuth 5xx spike, GlitchTip down |
| **P2** | Single-feature failure, perf regression past budget | < 1 h ack | Memory extract returning empty, p75 LCP > 2.5s |
| **P3** | Cosmetic / minor / single-user | < 24 h ack | i18n string missing, banner copy typo |

## Breach notification timelines (compliance)

| Regime | Notify supervisory authority | Notify affected users | Reference |
|--------|----------------------------|-----------------------|-----------|
| **PIPA** (Korea) | within **72 h** of becoming aware (`개인정보 분실·도난·유출` 한정 사례 24 h) | "without undue delay" | PIPA §34 + KISA guidance |
| **GDPR** (EU) | within 72 h | "without undue delay" if high risk | GDPR Article 33-34 |
| **CCPA** (California) | n/a (no DPA notification req.) | within "most expedient time possible" | Cal. Civ. Code §1798.82 |
| **PIPEDA** (Canada) | "as soon as feasible" | "as soon as feasible" if real risk of significant harm | PIPEDA §10.1 |

## Scenarios

### Scenario A: Stripe webhook outage / 100% failure rate

Trigger: alert #4 (`stripe_webhook_failure`) on `#oncall` Slack — see [glitchtip-alerts.md](./glitchtip-alerts.md).

Severity: **P1**. Customers' subscription state stops updating: new signups don't get tier upgrades, cancels don't downgrade.

Steps:

1. Acknowledge within 15 min; post in `#oncall` thread.
2. Check Stripe Dashboard → Developers → Events → Webhooks. Look for the response code:
   - 5xx → app issue. Check Vercel deploy status, recent commits to `src/app/api/webhooks/stripe/route.ts`.
   - 4xx with signature error → `STRIPE_WEBHOOK_SECRET` env mismatch (Litheon vs iruhana25 account confusion).
   - 4xx with idempotency error → `stripe_webhook_events` table FK or unique constraint regression.
3. If app-side: roll back the most recent deploy (`vercel rollback` previous prod alias) while investigating.
4. Stripe will retry events for 3 days automatically. Once fixed, no manual replay needed.
5. Post-incident: count missed events, check `stripe_webhook_events` table for missing `processed_at` rows older than 1 hour, manually re-trigger via `stripe events resend evt_xxx`.

Recovery verification:

- Rate of new event ingestion returns to baseline (≥1/min during business hours).
- `subscriptions` table `updated_at` timestamps catch up to recent Stripe events.

### Scenario B: Auth (NextAuth) 5xx spike

Trigger: alert #2 (`auth_5xx_spike`) — login impossible.

Severity: **P0** if 100%, **P1** if degraded.

Steps:

1. Check Vercel deploy logs `/api/auth/*` for stack traces.
2. Common causes:
   - Supabase outage → status.supabase.com.
   - `NEXTAUTH_SECRET` env removed/rotated → check Vercel env diff.
   - GitHub/Google OAuth token expired → check provider dashboard.
   - Edge runtime regression in `auth.config.ts` (W2.6 split) → roll back.
3. Communications: post to /status (W5.8 status page) within 15 min.
4. If Supabase outage: nothing to fix on our side; update status page hourly.

### Scenario C: Database breach or data leak (PIPA/GDPR notification)

Severity: **P0**.

Examples:
- Supabase support reports unauthorized access.
- Public S3 / R2 bucket discovered with customer PII.
- API endpoint leaks data across tenants (RLS bypass).

Steps:

1. **Containment first** (do NOT communicate before contained):
   - Rotate Supabase service role key.
   - Rotate Litheon Stripe API key + webhook secret.
   - Rotate Resend API key + webhook secret.
   - Rotate Cloudflare R2 access keys.
   - Force-logout all sessions: invalidate JWT secrets and rotate `NEXTAUTH_SECRET`.
2. **Scope assessment** (within 24 h):
   - Identify affected user_ids and PII types.
   - Pull access logs from Supabase, Vercel, Cloudflare.
   - Check `ai_transparency_events`, `stripe_webhook_events`, audit logs for anomaly window.
3. **Notify regulators** (within 72 h of awareness):
   - **KISA** (Korea): file at https://privacy.kisa.or.kr → 신고센터 → 개인정보 유출 신고. Use Korean-language template at `legal/breach-templates/pipa-72h.md`.
   - **EU DPA** (lead authority depends on user location, default Irish DPC for SaaS): file via online breach form.
   - **California AG** (if >500 CA residents): submit at oag.ca.gov.
4. **Notify users** without undue delay — email template in `legal/breach-templates/user-notification.md`.
5. **GDPR erasure follow-up**: after notification, run `scripts/gdpr-erasure-sweep.ts` to purge affected records from GlitchTip + PostHog + backups beyond statutory retention.

### Scenario D: Founding member offboarding / mass account deletion request

Severity: **P2**.

Trigger: bulk account deletion (>10 in a day) — could indicate mass dissatisfaction or coordinated abuse.

Steps:

1. Verify deletions are real (check user-agent, IP variety, signup dates).
2. If coordinated: pause the deletion endpoint (admin flag in Supabase) and ask each user one-by-one to confirm.
3. If real dissatisfaction: announce in `#announcements` Discord, follow up with each.
4. After confirmation: run GDPR erasure sweep (Scenario C step 5).

## On-call rotation

For Wave 2 launch (founding-member only), oncall is solo founder. After Series A or 5+ Studio Managed customers (whichever first), set up:

- **better-uptime** schedule (paid, $24/mo) with PagerDuty fallback.
- 2-person rotation minimum. No single point of contact.
- Escalation: founder → lawyer (legal counsel for breach), CPA (financial), Cloudflare account manager (DDoS).

## Status page

`status.seizn.com` powered by `better-uptime` free tier (post-launch upgrade to paid for incident timelines). Components monitored:

- `seizn.com` landing — HTTP 200 every 1 min.
- `dashboard.seizn.com` — HTTP 200 every 1 min (with signed health-check key to avoid auth wall).
- `errors.seizn.com` (GlitchTip) — TLS + 200.
- `analytics.seizn.com` (Plausible) — TLS + 200.
- Stripe webhook ingest endpoint — HEAD 200.

Incident severity rolls up automatically into status page banner. Manual override for P0 communications.

## Test plan (table-top exercise)

Run a quarterly tabletop where someone simulates each scenario in dev/staging and the on-call walks through this runbook end-to-end. Track time-to-acknowledge and time-to-mitigate; if either exceeds the SLA in the table, refine the runbook.

## Pending tasks

- [ ] Provision better-uptime account + status.seizn.com DNS (Cloudflare CNAME).
- [ ] Author `legal/breach-templates/pipa-72h.md` (Korean) + `gdpr-72h.md` (English).
- [ ] Author `scripts/gdpr-erasure-sweep.ts` — sweep PostHog `delete_person` API + GlitchTip user-events purge.
- [ ] Schedule first tabletop exercise (pin to launch + 30 days).
