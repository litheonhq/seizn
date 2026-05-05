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

*Continued in §13–§19 — paste-ready bundle when "Link your codebase" isn't available.*

---

## 13. tokens.css — paste this verbatim as the canvas's first asset

When Claude Design has no codebase link, this is the *only* token file the prototypes should reference. Drop it into the canvas and require every surface to consume only these CSS variables.

```css
/* Seizn Author — V1 ink token system (Phase D''). Source of truth: docs/design/dashboard-redesign-source/tokens.css */

@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css');
@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  /* Ink palette — warm, paper-toned */
  --ink-0:    #ffffff;
  --ink-25:   #fbf8f2;
  --ink-50:   #f5f0e6;
  --ink-75:   #ece5d5;
  --ink-100:  #ddd3bd;
  --ink-200:  #bfb39a;
  --ink-300:  #948872;
  --ink-400:  #6f6655;
  --ink-500:  #4a4338;
  --ink-700:  #2c2820;
  --ink-900:  #1a1612;

  /* Accents */
  --terracotta-50:  #fbeee6;
  --terracotta-100: #f4d6c2;
  --terracotta-300: #d99877;
  --terracotta-500: #c96442;
  --terracotta-600: #a94e2f;
  --terracotta-700: #8a3d22;
  --dawn-50:  #fdf3da;
  --dawn-200: #f5dca5;
  --dawn-500: #d9a847;
  --dawn-700: #8a6818;

  /* Semantic */
  --bg-app:        var(--ink-25);
  --bg-sidebar:    var(--ink-50);
  --bg-elevated:   var(--ink-0);
  --bg-muted:      var(--ink-50);
  --border-subtle: rgba(74, 67, 56, 0.10);
  --border-strong: rgba(74, 67, 56, 0.20);
  --text-primary:  var(--ink-900);
  --text-secondary:var(--ink-500);
  --text-tertiary: var(--ink-400);
  --text-muted:    var(--ink-300);
  --shadow-card:   0 1px 2px rgba(26,22,18,.04), 0 4px 12px rgba(26,22,18,.04);
  --shadow-pop:    0 4px 12px rgba(26,22,18,.08), 0 16px 32px rgba(26,22,18,.08);

  /* Severity (P1 / P2 / P3) */
  --sev-p1-bg:     #fbeee6;
  --sev-p1-border: var(--terracotta-500);
  --sev-p1-text:   var(--terracotta-700);
  --sev-p2-bg:     #fdf3da;
  --sev-p2-border: var(--dawn-500);
  --sev-p2-text:   var(--dawn-700);
  --sev-p3-bg:     var(--ink-50);
  --sev-p3-border: var(--ink-200);
  --sev-p3-text:   var(--ink-500);

  /* Type */
  --font-sans:  'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif;
  --font-serif: 'Newsreader', 'Iowan Old Style', 'Apple Garamond', Georgia, serif;
  --font-mono:  'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;

  /* Radii */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;
}

.seizn * { box-sizing: border-box; }
.seizn {
  font-family: var(--font-sans);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  font-feature-settings: 'ss01', 'ss02', 'cv01', 'cv11';
  letter-spacing: -0.005em;
}
.seizn .serif { font-family: var(--font-serif); letter-spacing: -0.012em; }
.seizn .mono  { font-family: var(--font-mono); letter-spacing: 0; }
.seizn ::selection { background: var(--terracotta-100); color: var(--ink-900); }

.seizn .paper-bg {
  background:
    radial-gradient(1200px 600px at 90% -10%, rgba(217, 168, 71, 0.06), transparent 60%),
    radial-gradient(800px 500px at -10% 110%, rgba(201, 100, 66, 0.04), transparent 60%),
    var(--bg-app);
}
```

---

## 14. Starter HTML — paste this as the canvas's "App shell" first artboard

Single-file paste-ready scaffold. Subsequent surfaces in §3a should *replace the `<main>` content* and keep the sidebar / topbar identical.

```html
<!DOCTYPE html>
<html lang="ko" dir="ltr">
<head>
<meta charset="utf-8" />
<title>Seizn Dashboard</title>
<style>
/* paste the full tokens.css from §13 here */
html, body { margin: 0; padding: 0; }
body { font-family: var(--font-sans); background: var(--bg-app); color: var(--text-primary); min-height: 100vh; }
.app { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
.sidebar { background: var(--bg-sidebar); border-right: 1px solid var(--border-subtle); padding: 24px 16px; display: flex; flex-direction: column; gap: 24px; }
.sidebar-brand { font-family: var(--font-serif); font-size: 22px; letter-spacing: -0.012em; color: var(--ink-900); padding-left: 8px; }
.sidebar-section-label { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-tertiary); padding-left: 8px; margin-bottom: 6px; }
.sidebar-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: var(--radius-sm); color: var(--text-secondary); font-size: 13.5px; cursor: pointer; }
.sidebar-item:hover { background: rgba(74, 67, 56, 0.04); color: var(--text-primary); }
.sidebar-item.active { background: rgba(201, 100, 66, 0.08); color: var(--terracotta-700); border-left: 2px solid var(--terracotta-500); padding-left: 10px; font-weight: 500; }
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 16px 32px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-elevated); }
.topbar-search { width: 360px; padding: 7px 12px; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); background: var(--bg-app); font-size: 13px; color: var(--text-secondary); }
.topbar-actions { display: flex; gap: 12px; align-items: center; }
.btn { font-family: var(--font-sans); font-size: 13.5px; font-weight: 500; padding: 8px 14px; border-radius: var(--radius-sm); border: 0; cursor: pointer; line-height: 1; }
.btn.primary { background: var(--terracotta-500); color: var(--ink-0); }
.btn.primary:hover { background: var(--terracotta-600); }
.btn.ghost { background: transparent; color: var(--terracotta-700); padding: 8px 12px; }
.btn.ghost:hover { background: var(--terracotta-50); }
.btn.danger { background: transparent; color: var(--terracotta-700); border: 1px solid rgba(201, 100, 66, 0.4); }
main { padding: 32px 48px; max-width: 1080px; }
h1.serif { font-family: var(--font-serif); font-size: 36px; font-weight: 500; line-height: 1.2; letter-spacing: -0.012em; margin: 0 0 8px; color: var(--ink-900); }
h2.serif { font-family: var(--font-serif); font-size: 24px; font-weight: 500; line-height: 1.3; letter-spacing: -0.012em; margin: 32px 0 12px; color: var(--ink-900); }
.lead { font-size: 14.5px; color: var(--text-secondary); margin: 0 0 24px; line-height: 1.55; max-width: 64ch; }
.card { background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 20px 24px; box-shadow: var(--shadow-card); }
.card.dawn { background: var(--dawn-50); border-color: rgba(217, 168, 71, 0.30); }
.card.legal { background: var(--ink-25); border-color: var(--ink-200); }
.row { display: flex; gap: 16px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-subtle); }
.row:last-child { border-bottom: 0; }
.dim { color: var(--text-tertiary); font-size: 12.5px; }
.mono { font-family: var(--font-mono); font-size: 12.5px; color: var(--text-secondary); }
.pill { display: inline-flex; padding: 2px 8px; font-size: 11.5px; font-weight: 500; border-radius: 999px; background: var(--ink-50); color: var(--text-secondary); border: 1px solid var(--border-subtle); }
.pill.terracotta { background: var(--terracotta-50); color: var(--terracotta-700); border-color: rgba(201, 100, 66, 0.25); }
.pill.dawn { background: var(--dawn-50); color: var(--dawn-700); border-color: rgba(217, 168, 71, 0.30); }
</style>
</head>
<body class="seizn paper-bg">
<div class="app">
  <aside class="sidebar">
    <div class="sidebar-brand">Seizn</div>

    <div>
      <div class="sidebar-section-label">Workspace</div>
      <div class="sidebar-item active">Dashboard</div>
      <div class="sidebar-item">Writing</div>
      <div class="sidebar-item">Memories</div>
      <div class="sidebar-item">Import</div>
      <div class="sidebar-item">Replay</div>
    </div>

    <div>
      <div class="sidebar-section-label">Account</div>
      <div class="sidebar-item">API keys</div>
      <div class="sidebar-item">Privacy</div>
      <div class="sidebar-item">Settings</div>
    </div>

    <div>
      <div class="sidebar-section-label">Billing</div>
      <div class="sidebar-item">Plans</div>
      <div class="sidebar-item">Usage</div>
      <div class="sidebar-item">Invoices</div>
    </div>
  </aside>

  <div>
    <header class="topbar">
      <input class="topbar-search" placeholder="Search canon, conflicts, traces…  ⌘K" />
      <div class="topbar-actions">
        <span class="dim">Saebyeok Academy · ko</span>
        <button class="btn ghost">Help</button>
        <div style="width:28px; height:28px; border-radius:50%; background:var(--terracotta-500); color:#fff; display:flex; align-items:center; justify-content:center; font-size:12px;">SY</div>
      </div>
    </header>
    <main>
      <!-- Surface content goes here. Each artboard in §3a replaces this <main> only. -->
    </main>
  </div>
</div>
</body>
</html>
```

---

## 15. Sidebar nav tree (locked)

```
Workspace
├── Dashboard            /dashboard
├── Writing              /dashboard/author
├── Memories             /dashboard/memories
│   ├── Beliefs          /dashboard/memories/beliefs
│   ├── Branches         /dashboard/memories/branches
│   ├── Candidates       /dashboard/memories/candidates
│   ├── Decay            /dashboard/memories/decay
│   ├── Mindmap          /dashboard/memories/mindmap
│   └── Provenance       /dashboard/memories/provenance
├── Import               /dashboard/import
└── Replay               /dashboard/replay

Account
├── API keys             /dashboard/account/api-keys
├── Audit log            /dashboard/account/api-keys/audit  (deep link from API keys page only)
├── Privacy              /dashboard/account/privacy
└── Settings             /dashboard/settings

Billing
├── Plans                /dashboard/billing
├── Usage                /dashboard/usage
└── Invoices             /dashboard/billing#invoices  (anchor on Plans page; not a separate route)
```

The 23 `/dashboard/legacy/*` routes do **not** appear in the nav.

---

## 16. Wireframe ASCII — five anchor surfaces

### `/dashboard` (root landing)

```
┌─────────────────────────────────────────────────────────────────────┐
│  [ topbar ]                                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Saebyeok Academy                              [ Open writing → ]   │   ← Newsreader 36, terracotta CTA
│  12 chapters drafted · last edit 3h ago                             │   ← Pretendard 14, secondary
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐             │
│  │ API key      │   │ Memory v3    │   │ This month   │             │
│  │ healthy      │   │ synced       │   │ 7,231/10,000 │             │   ← 3 status cards, ink-0 bg
│  │ Manage →     │   │ Resync →     │   │ Upgrade →    │             │
│  └──────────────┘   └──────────────┘   └──────────────┘             │
│                                                                     │
│  ── Recent activity ─────────────────────────────────────────────   │   ← Newsreader 24
│  Chapter 12 imported · Saebyeok                          3h ago     │
│  Conflict resolved: protagonist occupation               yesterday  │
│  Key sk_seizn_4f2a… rotated                              2 days ago │
│  …                                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### `/dashboard/billing`

```
┌─────────────────────────────────────────────────────────────────────┐
│  Billing                                  [ Manage in Stripe → ]    │   ← Newsreader 36
│  Current plan: Pro · renews 2026-06-12                              │
│                                                                     │
│  ┌────────┐ ┌────────┐ ┌──────────┐ ┌──────────────────┐            │
│  │ Free   │ │ Indie  │ │ ◀ Pro   ▶│ │ Studio           │            │   ← 4 plan cards;
│  │ $0     │ │ $9/mo  │ │ $19/mo   │ │ $99/mo           │            │     Pro card has
│  │        │ │        │ │ Current  │ │                  │            │     terracotta-500
│  │ Choose │ │ Upgrade│ │ Manage   │ │ Upgrade          │            │     left rule
│  └────────┘ └────────┘ └──────────┘ └──────────────────┘            │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ ⓘ  Studio Managed adds metered Opus calls at $0.15 / call    │   │   ← dawn-50 callout
│  │     and removes the BYOK requirement on check + timeline.    │   │
│  │     [ Switch to Studio Managed → ]                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ── Invoices ─────────────────────────────────────────────────────   │
│  2026-05-12   Pro · monthly    $19.00     paid    [PDF]             │
│  2026-04-12   Pro · monthly    $19.00     paid    [PDF]             │
│  …                                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### `/dashboard/usage`

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│              7,231 / 10,000                                         │   ← Newsreader 64
│              calls this month                                       │   ← Pretendard small caps
│                                                                     │
│  ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱  72%                            │   ← terracotta-500 fill on ink-100 track
│                                                                     │
│  ── Per tool ─────────────────────────────────────────────────────   │
│  recall          4,210 calls    1 unit each    last 2 min ago       │
│  check             612 calls    5 units each   last 1h ago          │
│  timeline           48 calls    5 units each   last 3d ago          │
│  graph              91 calls    1 unit each    last 5h ago          │
│  search            980 calls    2 units each   last 12 min ago      │
│  approve         1,290 calls    1 unit each    last 8h ago          │
└─────────────────────────────────────────────────────────────────────┘
                                                       [ Upgrade → ]   ← sticky bottom-right when used >= 80%
```

### `/dashboard/replay/[traceId]`

```
┌─────────────────────────────────────────────────────────────────────┐
│  Trace req_abc123de4567f8                                           │   ← Newsreader 28 + JetBrains Mono id
│  recall · 312 ms · 200 OK                                           │   ← Pretendard 13, secondary
│                                                                     │
│  ●  validate_bearer            sk_seizn_a1b2…    8 ms       [json]  │
│  │                                                                  │
│  ●  check_scope                recall            1 ms       [json]  │
│  │                                                                  │
│  ●  rate_limit                 30/min            2 ms       [json]  │
│  │                                                                  │
│  ●  enforce_quota              7,232 / 10,000    14 ms      [json]  │
│  │                                                                  │
│  ●  service.recall             saebyeok-main     287 ms     [json]  │
│                                                                     │
│  Click any [json] to inspect payload (modal, JetBrains Mono).       │
└─────────────────────────────────────────────────────────────────────┘
```

### `/dashboard/import`

```
┌─────────────────────────────────────────────────────────────────────┐
│  Bring your manuscript in                                           │   ← Newsreader 36
│  Upload a docx, txt, or hwp. We'll extract characters, places,      │   ← Pretendard 14, secondary
│  and chapter beats. You confirm before anything's stored.           │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                             │    │
│  │            Drop your manuscript here                        │    │   ← dashed --border-strong rectangle,
│  │            or click to browse                               │    │     ink-50 bg, 240px tall,
│  │                                                             │    │     terracotta-300 dashed on hover
│  │            .docx · .txt · .hwp · ≤ 20 MB                    │    │
│  │                                                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  Once uploaded:                                                     │
│  ① Preview extracted entities + chapters                            │
│  ② Edit names inline                                                │
│  ③ Confirm — only then anything is saved                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 17. Component reference HTML — paste these inline into surface artboards

These approximate the existing `src/components/dashboard/redesign/atoms.tsx` API. Use them verbatim.

### Tag (pill) — 5 tones × 2 sizes

```html
<span class="pill">5 / 5 keys</span>
<span class="pill terracotta">P1 critical</span>
<span class="pill dawn">P2 warning</span>
<span class="pill" style="background:var(--ink-25); color:var(--text-secondary);">P3 stylistic</span>
<span class="pill" style="background:var(--ink-900); color:var(--ink-25); border-color:var(--ink-900);">solid</span>
```

### Button — 3 variants

```html
<button class="btn primary">Save</button>
<button class="btn ghost">Cancel</button>
<button class="btn danger">Delete account</button>
```

### Card — default / dawn / legal

```html
<div class="card">
  <h3 class="serif" style="margin:0 0 4px; font-size:18px; font-weight:500;">API key health</h3>
  <p class="dim" style="margin:0 0 16px;">All keys responding within SLA.</p>
  <a class="btn ghost" href="/dashboard/account/api-keys">Manage →</a>
</div>

<div class="card dawn">
  <h3 class="serif" style="margin:0 0 4px; font-size:18px; font-weight:500;">Studio Managed</h3>
  <p class="dim" style="margin:0 0 16px;">Drops the BYOK header. Adds $0.15 per Opus call.</p>
  <a class="btn primary" href="/dashboard/billing">Switch →</a>
</div>

<div class="card legal">
  <h3 class="serif" style="margin:0 0 4px; font-size:18px; font-weight:500;">Export my data</h3>
  <p class="dim" style="margin:0 0 16px;">A zip of every memory, beat, and approval decision tied to your account.</p>
  <a class="btn ghost">Request export →</a>
</div>
```

### Avatar (28 / 40 / 64 px)

```html
<div style="width:28px; height:28px; border-radius:50%; background:var(--terracotta-500); color:#fff; display:flex; align-items:center; justify-content:center; font-size:12px;">SY</div>
<div style="width:40px; height:40px; border-radius:50%; background:#7a8c5a; color:#fff; display:flex; align-items:center; justify-content:center; font-size:16px;">JM</div>
<div style="width:64px; height:64px; border-radius:50%; background:var(--dawn-500); color:var(--ink-900); display:flex; align-items:center; justify-content:center; font-size:24px; font-family:var(--font-serif);">SA</div>
```

### Kbd (keyboard shortcut chip)

```html
<kbd style="display:inline-flex; align-items:center; padding:1px 6px; font-family:var(--font-mono); font-size:11px; background:var(--ink-50); color:var(--text-secondary); border:1px solid var(--border-subtle); border-radius:4px;">⌘K</kbd>
```

---

## 18. Mock data — use these literal values in the prototypes

Realistic enough to look shipped; not real customer data. Sample IP is **Saebyeok Academy** per `docs/marketing/sample_ip/saebyeok-readme.md`.

### Plans (used by `/dashboard/billing`, `/dashboard`)

```json
[
  { "tier": "free",            "label": "Free",           "monthly": 0,   "yearly": null, "scopes": ["recall","remember","graph","search"] },
  { "tier": "indie",           "label": "Indie",          "monthly": 9,   "yearly": 90,   "scopes": ["…","check","timeline"], "byok": true },
  { "tier": "pro",             "label": "Pro",            "monthly": 19,  "yearly": 190,  "scopes": ["…","projects:write"],   "byok": true, "current": true },
  { "tier": "studio",          "label": "Studio",         "monthly": 99,  "yearly": 990,  "scopes": ["…","audit:read"],       "byok": true, "keysCap": 5 },
  { "tier": "studio_managed",  "label": "Studio Managed", "monthly": 299, "yearly": 2990, "scopes": ["…","managed_llm"],      "byok": false, "meteredOpusUsd": 0.15 },
  { "tier": "enterprise",      "label": "Enterprise",     "monthly": null,"yearly": null, "scopes": ["*"], "contactOnly": true }
]
```

### Invoices (used by `/dashboard/billing`)

```json
[
  { "id": "in_AB12", "issuedAt": "2026-05-12", "label": "Pro · monthly", "amountUsd": 19.00, "status": "paid",   "pdfUrl": "#" },
  { "id": "in_AB13", "issuedAt": "2026-04-12", "label": "Pro · monthly", "amountUsd": 19.00, "status": "paid",   "pdfUrl": "#" },
  { "id": "in_AB14", "issuedAt": "2026-03-12", "label": "Pro · monthly", "amountUsd": 19.00, "status": "paid",   "pdfUrl": "#" }
]
```

### Usage (used by `/dashboard/usage`, `/dashboard`)

```json
{
  "period": "month",
  "used": 7231,
  "quota": 10000,
  "perTool": [
    { "tool": "recall",    "calls": 4210, "costUnits": 1, "lastUsed": "2 min ago"  },
    { "tool": "check",     "calls":  612, "costUnits": 5, "lastUsed": "1h ago"     },
    { "tool": "timeline",  "calls":   48, "costUnits": 5, "lastUsed": "3d ago"     },
    { "tool": "graph",     "calls":   91, "costUnits": 1, "lastUsed": "5h ago"     },
    { "tool": "search",    "calls":  980, "costUnits": 2, "lastUsed": "12 min ago" },
    { "tool": "approve",   "calls": 1290, "costUnits": 1, "lastUsed": "8h ago"     }
  ]
}
```

### Recent activity (used by `/dashboard`)

```json
[
  { "kind": "import",  "label": "Chapter 12 imported · Saebyeok",         "at": "3h ago"     },
  { "kind": "conflict","label": "Conflict resolved: protagonist occupation","at": "yesterday"},
  { "kind": "key",     "label": "Key sk_seizn_4f2a… rotated",              "at": "2 days ago"},
  { "kind": "approve", "label": "Canon fact approved on Seoyun",           "at": "3 days ago"},
  { "kind": "import",  "label": "Chapter 11 imported · Saebyeok",          "at": "5 days ago"}
]
```

### Trace (used by `/dashboard/replay/[traceId]`)

```json
{
  "id": "req_abc123de4567f8",
  "tool": "recall",
  "totalMs": 312,
  "status": 200,
  "steps": [
    { "label": "validate_bearer",  "metadata": "sk_seizn_a1b2…",        "ms": 8   },
    { "label": "check_scope",      "metadata": "recall",                 "ms": 1   },
    { "label": "rate_limit",       "metadata": "30/min",                 "ms": 2   },
    { "label": "enforce_quota",    "metadata": "7,232 / 10,000",         "ms": 14  },
    { "label": "service.recall",   "metadata": "saebyeok-main",          "ms": 287 }
  ]
}
```

### Audit events (used by `/dashboard/account/api-keys/audit` — **already shipped, reference only**)

```json
[
  { "action": "created",         "occurredAt": "2026-05-06T10:12:33Z", "metadata": { "name": "MCP desktop key" } },
  { "action": "rotated",         "occurredAt": "2026-04-30T08:21:01Z", "metadata": { "newApiKeyId": "key-…" } },
  { "action": "revoked",         "occurredAt": "2026-04-12T14:00:00Z" },
  { "action": "rate_limited",    "occurredAt": "2026-04-09T22:18:11Z", "metadata": { "tool": "check" } },
  { "action": "quota_exceeded",  "occurredAt": "2026-03-31T23:59:01Z" }
]
```

---

## 19. i18n strings — `dashboard.<surface>.*` reference (en + ko pairs)

When the canvas needs literal copy, use these exact strings. The `en` side is the source of truth; `ko` is reviewed.

```json
{
  "dashboard.root.heroOpenWriting":     { "en": "Open writing →",                  "ko": "글쓰기 열기 →" },
  "dashboard.root.statusKeyHealth":     { "en": "API key health",                  "ko": "API 키 상태" },
  "dashboard.root.statusMemorySync":    { "en": "Memory v3 synced",                "ko": "Memory v3 동기화" },
  "dashboard.root.statusQuota":         { "en": "This month",                      "ko": "이번 달 사용량" },
  "dashboard.root.recentActivity":      { "en": "Recent activity",                 "ko": "최근 활동" },

  "dashboard.billing.title":            { "en": "Billing",                         "ko": "결제" },
  "dashboard.billing.currentPlan":      { "en": "Current plan",                    "ko": "현재 플랜" },
  "dashboard.billing.manageInStripe":   { "en": "Manage in Stripe →",              "ko": "Stripe에서 관리 →" },
  "dashboard.billing.upgrade":          { "en": "Upgrade",                         "ko": "업그레이드" },
  "dashboard.billing.invoices":         { "en": "Invoices",                        "ko": "청구서" },
  "dashboard.billing.studioManagedHint":{ "en": "Studio Managed adds metered Opus calls at $0.15 / call and removes the BYOK requirement on check + timeline.", "ko": "Studio Managed는 $0.15/Opus 호출 사용량 과금이 추가되고 check·timeline의 BYOK 요구를 제거합니다." },

  "dashboard.usage.callsThisMonth":     { "en": "calls this month",                "ko": "이번 달 호출" },
  "dashboard.usage.perTool":            { "en": "Per tool",                        "ko": "도구별" },
  "dashboard.usage.lastUsed":           { "en": "Last used",                       "ko": "마지막 사용" },

  "dashboard.replay.title":             { "en": "Replay",                          "ko": "재생" },
  "dashboard.replay.viewJson":          { "en": "View JSON",                       "ko": "JSON 보기" },

  "dashboard.import.heroTitle":         { "en": "Bring your manuscript in",        "ko": "원고를 가져오세요" },
  "dashboard.import.heroBody":          { "en": "Upload a docx, txt, or hwp. We'll extract characters, places, and chapter beats. You confirm before anything's stored.", "ko": "docx, txt, hwp 파일을 올리면 등장인물·장소·회차 비트를 추출합니다. 저장 전에 확인할 수 있어요." },
  "dashboard.import.dropPrompt":        { "en": "Drop your manuscript here, or click to browse", "ko": "원고를 여기 놓거나 클릭해서 선택하세요" },

  "dashboard.privacy.title":            { "en": "Privacy",                         "ko": "프라이버시" },
  "dashboard.privacy.exportData":       { "en": "Export my data",                  "ko": "내 데이터 내보내기" },
  "dashboard.privacy.deleteData":       { "en": "Delete my data",                  "ko": "내 데이터 삭제" },
  "dashboard.privacy.stopTraining":     { "en": "Stop training on my data",        "ko": "내 데이터로 학습 중지" },

  "dashboard.settings.profile":         { "en": "Profile",                         "ko": "프로필" },
  "dashboard.settings.locale":          { "en": "Locale",                          "ko": "언어와 시간대" },
  "dashboard.settings.notifications":   { "en": "Notifications",                   "ko": "알림" },
  "dashboard.settings.workspace":       { "en": "Workspace",                       "ko": "작업 환경" },
  "dashboard.settings.dangerZone":      { "en": "Danger zone",                     "ko": "위험 구역" }
}
```

When the canvas generates a new surface key not in this table, follow the same shape: `dashboard.<surface>.<camelCaseLeaf>` with `en` as source and `ko` reviewed; the other 20 locales fall back later.

---

*End of brief. Sections 13–19 are the codebase-link substitute — paste them along with §1–8 when the canvas can't link the repository.*
