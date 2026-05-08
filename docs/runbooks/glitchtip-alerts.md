# GlitchTip Alert Configuration (W5.5 / Wave 2)

> Runbook target: 7 alerts on Slack `#oncall`, configured in GlitchTip web UI at `https://errors.seizn.com/<project>/settings/alerts/`.
>
> Last updated: 2026-05-09 (W5.5 alert spec lock).

## Prerequisites

1. GlitchTip self-hosted at `https://errors.seizn.com` (W5.5 deploy 2026-05-08, see memory `seizn-hetzner-observability-2026-05-08.md`).
2. Slack incoming webhook URL for `#oncall` channel — set as `SLACK_ONCALL_WEBHOOK_URL` in vault.
3. Sentry SDK configured at `sentry.{client,server,edge}.config.ts` with DSN `https://<key>@errors.seizn.com/<project>`.

## Alert spec

Each alert is conditioned on a Sentry-style query (matching `event.tags`, `event.message`, or PostgreSQL-backed metric counts). GlitchTip evaluates every minute by default.

### 1. payment_failure_rate_spike

| Field | Value |
|---|---|
| Trigger | `payment_intent.failed` event count > 5% of `payment_intent.*` events in 5 min window |
| Severity | P1 |
| Channel | Slack `#oncall` |
| Filter | `tags.kind:stripe.webhook AND tags.event_type:payment_intent.*` |
| Threshold | event_failed_count / event_total > 0.05 over 5 min |

### 2. auth_5xx_spike

| Field | Value |
|---|---|
| Trigger | NextAuth route returns 5xx ≥50 times within 1 min |
| Severity | P1 |
| Filter | `tags.route:/api/auth/* AND tags.status:5xx` |
| Threshold | count > 50 / 1 min |

### 3. rls_deny_spike

| Field | Value |
|---|---|
| Trigger | Supabase RLS denies ≥30 / min — likely permission bug or attack |
| Severity | P2 |
| Filter | `message:"new row violates row-level security policy" OR message:"permission denied"` |
| Threshold | count > 30 / 1 min |

### 4. stripe_webhook_failure

| Field | Value |
|---|---|
| Trigger | Same `event_id` fails ≥5 times OR ≥30 webhook failures / 1 hour |
| Severity | P1 |
| Filter | `tags.route:/api/webhooks/stripe AND level:error` |
| Threshold | (per-event_id failures ≥ 5) OR (total failures ≥ 30 / 1 hour) |

### 5. settings_partial_load

| Field | Value |
|---|---|
| Trigger | ≥10% of users hit at least one settings endpoint failure in 5 min |
| Severity | P3 |
| Filter | `tags.route:/api/settings/* AND tags.status:5xx` |
| Threshold | distinct user_id count / DAU > 0.1 over 5 min |

### 6. web_vitals_threshold

| Field | Value |
|---|---|
| Trigger | p75 LCP > 2.5s OR p75 CLS > 0.1 over 5 min |
| Severity | P2 |
| Filter | `event.measurements.lcp` / `event.measurements.cls` |
| Threshold | percentile(75) lcp > 2500ms OR cls > 0.1 |

### 7. supabase_connection_failure

| Field | Value |
|---|---|
| Trigger | DB query timeout / connection refused ≥5 / min |
| Severity | P1 |
| Filter | `message:"connection refused" OR message:"query timeout" OR message:"PGRST"` |
| Threshold | count > 5 / 1 min |

## Manual configuration steps

GlitchTip's alert API is admin-token gated; for now, configure in web UI:

1. Login to `https://errors.seizn.com` as admin.
2. Navigate to **Project → Settings → Alerts**.
3. For each alert above:
   1. Click **New Alert Rule**.
   2. Set name, description, severity tag.
   3. Set trigger type = **Issue Frequency** (or **Metric Threshold** for #5/#6).
   4. Set filter (Sentry-syntax search query from the table).
   5. Set threshold + window.
   6. Add **Slack action** with webhook URL from vault `SLACK_ONCALL_WEBHOOK_URL`.
4. Save and trigger a test event from Sentry SDK (`Sentry.captureException(new Error('test'))`) to verify Slack delivery.

## Source map upload (W5.5)

Vercel build hook calls `sentry-cli` after build:

```bash
SENTRY_AUTH_TOKEN=<glitchtip-internal-token> \
SENTRY_URL=https://errors.seizn.com \
SENTRY_ORG=seizn \
SENTRY_PROJECT=seizn-web \
sentry-cli releases new $VERCEL_GIT_COMMIT_SHA
sentry-cli releases files $VERCEL_GIT_COMMIT_SHA upload-sourcemaps .next --rewrite
sentry-cli releases finalize $VERCEL_GIT_COMMIT_SHA
```

This step is wired into `next.config.ts` via `withSentryConfig` once `SENTRY_AUTH_TOKEN` is provisioned.

## Verification checklist (after configuring 7 alerts)

- [ ] Trigger fake `payment_intent.failed` 6 times → alert #1 fires within 5 min
- [ ] Trigger 50× 500 from `/api/auth/test-fail` → alert #2 fires within 1 min
- [ ] Trigger 30× RLS deny → alert #3 fires
- [ ] Replay same Stripe webhook event_id 5×500 → alert #4 fires
- [ ] Slack #oncall receives 4 distinct messages with severity tags
- [ ] All alerts have correct `severity` and `runbook_url` populated

## Pending hand-off (sysadmin)

- Provision `SENTRY_AUTH_TOKEN` in GlitchTip admin → user → API tokens
- Add `SENTRY_AUTH_TOKEN` to Vercel env (production scope)
- Configure 7 alerts in web UI per spec above
- Run verification checklist
