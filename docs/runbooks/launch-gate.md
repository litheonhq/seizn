# Founding Member Launch Gate (Wave 2)

> One-page sign-off checklist. Every box must be checked before announcing
> founding-member onboarding to the public Discord, Twitter, or any external
> channel. Items in **bold** are non-negotiable; the rest are strong defaults.

## Code

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run check:i18n-coverage` exits 0
- [ ] `npm run check:a11y-static` exits 0 (or baseline-acknowledged)
- [ ] `npm run check:knot-isolation` exits 0 — **non-negotiable, KNOT leakage blocks launch**
- [ ] `npm run test:run` exits 0
- [ ] `npm run analyze:budget` exits 0 (per-route JS < 200KB gzip)
- [ ] Production build (`npm run build`) succeeds with no warnings
- [ ] `npm run smoke:production` against staging passes

## Database (Litheon Supabase)

- [ ] Migration `20260509001_w3_pricing_redesign.sql` applied — verified by `track`, `email_verified_at`, `desktop_waitlist`, `ai_transparency_events` tables present
- [ ] Migration `20260509002_resend_webhook_events.sql` applied — verified by `resend_webhook_events`, `email_suppression_list` tables present
- [ ] RLS policies intact: spot-check `desktop_waitlist`, `ai_transparency_events`, `resend_webhook_events` are service_role-only

## Stripe (Litheon LLC live account)

- [x] 24 v9 product + 41 v9 price created (W3.5 dry-run + execute, 2026-05-09)
- [ ] Test charge on test mode against new SKUs (Indie monthly Charter $29 actual flow)
- [ ] Customer Portal URL published in dashboard Settings
- [ ] Webhook endpoint configured: `https://www.seizn.com/api/webhooks/stripe`
- [ ] `STRIPE_WEBHOOK_SECRET` matches Litheon webhook (NOT iruhana25)
- [ ] Stripe Tax enabled — verified in test checkout Tax line shows
- [ ] Old v7 SKUs archived (or kept active during migration window — confirm with founder)

## Email (Resend)

- [ ] Resend account active for Litheon LLC payment method
- [ ] Domain `seizn.com` verified — DKIM, SPF, DMARC PASS at mail-tester.com (≥9/10)
- [ ] `noreply@seizn.com` from-address verified
- [ ] Webhook configured: `https://www.seizn.com/api/webhooks/resend`
- [ ] `RESEND_API_KEY` + `RESEND_WEBHOOK_SECRET` set in Vercel prod env
- [ ] Test email through each template (signup-confirm, payment-receipt, waitlist-confirm, password-reset, founding-member-relaunch) — manual

## Observability (GlitchTip + Plausible self-hosted)

- [x] GlitchTip live at https://errors.seizn.com (W5.5 deploy 2026-05-08)
- [x] Plausible live at https://analytics.seizn.com (W5.5b deploy 2026-05-08)
- [x] Daily R2 backup cron registered (W5.5)
- [ ] Sentry SDK env wired: `NEXT_PUBLIC_SENTRY_DSN` in Vercel prod env
- [ ] First test event captured by GlitchTip from production
- [ ] 7 alerts configured per [glitchtip-alerts.md](./glitchtip-alerts.md) — Slack #oncall webhook delivers
- [ ] Plausible JS snippet on landing — first prod pageview captured
- [ ] GlitchTip admin 2FA enabled, recovery codes in vault

## Legal

- [ ] Lawyer review of `/legal/terms`, `/legal/privacy`, `/legal/refund`, `/legal/subprocessors`, `/legal/ai-disclosure` complete
- [ ] Privacy policy version stamped + dated (last_updated bump on each material change)
- [ ] Cookie banner appears on first visit, dismissable, persists choice
- [ ] Sub-processor list reflects actual production deps (no stale entries)
- [ ] EU AI Act Article 50 disclosure live (transition deadline 2026-08-02)
- [ ] DPA template ready for Studio Managed / Enterprise customers

## Performance / SEO

- [ ] `lighthouserc.json` budgets pass on all 6 monitored URLs in mobile preset
- [ ] Sitemap.xml fetches at https://www.seizn.com/sitemap.xml with new legal routes included
- [ ] robots.txt allows crawling of public surfaces, blocks `/dashboard/*`, `/api/*`
- [ ] Google Search Console verified for seizn.com, sitemap submitted
- [ ] Structured data (Organization + SoftwareApplication + WebSite) validates at validator.schema.org

## Founding member communication

- [ ] Founding member email list exported from Supabase (where `users.role = 'founding'`)
- [ ] Re-consent email (`foundingMemberRelaunchEmail`) drafted, reviewed, scheduled
- [ ] Discord `#announcements` post drafted (KO + EN)
- [ ] Re-consent dashboard surface live at /dashboard/legal/reconsent

## Security posture

- [ ] Semgrep CI green (W6.1) — no `error` severity findings outstanding
- [ ] Trivy CI green — no critical CVEs outstanding (`fixed-only` filter applied)
- [ ] Dependabot up to date — no open critical PRs older than 7 days
- [ ] Pen test scope spec (W6.2) sent to vendor; engagement scheduled
- [ ] Trust Center page (`/trust`) lists current security stance + sub-processors

## Operations

- [ ] Status page `status.seizn.com` live with components monitored
- [ ] Incident runbook (W5.8) reviewed by oncall (founder)
- [ ] Slack `#oncall` webhook delivers test message
- [ ] On-call schedule documented (solo founder + AI assist for now; rotation post-Series A)
- [ ] Backup restore tested at least once (manual: drop a row in test, restore from R2)

## Cost guardrails

- [ ] LLM pre-flight cap (W5.7) wired into all canon-touching endpoints
- [ ] Anthropic prompt caching active on stable system prompts (canon ingest)
- [ ] Per-tier USD cap enforced: free=$0, indie=$40, pro=$200, studio=$800
- [ ] Stripe → PostHog conversion event firing on first charge (validates funnel)

## Post-launch monitoring (first 14 days)

- [ ] Daily check-in on GlitchTip alert volume — tune noisy alerts
- [ ] Daily check-in on Stripe checkout funnel (Plausible goal events)
- [ ] Weekly check-in on Trust Center pageviews + sub-processor objection submissions
- [ ] Day 14 retro: what fired, what didn't, runbook updates

---

## Hard launch blockers (these MUST be ✅, no exceptions)

1. **`npm run check:knot-isolation` exits 0** — KNOT leakage = launch delay until fixed.
2. **Migrations applied** to Litheon Supabase (W3.0 + W2.5 webhook events).
3. **Stripe SKUs created** + webhook endpoint configured + Tax enabled.
4. **Resend domain verified** — without this, all transactional email fails at first send.
5. **Lawyer review of legal pages** — without this, ToS/Privacy is "draft" and doesn't bind users.
6. **GlitchTip 2FA on admin + IP allowlist on `/admin/*`, `/login/*`** — minimum auth posture.
7. **EU AI Act Article 50 disclosure live** — deadline 2026-08-02, fail = regulatory exposure for EU users.

If any of these is unchecked at announce time, push the announcement back. The cost of waiting 1 week >> the cost of a launch that breaks compliance.
