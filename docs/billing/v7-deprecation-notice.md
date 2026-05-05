# v7 → v8 deprecation notice templates (Track 2 only)

These templates are sent **only** to Track 2 (API + MCP, USD) subscribers who are currently paying on a v7 price. Track 1 (Web, KRW) and Track 3 (Tauri, KRW) subscribers are out of scope — those cycles run their own deprecation if needed.

**Grandfather window:** 90 days from the day the announcement email is sent. Subscribers who do not act within 90 days are automatically moved to the v8 Free tier at their next renewal date.

Replace `{{first_name}}`, `{{tier_v7_label}}`, `{{tier_v7_usd}}`, `{{tier_v8_label}}`, `{{tier_v8_usd}}`, `{{cutoff_date}}`, and `{{billing_portal_url}}` before sending. Keep the From address consistent with prior billing mail (`billing@seizn.com`).

---

## English (en) — Day 0 announcement

**Subject:** Seizn API plans are moving to v8 — your current pricing is locked through {{cutoff_date}}

Hi {{first_name}},

We're updating the Seizn API + MCP plans on **{{announcement_date}}**. Your current **{{tier_v7_label}}** subscription at **${{tier_v7_usd}}/mo** will keep working — and keep its current price — for **90 days**, through **{{cutoff_date}}**.

**What's changing in v8**

- New tier names and pricing for Track 2 (API + MCP):
  - Indie $9 · Pro $19 · Studio $99 · Studio Managed $299 · Enterprise (contact)
- Studio Managed introduces metered Opus calls at $0.15 each (no BYOK required).
- Higher per-minute rate limits at every tier and a new `audit:read` scope on Studio.

**What you need to do**

- **Nothing, if you want to keep your current plan and price** — your v7 subscription stays active and billed at ${{tier_v7_usd}}/mo until {{cutoff_date}}.
- **Migrate any time** at {{billing_portal_url}} to switch to a v8 plan immediately. Pro-rated refunds apply for the remaining v7 cycle.
- **After {{cutoff_date}}**: subscriptions still on v7 will move to the v8 **Free** tier (100 calls/day, 30 req/min) automatically at the next renewal. We'll notify you 30 days and 7 days before that happens.

We'll send one reminder at Day 60 and another at Day 83. If you have questions, reply to this email or reach us at support@seizn.com.

Thanks for building with Seizn.
— The Seizn team

---

## English (en) — Day 60 reminder

**Subject:** Reminder: your Seizn v7 plan migrates on {{cutoff_date}}

Hi {{first_name}},

This is a 30-day reminder that your **{{tier_v7_label}}** plan at ${{tier_v7_usd}}/mo will move to the v8 **Free** tier on **{{cutoff_date}}** unless you migrate first.

The closest v8 equivalent for your usage is **{{tier_v8_label}}** at **${{tier_v8_usd}}/mo**. You can switch in one click at {{billing_portal_url}}.

If you want to stay on Free that's fine too — no action needed.

— The Seizn team

---

## English (en) — Day 83 final notice

**Subject:** Final notice: your Seizn plan changes in 7 days

Hi {{first_name}},

In 7 days (on **{{cutoff_date}}**) your v7 **{{tier_v7_label}}** plan will be replaced with the v8 **Free** tier at your next renewal. After that, your API key quota will be 100 calls/day and 30 requests/minute.

To keep paid limits, switch to a v8 plan at {{billing_portal_url}} before {{cutoff_date}}.

— The Seizn team

---

## 한국어 (ko) — Day 0 announcement

**제목:** Seizn API 요금제가 v8로 변경됩니다 — 기존 가격은 {{cutoff_date}}까지 유지됩니다

{{first_name}}님,

**{{announcement_date}}**부터 Seizn API + MCP 요금제(Track 2)가 v8로 갱신됩니다. 현재 사용 중이신 **{{tier_v7_label}}** 플랜(${{tier_v7_usd}}/월)은 **{{cutoff_date}}**까지 **90일 동안** 동일한 가격으로 그대로 유지됩니다.

**v8에서 달라지는 점**

- Track 2(API + MCP) 가격이 USD 기준으로 정리됩니다.
  - Indie $9 · Pro $19 · Studio $99 · Studio Managed $299 · Enterprise(문의)
- Studio Managed는 BYOK 없이 Opus 호출을 $0.15/회의 사용량 기반(metered) 과금으로 사용할 수 있습니다.
- 모든 등급의 분당 호출 한도가 상향되고, Studio부터 `audit:read` 스코프가 제공됩니다.

**필요한 조치**

- **기존 가격을 유지하시려면 별도 작업이 필요 없습니다.** v7 구독은 {{cutoff_date}}까지 ${{tier_v7_usd}}/월로 그대로 청구됩니다.
- **언제든 즉시 v8로 이전**하실 수 있습니다: {{billing_portal_url}}에서 가능하며, 잔여 v7 결제 주기는 일할 환불됩니다.
- **{{cutoff_date}}부터**: v7에 그대로 있는 구독은 갱신 시점에 v8 **Free** 플랜(일 100회 · 분당 30회)으로 자동 전환됩니다. 30일 전과 7일 전에 다시 안내해 드립니다.

문의는 본 메일 회신 또는 support@seizn.com으로 부탁드립니다. 함께해 주셔서 감사합니다.

— Seizn 팀 드림

---

## 한국어 (ko) — Day 60 reminder

**제목:** 안내: {{cutoff_date}}에 v7 플랜이 v8 Free로 자동 전환됩니다

{{first_name}}님,

현재 **{{tier_v7_label}}**(${{tier_v7_usd}}/월) 플랜은 **{{cutoff_date}}**의 갱신 시점에 v8 **Free**로 자동 전환됩니다.

사용 패턴에 가장 가까운 v8 플랜은 **{{tier_v8_label}}**(${{tier_v8_usd}}/월)이며, {{billing_portal_url}}에서 즉시 전환 가능합니다. Free로 가셔도 전혀 문제 없습니다 — 별도 작업 없이 그대로 두시면 됩니다.

— Seizn 팀

---

## 한국어 (ko) — Day 83 final notice

**제목:** 마지막 안내: {{cutoff_date}}에 플랜이 변경됩니다

{{first_name}}님,

**{{cutoff_date}}**에 v7 **{{tier_v7_label}}** 플랜이 v8 **Free**로 자동 전환됩니다. 전환 후에는 일 100회 · 분당 30회 한도가 적용됩니다.

유료 한도를 그대로 사용하시려면 {{cutoff_date}} 이전에 {{billing_portal_url}}에서 v8 플랜으로 변경해 주세요.

— Seizn 팀

---

## Send schedule (operations)

| Day | Action | Audience |
|---|---|---|
| 0 | Send Day 0 announcement | All current Track 2 v7 subscribers |
| 60 | Send Day 60 reminder | Subscribers still on v7 |
| 83 | Send Day 83 final notice | Subscribers still on v7 |
| 90 | Stripe archive v7 Track 2 prices, downgrade remaining subs to Free at next renewal | (automated) |

The 90-day cutoff is configurable via `V8_GRANDFATHER_DAYS` in `src/lib/billing/v8-products.ts`. `v8Track2GrandfatherCutoffIso(announcementIso)` returns the canonical `{{cutoff_date}}` string.
