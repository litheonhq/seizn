# Brief: Extend the Author-first redesign to the remaining `/dashboard/*` surfaces

**For:** Claude Design (claude.ai/design) → Claude Code handoff
**Author:** Track 2 owner cycle (this is the brief; execution is a separate Track 1 cycle)
**Date:** 2026-05-06
**Status:** ready for the user to paste into a Claude Design session and onboard the codebase

---

## 0. Why this brief exists

Three months of dashboard work have left the product visually bisected:

- **Author surface** (`/dashboard/author/*`, `/dashboard/memories/*`) — already redesigned to a warm, paper-toned, serif-led system in PR #246–#251 (the "Author-first" rebrand). Source of truth: `docs/design/dashboard-redesign-source/` (an earlier Claude Design handoff bundle) + `docs/design/seizn-author-ui-rebrand-spec.md`.
- **Account / Billing / Usage / Settings / Replay / Import / Keys** — still developer-tone: dense gray text, snake_case-flavoured labels, no empty states, mismatched typography. They feel like a different product when you click out of the writing surfaces.
- **Track 2 (`/dashboard/account/api-keys` + audit)** just shipped (PR #252) using the Author-first tokens but with a single-purpose layout (modal-driven, table-row-style listing). It works but doesn't carry the cream/serif tone forward into a full surface.

This brief asks Claude Design to **extend the Author-first tokens and mood across the remaining surfaces** so the whole dashboard reads as one product. The ask is *cohesion*, not a third rebrand.

---

## 1. Product context (paste into Claude Design as initial system context)

**Seizn** is an AI memory platform aimed at fiction writers. Three-track architecture:

- **Track 1 — Web (KRW)**: the dashboard you're remodelling now. Korean primary user, then EN/JA/ZH/ES.
- **Track 2 — API + MCP (USD)**: REST + Claude Desktop / Cursor / Cline integration. *Just launched.*
- **Track 3 — Tauri desktop (KRW)**: separate cycle.

Three-channel pricing collapses on a single Stripe customer with separate subscriptions. The dashboard is mainly Track 1 (web KRW) but exposes shared cross-track surfaces (account, billing, usage, API keys).

Brand voice: **"Seize your memories"**. Warm, writerly, slightly literary. Not corporate-SaaS, not cyberpunk-AI, not Linear-clone.

Primary persona: **a Korean serial-fiction writer** managing a 30-chapter web novel with hundreds of named entities. Secondary: **API developers** plugging Seizn into their own tools (Track 2 audience).

---

## 2. Design system — already locked, treat as source of truth

`docs/design/dashboard-redesign-source/tokens.css` is the canonical token file. **Do not invent new tokens.** The remodelled surfaces must consume this exact set:

### Palette (warm paper)

```
--ink-0   #ffffff   — pure white
--ink-25  #fbf8f2   — paper highlight (app bg)
--ink-50  #f5f0e6   — warm cream / sidebar bg
--ink-75  #ece5d5   — cream border
--ink-100 #ddd3bd
--ink-200 #bfb39a
--ink-300 #948872
--ink-400 #6f6655
--ink-500 #4a4338   — mid-warm gray
--ink-700 #2c2820
--ink-900 #1a1612   — rich ink black

--terracotta-50  #fbeee6
--terracotta-100 #f4d6c2
--terracotta-300 #d99877
--terracotta-500 #c96442   — warm signal / primary CTA
--terracotta-600 #a94e2f
--terracotta-700 #8a3d22

--dawn-50  #fdf3da
--dawn-200 #f5dca5
--dawn-500 #d9a847   — sunrise highlight
--dawn-700 #8a6818
```

### Semantic mapping

```
--bg-app        = ink-25     paper-tone canvas
--bg-sidebar    = ink-50     warm cream
--bg-elevated   = ink-0      cards, modals
--bg-muted      = ink-50     subtle fills
--border-subtle = rgba(ink-500, 0.10)
--border-strong = rgba(ink-500, 0.20)
--text-primary  = ink-900
--text-secondary= ink-500
--accent        = terracotta-500   ← every primary CTA, active sidebar pill
--highlight     = dawn-500          ← occasional, for "just-happened" toasts
```

### Typography

```
Body  : Pretendard Variable (300/400/500/600)        — Korean-first, falls back gracefully on Latin
Serif : Newsreader (400/500/600 + italic)            — h1/h2/section headings; small caps optional via font-feature-settings
Mono  : JetBrains Mono (400/500)                     — code, IDs, prefixes
```

The serif is the personality carrier. Page titles, dialog titles, hero text — all Newsreader. Body / table / button text stays Pretendard.

### Spacing

8 / 12 / 16 / 24 / 32 / 48 px. No fractional. No 14 / 18 / 20.

### Radius

`--radius-sm: 6px` (chips, badges) / `--radius-md: 10px` (cards, inputs) / `--radius-lg: 16px` (modals, hero panels).

### Shadows

Light only. Heavy shadows read as Material; we don't want Material.

```
--shadow-card    = 0 1px 0 rgba(74,67,56,0.06), 0 1px 3px rgba(74,67,56,0.04)
--shadow-modal   = 0 8px 32px rgba(74,67,56,0.18)
```

---

## 3. Surfaces in scope — what to remodel

### 3a. Top-priority remodel (the visual gap)

| Route | Today | What's broken | Volume |
|---|---|---|---|
| `/dashboard` (root) | landing | bare grid of links, no hierarchy | every login lands here |
| `/dashboard/account/privacy` | dev-tone | gray-on-gray DSR / consent UI | rare but legally important |
| `/dashboard/billing` | dev-tone | Stripe portal links + plan grid | every paying user touches this |
| `/dashboard/usage` | dev-tone | quota bars + historical chart | check before upgrade |
| `/dashboard/settings` | dev-tone | toggle list | once per onboarding |
| `/dashboard/replay` | dev-tone | trace search + table | engineering-flavour, but writers debug here too |
| `/dashboard/replay/[traceId]` | dev-tone | JSON tree + timeline | drill-down |
| `/dashboard/import` | dev-tone | file upload + preview | first-day onboarding |
| `/dashboard/keys` | dev-tone | **legacy v1 NPC keys**, separate from Track 2 keys | legacy |
| `/[locale]/dashboard/control-tower` | partially redesigned | ops view | rare |
| `/[locale]/dashboard/control-tower/alerts` | dev-tone | notification list | rare |
| `/[locale]/dashboard/control-tower/budget` | dev-tone | spend forecast | rare |
| `/[locale]/dashboard/personas` | dev-tone | persona configurator | sometimes |

### 3b. Already redesigned — don't touch

- `/dashboard/author` and every `/dashboard/author/*` subroute — **canonical Author-first surface**, the look the rest should match
- `/dashboard/memories/*` (beliefs / branches / budget / candidates / decay / mindmap / provenance) — same redesigned system

### 3c. Just shipped (PR #252) — visual smoke-test only

- `/dashboard/account/api-keys` and `/dashboard/account/api-keys/audit` (Track 2). Built on Author-first tokens but the layout is single-purpose. **Read it; if the new account/billing/usage style breaks visual consistency with this page, the new style is wrong.** Don't rewrite this page.

### 3d. Out of scope — archive separately

`src/app/(dashboard)/dashboard/legacy/*` carries 23 routes (autopilot / canon / chaos / compliance / devtools / enterprise / evals / federated / governance / integrations / moderation / npcs / organizations / playground / policy-marketplace / post-mortem / reports / reranker / security / story-health / traces / webhooks). Many predate the Author pivot. Treat them as out-of-scope archive material — don't include in nav, don't restyle. Cleanup is its own cycle.

---

## 4. The visual goal in one paragraph

The rest of the dashboard should feel like reading a quiet writing magazine on cream paper, with terracotta for the things you can do and a single Newsreader headline anchoring each page. Tables are airy (24px row height minimum, row separators at `border-subtle`, no zebra striping). Empty states are generous: a serif headline, one sentence in `text-secondary`, one terracotta button. Chips and pills are 6px radius, never the full pill shape — that reads as marketing. Modals are large (560–720px), not centered tiny dialogs — Author writers fill them with prose. Sidebar is the warm cream the Author surface already uses; selected item is terracotta-500 fill at 8% alpha with a 2px terracotta-500 left rule.

If a screen looks like Linear, it's wrong. If it looks like a writing notebook, it's right.

---

## 5. Page-by-page intent (first-pass; refine in the canvas)

### `/dashboard` (root landing)

Today: a generic grid of nav cards.

Aim: a *hub*, not a launcher. Three zones, vertical:

1. **Hero strip** — Newsreader h1 with the user's project name; a dawn-500 underline hint; below it a quiet sentence ("12 chapters drafted • last edit 3 hours ago"). On the right, one terracotta primary button: "Open writing surface" → `/dashboard/author`.
2. **Status row** — three small ink-200 cards, each a single signal: "API key health", "Memory v3 sync", "This month's quota". Each card is one number + one verb-link in terracotta-700 underline.
3. **Recent activity** — a table of the last ~10 events (chapter imported, conflict resolved, key rotated). Time on the right in dim ink-400. Click a row → drill into that surface.

No more nav grid. The sidebar is the nav.

### `/dashboard/billing`

Plan picker + invoice history + payment method.

- Plan picker: 4 ink-0 cards in a row (Free / Indie / Pro / Studio / Studio Managed — Studio Managed gets a dawn-50 background to mark "managed"). Current plan has a terracotta-500 left rule and a "Current" pill in terracotta-50.
- "Manage in Stripe" — one terracotta-500 button, no embedded portal.
- Invoice history below — Pretendard table, no zebra. Newsreader 28px section heading.
- v8 / v7 grandfather state — a single dawn-50 callout if the user is grandfathered, with a 1-sentence Newsreader explanation and the cutoff date.

### `/dashboard/usage`

- Hero: this month's used / quota in Newsreader 64px ("7,231 / 10,000"), small caps "calls this month". Below it, a quiet horizontal bar: ink-100 track, terracotta-500 fill, terracotta-600 over-budget zone.
- Below the hero, a per-tool table (recall / check / timeline / graph / projects / approve). Each row: tool name (Pretendard 500), call count, cost units, last used (relative time). No charts on this page — keep it scannable.
- "Upgrade" terracotta button is sticky bottom-right when the user passes 80% of quota.

### `/dashboard/settings`

A vertical list of grouped sections, each section: Newsreader 28px heading, Pretendard 14px description, then the controls. No tabs. A real writer has 6–8 settings; tabs would feel bureaucratic.

Sections: **Profile** (display name, avatar) → **Locale** (language + timezone) → **Notifications** (email categories) → **Workspace** (default project, eviction policy) → **Danger zone** (delete account — terracotta-700 outline button, full-page confirmation).

### `/dashboard/replay`

Engineering-flavoured but writers use it too (debugging "why did Seizn return X?"). Two-pane:

- Left: trace list, narrow column. Each trace = chapter id + tool + duration + status pill. Selected gets terracotta-500 left rule.
- Right: trace detail. Newsreader heading "Trace `req_abc123`". Below, a vertical timeline: each step is a small ink-0 card with the tool name, latency, and a "View JSON" affordance (modal, JetBrains Mono).

### `/dashboard/replay/[traceId]`

Standalone full-page version of the right pane. Same component, full-width.

### `/dashboard/import`

First-day onboarding. Should feel inviting, not like a file uploader.

- Hero: Newsreader 36px "Bring your manuscript in". Below: a 3-step list (upload → preview → confirm).
- Drop zone: dashed `--border-strong` rectangle, ink-50 background, 240px tall. On hover, terracotta-300 dashed border.
- Preview: extracted entities + chapters in two columns. User can correct names inline (Pretendard contenteditable cells).
- Confirm button: terracotta-500, full-width on mobile.

### `/dashboard/account/privacy`

Legal-flavoured. DSR (data subject request) form + consent toggles + export-my-data.

- Newsreader heading with a single sentence of plain Korean explanation (no legalese on the surface).
- Three actions as ink-0 cards: "Export my data" / "Delete my data" / "Stop training on my data". Each card 1 sentence + 1 button. Click → modal with the actual legal terms.

### `/[locale]/dashboard/control-tower` (and `alerts`, `budget` subroutes)

Ops view for power users. Should *not* be cream-soft — this is one place where terracotta and dawn earn their keep. Slightly denser, but same tokens. Same sidebar.

- Control-tower root: 6-card grid of system-level signals (uptime / queue depth / token spend / active users / failed jobs / model latency).
- Alerts: list of alerts with severity pills (P1 terracotta-500, P2 dawn-500, P3 ink-300).
- Budget: forecast chart (sparkline in terracotta-500) + threshold sliders.

### `/[locale]/dashboard/personas`

Persona configuration UI for multi-tenant Studio users. Same layout patterns as billing — card-list with one selected.

---

## 6. Components — keep, refresh, replace

Source: `src/components/dashboard/redesign/`.

### Keep as-is (they're already in the target style)

- `workspace-shell.tsx` — overall app shell with sidebar + topbar
- `sidebar/*` — already cream + terracotta active state
- `top-bar.tsx` — already minimal
- `atoms.tsx` (Button / Pill / Card primitives) — extend, don't replace
- `empty-state.tsx`
- `skeletons.tsx`
- `icons.tsx`

### Refresh (extend with new variants but keep the API)

- `Button` — add `variant="ghost"` (no fill, terracotta-700 text on hover) and `variant="danger"` (terracotta-700 outline, terracotta-50 hover bg)
- `Card` — add `tone="dawn"` (dawn-50 bg, dawn-200 border) for "just happened" callouts, and `tone="legal"` (ink-25 bg, ink-200 border) for privacy / legal pages
- `Pill` — sizes `sm` (current default) and `xs` (10px font) for inline severity tags

### Replace / build new

- `BillingPlanCard` — new, used by `/dashboard/billing`. Props: name, monthlyUsd, yearlyUsd, scopes (string[]), isCurrent, isGrandfathered, ctaLabel, ctaHref.
- `UsageMeter` — hero quota meter for `/dashboard/usage`. Props: used, quota, period ('day'|'month'), warningAt (default 80).
- `TraceTimeline` — vertical timeline for `/dashboard/replay/[traceId]`. Each step a Card with monospace metadata.
- `EntityImportPreview` — two-column previewer for `/dashboard/import`. Editable cells.
- `ConsentCard` — single action card for `/dashboard/account/privacy`. Props: title, body, ctaLabel, danger (boolean).

All new components live in `src/components/dashboard/redesign/`. Don't introduce a parallel folder.

---

## 7. Constraints — non-negotiable

1. **Don't introduce new dependencies.** We already have Tailwind, Pretendard, Newsreader, JetBrains Mono, lucide-react, recharts. No shadcn migration. No Radix swap. No styled-components.
2. **Server components by default.** Client components only where you actually need interactivity (forms, modals, hover state with dynamic data). This is a Next.js 15 App Router codebase.
3. **No `useEffect` + `setState` for data fetching.** Server components fetch; client components receive props and use `useReducer` or `useTransition` for local state. PR #252 has the pattern.
4. **i18n on every user-visible string.** 22 locales already supported; `useDashboardTranslation()` hook from `src/contexts/DashboardLocaleContext`. Add new keys under `dashboard.<surface>.*` in all 5 base dictionaries (en/ko/ja/zh-hans/zh-hant) — fallback locales follow in a separate cycle.
5. **Locale-aware layout** — Korean text is the primary length budget. EN expands ~1.3×, AR/HE flow RTL, JA/ZH compress ~0.8×. Test ko + en + ar in the canvas.
6. **Bundle budget**: each new client component adds to the chunk. Total JS/CSS budget is currently 8000 KB raw / 2400 KB gzip. Don't import heavy charting libs into client components — use SSR for charts where possible (`recharts` SSR works with `next/dynamic`).
7. **Accessibility**: every interactive element needs a label, every modal needs `aria-labelledby`, focus traps, escape-to-close. Existing components honour this; new ones must too.
8. **Don't redesign Track 2 surfaces.** `/dashboard/account/api-keys` + audit just shipped and are in production. Read them, match their visual register, don't refactor them.

---

## 8. Tech stack (paste into Claude Design's "link your codebase" step)

- **Framework**: Next.js 15 App Router (Turbopack dev, Webpack prod), TypeScript strict
- **Style**: Tailwind v4 (`@tailwindcss/postcss`), tokens in `src/app/globals.css` + `docs/design/dashboard-redesign-source/tokens.css`
- **Auth**: NextAuth.js v5
- **DB**: Supabase (Postgres + RLS); server actions via `@/lib/supabase` `createServerClient()`
- **i18n**: hand-rolled dictionaries in `src/i18n/dictionaries/*.json`, hook `useDashboardTranslation()`
- **Charts**: recharts (already used elsewhere)
- **Icons**: lucide-react
- **Test**: vitest (unit) + Playwright (e2e auth / smoke)
- **Repo**: `litheonhq/seizn` on GitHub. Onboarding scope: `src/app/(dashboard)`, `src/components/dashboard/redesign`, `src/i18n/dictionaries`, `docs/design`. **Do not link the whole repo** — the legacy `/dashboard/legacy/*` tree confuses the design system extractor.

---

## 9. Handoff format — what we want back from Claude Design

When the canvas is ready, package as:

1. One HTML/CSS/JS prototype per surface (one file per page in section 3a).
2. A `chats/` folder with the conversation transcripts (Claude Design exports these by default).
3. A `tokens.css` confirmation that the prototypes use **only** the tokens from §2 — flag any case where you needed to invent a value.
4. A `MIGRATION.md` per surface with: which existing component is being replaced, which components from §6 are reused, which new components from §6 need to land before this page works.

Drop the bundle into `docs/design/dashboard-remodel-2026-05/`. Then trigger Claude Code with:

```
Implement the dashboard remodel handoff at docs/design/dashboard-remodel-2026-05/.
Read SOURCE_README.md first, then each surface's MIGRATION.md.
Skip /dashboard/author/* and /dashboard/memories/* and /dashboard/account/api-keys* — those are out of scope.
```

Claude Code will translate the HTML/CSS to React server / client components in the existing codebase structure, lift styles into Tailwind classes that map to the existing tokens, and add i18n keys.

---

## 10. Anti-goals

- Don't rebuild the Author surface "while you're at it". It's the reference.
- Don't introduce dark mode. We tried; warm cream + dark is jarring. Light only.
- Don't add a marketing-style hero on logged-in pages.
- Don't use full-pill button radius (`rounded-full`). Pretendard reads as Material on full pill. Stick to 6 / 10 / 16.
- Don't switch to a sans serif for headings. The serif is the brand.
- Don't re-platform charts. Recharts only.
- Don't add a notification center / inbox UI. Notifications go in the user's email.

---

## 11. Success criteria

- A user landing on `/dashboard` after the remodel cannot tell whether the surface was made before or after the Author rebrand — visual cohesion is the whole point.
- A user clicking from `/dashboard/author` → `/dashboard/billing` should not feel a tonal shift. Same cream, same serif, same terracotta.
- Every surface in §3a has an empty state, a loading state, and a happy-path screenshot exported from Claude Design.
- Bundle budget stays under 8000 KB raw / 2400 KB gzip. If it doesn't, dynamic-import the heaviest client components.
- Pretendard / Newsreader / JetBrains Mono are the only three font families loaded.

---

## 12. References

- `docs/design/dashboard-redesign-source/` — earlier Claude Design handoff that delivered the Author-first surface
- `docs/design/seizn-author-ui-rebrand-spec.md` — the spec that drove that handoff (uses Saebyeok Academy as sample IP)
- `docs/marketing/sample_ip/saebyeok-readme.md` — sample IP for examples in the canvas
- `src/components/dashboard/redesign/` — existing component library to extend
- `src/i18n/dictionaries/en.json` — i18n key shape reference
- PR #246–#251 — Author-first redesign that this brief extends
- PR #252 — Track 2 dashboard.account.api-keys (newest reference page; matches the target tone for the rest)
- Claude Design announcement — https://www.anthropic.com/news/claude-design-anthropic-labs
- Claude Design getting-started — https://support.claude.com/en/articles/14604416-get-started-with-claude-design

---

*End of brief. Paste sections 1–8 into the Claude Design canvas as initial context, then onboard the codebase pointing at `src/components/dashboard/redesign/` and `src/i18n/dictionaries/en.json`. Iterate per surface in §3a.*
