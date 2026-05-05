# Seizn Author Studio — Design Doc

**Status:** Draft for stakeholder review
**Author:** Claude Code (research synthesis), based on user-conducted writer interviews
**Date:** 2026-05-05
**Companion docs:**
- Author Memory v3 backend: `docs/architecture/seizn-author-memory-v3.md`
- Dashboard redesign cycle (just shipped): `docs/architecture/seizn-author-dashboard-redesign-task-pack.md`
- Author flagship landing: `docs/marketing/seizn_author_landing_brief.md`

> This document is written in English per the global rule on agent handoff artifacts. Korean writer-facing UI copy and marketing language stays Korean and follows the locale guides separately.

---

## 0. Why this doc exists

Seizn shipped two surfaces so far:

1. The **Author Memory v3 API + dashboard** (review / characters / graph / conflicts / simulate). The dashboard is a *checking* surface — writers don't draft inside it; they paste finished prose and the system surfaces canon, character, and timeline conflicts.
2. The **Engine surface** (NPC SDK / memory infrastructure for game devs). Adjacent product, not for writers.

There is no *writing* surface. Writers draft in Scrivener, Word, Notion, Notepad, or Gmail. Memory v3's signal arrives only after the prose hits the dashboard — too late to prevent the writer from forgetting their own canon mid-scene.

This doc proposes **Seizn Author Studio**: a writing surface (web + desktop + CLI) that runs Memory v3 *inline while drafting*, never loses data, and respects the writers' actual workflow as captured in interviews.

---

## 1. Executive summary

**Wedge:** *'A writing tool that does not lose your words and does not forget your own canon.'*

Two pillars:

- **Never lose data** — local-first with CRDT sync, visible save indicators, automatic version history, no automatic merge on conflict (manual selection).
- **Never forget your canon** — `@character`, `@place`, `@setting` recall pulls Memory v3 facts into the editor inline. This addresses the documented pain of writers Ctrl-F-ing their own 200,000-word file to recover details they wrote three months ago.

**Surfaces:** web (extends current dashboard), desktop (Tauri 2.x), CLI (`seizn write` / `seizn outline` / `seizn check`). Same backend, same project, same Memory v3.

**MVP timeline:** 4–6 weeks of solo + AI-assisted build, after a 1–2 week interview + spec lock window.

**Key product decisions driven by interview data:**

| Pattern observed | Design response |
| --- | --- |
| Writers compose chapter 1 → end in a *single file* | Single-file linear editor. No binder. No corkboard. Chapter delineation via in-text markers parsed by the app. |
| Multiple writers report losing chapters to broken cloud sync | Local-first with CRDT, prominent 'last saved 2 seconds ago' indicator, automatic version history with one-click restore. |
| Writers run away from real-time spellcheck (red squigglies) to Notepad | Distraction-free is the *default*. Spellcheck only runs when the writer explicitly requests a post-draft check. |
| 'I forget my own settings — Ctrl-F takes forever' | Memory v3 *recall* (not validation): `@name` shortcut returns every prior mention plus current canon state. Validation (conflict detection) stays toggle-off until requested. |
| 'Scrivener because everyone else uses it' (the strongest reason) | We do not target Scrivener power users. We target writers who haven't picked a tool yet, plus Korean web novel writers underserved by Scrivener. |

---

## 2. Research findings (2026-05)

### 2.1 Primary research — user interviews

User-conducted interviews with Korean web novel writers. N≥2, patterns confirmed across multiple writers:

- **One file from chapter 1 to completion.** Writers do not split chapters into separate files. They scroll through one long document.
- **Tool fragmentation by purpose:**
  - Notion: capture inspirational sentences and ideas (read-only reference)
  - MS Word + Drive sync: main writing surface, *but* writers report losing chapters when sync broke. 'Trusted the sync too much' — explicit phrase from interviews.
  - Notepad: when writers want to escape spellcheck red lines while drafting
  - Scrivener: 'because other people use it' — interview-confirmed as the strongest motivation, not feature value
  - Gmail draft: auto-save + simplicity, used as a fallback
- **Chronic Ctrl-F pain.** While writing chapter 12, writers can't remember what they decided about a character's eye color in chapter 3, or what promise was made in chapter 5. They Ctrl-F manually through their own file. Interview quote: *'스크리브너 쓸 때 한 파일에 1화부터 완결까지 쓰는데 중간 중간 어떤 설정이였는지 작가도 까먹어서 찾기 기능으로 찾느라 시간 오래 소모.'*
- **Wedge validation.** All four candidate wedges (canon validation / KR-native / multi-tool consolidation / web-CLI-desktop sync) drew positive interest, with the **strongest excitement around** 'finds setting errors I didn't realize I'd made' — i.e. Memory v3 in writing context.
- **Required for v1:** post-draft spellcheck (on demand), configurable autosave interval, export to docx / HWP / pdf / txt / md.

### 2.2 Secondary research — Korean tooling landscape (2026-05)

Active KR-native and KR-friendly writing tools:

| Tool | Maker | Model | Status (May 2026) | Notes |
| --- | --- | --- | --- | --- |
| **펜시브 (pensiv)** | 라움랩스 | Multi-file (docs / plot board / character / canvas / folder), AI as validation layer (Ask / Plan / Agent / Review). NotebookLM-style direction. | Closed beta, ~50 writers including Naver-published authors. AES at rest + Google KMS keys. Foundation API (GPT/Gemini/Claude), no training on user data. Free basic tier. Mobile app planned 2026 Q1. Web only at present. | **Most direct competitor in our space.** Same canon-validation thesis, but assumes Scrivener-style multi-file structure that interviews say writers do not actually use. |
| **타입탁 (TypeTak)** | TypeTak | AI sentence recommendation + chatbot feedback. Web-based. | Live. AI suggestion adoption rate 45.6% — meaning writers reject majority of AI sentence suggestions. Validates 'AI off by default' design choice. | Less competitive — focused on sentence-level AI assist, not project-level memory. |
| **뮤블 (Mubble)** | (KR indie) | Episode / wiki / memo three-tier, cross-platform editor with workspace splitting. | Live. Lacks deep long-series structure per Pensiv's own competitive note. | Adjacent. |
| **노벨라 (Novela)** | (KR indie) | Web-based AI editor. Notes / research / characters / plot in one app. ChatGPT-style models, no user-content training. | Live. Surface-level AI integration. | Adjacent. |
| **한컴오피스 한글 (HWP)** | 한컴 | Standard KR document format. Used by writers for publishing layout (편집 용지, 글자 모양, 문단 모양) before submission. | Required. Submission to KR publishers, contests, and government channels expects HWP. Tooling is mostly proprietary. |
| **구글 독스** | Google | Strongest sync + version recovery. | Default fallback for writers who got burned by Word's Drive sync. |

### 2.3 Secondary research — international AI writing tools (2026-05)

Major competitors and their friction points (these are what we should NOT replicate):

| Tool | Pricing | Key friction (per 2026 user reviews) |
| --- | --- | --- |
| **Scrivener** | One-time, ~$60 | No AI integration. Looks 'clunky and outdated' in 2026 per multiple reviewers. 800-page PDF manual. Huge feature surface area mostly unused by web novel writers. |
| **Novelcrafter** | $4–$20/month + BYOK | BYOK setup blocks non-tech writers. Codex requires manual data entry of facts already present in the manuscript. AI does *not* auto-read the document — user must explicitly attach scenes as context. **Subscription cancel = read-only access** (lock-in). One Trustpilot reviewer alleges outline tools have *no measurable effect* on AI output. Browser-only, no native desktop or mobile. Limited export (DOCX + Markdown). |
| **Sudowrite** | $10–$44/month credits | Muse 1.5 fiction-trained model. Struggles with long context (60k-word draft, character introduced in chapter 3 not retrievable). Heavy-user costs scale fast. |
| **NovelAI** | Subscription | Privacy-first positioning, encrypted at rest. Stronger story generation than fiction-craft assistance. |

**Adoption data (2026-05):**
- ~45% of authors use AI for writing tasks (BookBub, May 2025, N=1,200)
- ~48% explicitly do not use AI and have no plans to
- 84% of non-users cite ethical concerns (training data)
- 82% of writers worry about AI homogenizing voice (Authors Guild, 2024)
- 74% of AI-using writers don't disclose to readers; readers feel betrayed when found
- Privacy and security cited as the #1 barrier to AI adoption (45%, Tieto 2026)

### 2.4 Secondary research — technical foundations

**CRDT for real-time + offline sync:** Yjs is the mature choice in 2026. 900k weekly downloads, used by Notion, Evernote, Proton Docs, JupyterLab, ClickUp, Affine, Outline. Direct integrations with ProseMirror, TipTap, Lexical, Monaco. Sequential text-insert performance (the dominant write pattern) is its target use case. Automerge offers richer JSON history but is slower at the text-insert workload. We pick **Yjs**.

**Desktop shell:** Tauri 2.x (released Q4 2025) gained stable iOS / Android support, runs on system WebView2 / WKWebView / WebKitGTK plus a Rust backend. Bundle ~10 MB vs Electron 80–200 MB; idle RAM ~30–40 MB vs ~200–300 MB; startup <0.5s vs 1–2s. Capability-based security model with explicit Rust command grants. Rust learning curve is the price; the Rust backend is also where we will host the HWP write pipeline (see below).

**HWP read/write libraries (2026-05):**

| Library | Strength | Limit |
| --- | --- | --- |
| `@ohah/hwpjs` | Active export (toJson / toMarkdown / toHtml). CLI included. | Read-side only; HWP write is not a goal of this lib. |
| `hwp.js` (hahnlee) | Apache 2.0 viewer/parser, popular. | Read/parse focus. |
| `node-hwp` | HWPML conversion. | 'Not yet ready for use in other projects' per the README. |
| **`rhwp` (edwardkim)** | **Rust + WASM, MIT-licensed, actively serializing HWPX (PR #170 by @seunghan91). WASM API supports insertParagraph / deleteParagraph / set_field round-trip.** | Newest (2025–2026), some surface still under construction. |

Decision: v1 ships docx/md/txt/pdf export only; v2 adds HWP write via rhwp embedded in the Tauri Rust backend (same language, natural fit). Ship a clear note in v1 saying 'HWP export is on the v2 roadmap; for now export DOCX and convert in 한컴오피스.' Honest beats half-broken.

---

## 3. Wedge & positioning

### 3.1 The marketing one-liner

**'당신이 잊은 당신의 설정을, 시즌이 기억합니다.'**
*('Seizn remembers the setting you forgot.')*

Secondary line for the data-loss segment:
**'한 단어도 잃지 않습니다.'**
*('Not one word is lost.')*

Both lines map to lived trauma observed in interviews. They are concrete, verifiable, and Scrivener cannot honestly claim either ('Dropbox sync' is not 'never lost' and Scrivener has no canon recall).

### 3.2 Target user (in priority order)

1. **Korean web novel writers who haven't locked into Scrivener yet** — the largest pool. Currently using some combination of Word + Notion + Notepad + Gmail. Acutely feel data-loss trauma (Word + Drive sync) and Ctrl-F pain (one long file).
2. **Debuting / serializing writers on 노벨피아 / 카카오페이지 / 네이버 시리즈 / 문피아 / 조아라** — looking for a tool that fits daily-publish cadence.
3. **Korean indie + literary fiction writers underserved by HWP-poor tools.**
4. *(Not now)* Scrivener loyalists — social-proof lock-in is too strong; we do not chase them in v1.

### 3.3 Direct competitive differentiation — Pensiv specifically

Pensiv is the closest competitor and we should be honest about it. Differences that matter:

| Dimension | Pensiv | Author Studio |
| --- | --- | --- |
| Document model | Multi-file (docs / plot board / character / canvas / folder). Inherits Scrivener's mental model. | **Single file.** Chapter markers in text. Matches what writers actually do. |
| AI primary use | **Validation** ('Ask / Plan / Agent / Review' — find conflicts, plan ahead) | **Recall** ('@name' returns last mention, current canon, related facts). Validation is secondary, opt-in. |
| Surfaces | Web only (mobile app planned 2026 Q1) | Web + Desktop (Tauri) + CLI from day one |
| Local-first | Cloud-first with AES at rest | **Local-first with CRDT.** Works fully offline. Sync optional. |
| Memory backend | Internal | **Memory v3** — already shipped, inherits canon / characters / conflicts / graph / timeline / simulate / audit |
| Pricing | Free basic, AI to be paid later | Free tier with full export rights (avoid Novelcrafter's read-only-on-cancel pattern); AI on paid tier; data export *always* unlocked |

Where we lose to Pensiv on day one: brand recognition in KR closed beta, ~50 already-onboarded writers. Where we beat them by design: writers don't actually use multi-file Scrivener-style structure; we match the real workflow. Plus we have Memory v3 already in production.

### 3.4 What we explicitly do NOT build (anti-scope)

These are excluded from v1 *and v2*:

- **Binder / outliner tree** (writers don't use it)
- **Corkboard / index cards** (writers don't use it)
- **Compile / book layout / EPUB / MOBI** (writers export DOCX → publisher does typesetting; exception: HWP added in v2)
- **AI prose generation / 'continue writing for me'** (Authors Guild voice-homogenization concern; Sudowrite's territory; not our wedge)
- **Real-time grammar / spellcheck while drafting** (writers actively flee tools that do this)
- **Required cloud account** (must work fully offline on desktop)
- **Per-character AI suggestion popups** (TypeTak-style, 45.6% adoption rate = 54% rejection rate)
- **Pay-to-export / read-only-on-cancel** (Novelcrafter's failure mode)
- **Voice-of-the-author training on user content** (a non-starter post-Authors Guild)
- **Required BYOK** (Novelcrafter's onboarding wall)

---

## 4. MVP feature lock

The eight features below define v1. Anything not on this list is post-v1.

### 4.1 Single-file linear editor

- Markdown-native body, with real-time render of headings / italics / bold for visible structure.
- Chapter detection via in-text markers (`# Ch. 1`, `## 1화`, regex configurable per project).
- Smooth scroll across the whole manuscript regardless of length (target: ≥500k characters before any UI degradation).
- Line numbers + chapter sidebar (collapsible) generated from markers, *not* from manual entry.
- Korean IME-friendly: composition events handled, no breaking on 한자 conversion.

### 4.2 Never-lose-data sync architecture

- **Local-first.** All edits commit to local Yjs document immediately. The local store is the source of truth.
- **CRDT (Yjs).** Sync to Seizn cloud is asynchronous and idempotent. Offline-only writers never see a sync UI.
- **Visible state indicator.** Always-on: 'last saved 2 seconds ago' / 'syncing' / 'offline (will sync)' / 'sync error (your work is safe locally)'. Never silently fails.
- **Automatic version history.** Every minute (configurable) and on every chapter break, a snapshot is taken. UI shows a timeline. One click restores.
- **No automatic merge on conflict.** If two devices diverge, the user picks (with diff). We never silently merge or pick a winner.
- **Backup export.** One-click 'export full project as zip' — markdown + version history + media. Works offline.

### 4.3 Configurable autosave + Korean-native trust signals

- Autosave interval defaults to *every keystroke* (CRDT-level). Display indicator updates every 2s.
- Settings panel exposes interval (10s / 30s / 1m / 5m / off) for writers who prefer the visible 'saving' rhythm.
- Crash-recovery: if the app crashes, on next open, the user sees 'recovered to last keystroke' with no data loss expected.
- Daily summary email (opt-in): 'You wrote 3,200 words today. Your manuscript is safely synced across 2 devices.'

### 4.4 Distraction-free by default

- No spellcheck red squigglies during drafting. Period.
- Full-screen mode by single shortcut (Cmd/Ctrl + Shift + F).
- Single body font (Pretendard for KR, Source Serif for EN), single body size, single accent color. Customizable but not encouraged.
- Sidebar collapsed by default. Inspiration panel (replaces Notion role, see 4.7) collapsed.
- Cursor color and selection color tuned for low contrast against background to reduce eye strain.

### 4.5 On-demand spellcheck

- Explicit menu: '맞춤법 검사 시작' / 'Run spellcheck'. Until pressed, zero red lines.
- Powered by 한국어 맞춤법 검사기 (KoSpellCheck or similar), Korean-first.
- Result rendered in a side panel as a list with 'Accept / Skip / Add to dictionary' per item. Body text is not visually marked unless the user clicks into a finding.
- v1 uses the open-source 부산대 맞춤법 검사 API (with rate-limit) or a vendored offline checker; v2 considers commercial license if usage demands it.

### 4.6 Multi-format export

- v1: docx, md, txt, pdf.
- docx export uses standard 한글 fonts + 웹소설 조판 defaults (편집 용지, 줄간격, 문단 들여쓰기) so that the docx opens cleanly in 한컴오피스 with minimal cleanup.
- v2: HWP write via `rhwp` Rust + WASM lib embedded in the Tauri Rust backend. Same project file, native HWP output.
- Each export is reproducible (same input → same output bytes), versioned, and saved alongside the project for audit.
- Honest UI message: 'HWP export is on the v2 roadmap. For now we recommend DOCX → 한컴오피스 → 다른 이름으로 저장 → HWP. v2 will let you skip the middle step.'

### 4.7 Canon recall via `@`

- While drafting, `@<name>` (or hotkey) opens an inline picker.
- Picker is populated from Memory v3 entities for the current project: characters / locations / objects / promises / rules / events.
- Selecting a candidate inserts the canonical name into the prose and pins a small sidebar card showing: last 3 mentions (with chapter and snippet), current canonical state (e.g. 'Seoyun: reporter as of Ch. 4'), and any pending conflict flags.
- The card stays open until dismissed. Writer can keep writing while it lives in the sidebar.
- This is the *primary* AI surface in v1. It replaces the writer's habit of Ctrl-F-ing their own manuscript.
- Latency target: <300ms from `@` to picker render with 200k-character manuscript loaded.

### 4.8 Canon validation toggle (off by default)

- A single toggle switch in the toolbar: 'Conflict detection: OFF / DRAFT / FULL'.
  - **OFF** (default): no inline marks, no notifications. Writers in flow are not interrupted.
  - **DRAFT**: only flags **P1** (critical) inconsistencies, as inline subtle underlines that don't break flow. Hover for explanation.
  - **FULL**: P1 + P2 + P3 (all severities, including stylistic notes), with side-panel review queue.
- Toggle preference is per-writer, per-project. Default OFF.
- Underlying detection is the existing Author Memory v3 conflict pipeline. No new ML work in v1.

---

## 5. Surfaces & technical architecture

### 5.1 Surface map

```
                    ┌────────────────────────────────────┐
                    │        Memory v3 (existing)         │
                    │   characters / canon / conflicts /  │
                    │   graph / timeline / simulate       │
                    └──────────────┬─────────────────────┘
                                   │ HTTP + WebSocket (auth-gated)
       ┌───────────────────────────┼───────────────────────────┐
       │                           │                           │
┌──────▼──────┐            ┌──────▼──────┐             ┌──────▼──────┐
│   Web app   │            │ Desktop app │             │     CLI     │
│ (Next.js,   │            │ (Tauri 2.x  │             │ (Node, ESM, │
│  extends    │            │  + Lexical  │             │  same API   │
│  current    │            │  + Yjs +    │             │  client as  │
│  dashboard) │            │  rhwp Rust) │             │  desktop)   │
└─────────────┘            └─────────────┘             └─────────────┘
```

All three surfaces share:
- Same Yjs document model (compatible across surfaces; CRDT merges work cross-surface)
- Same auth (Seizn account, same as the existing Author dashboard login)
- Same project + Memory v3 backend
- Same export pipeline (a shared TypeScript module compiled per surface)

### 5.2 Editor technology

- **Editor framework:** Lexical (Meta) — chosen over TipTap/ProseMirror for its first-class collaborative-with-Yjs story, Lexical's composability, and its integration in the existing dashboard codebase via React 19.
- **Document model:** Yjs `Y.Doc`. Body lives in a `Y.Text`. Chapter markers, comments, version history each get their own subdoc inside the same Yjs document.
- **Custom plugins:**
  - Single-file chapter detection (parses `Y.Text` for marker regex on debounce, builds the sidebar structure)
  - Korean IME composition handler (so 한글 IME composition does not produce CRDT operations until the composition is committed)
  - `@`-mention plugin tied to Memory v3 recall API
  - On-demand spellcheck plugin (panel-side, no inline marks)
  - Toggle-driven conflict marker plugin

### 5.3 Sync architecture

- **Local store:** Yjs `Y.Doc` persisted via `y-indexeddb` (web) or `y-leveldb` (desktop, via Tauri Rust). Writes commit synchronously to local within ~5ms of keystroke.
- **Cloud relay:** Yjs has multiple relay options. For v1 we ship a `y-websocket`–compatible relay hosted alongside the existing Seizn API (or as a separate service depending on infra). Auth is JWT (same Seizn session).
- **Snapshot pipeline:** every 60s and on chapter-marker insert, a snapshot is committed to durable Postgres storage with `(project_id, snapshot_id, ts, yjs_state_vector_diff)`. Snapshots are gzipped.
- **Conflict resolution:** Yjs CRDT merges most cases automatically. For semantic conflicts (e.g. user explicitly wrote two different sentences for the same paragraph on two devices), we surface a diff UI; the user picks. We never auto-pick.
- **Offline behavior:** desktop and CLI work fully offline. Web caches via `y-indexeddb` and a service worker; offline editing on the web works as long as the project was loaded once.

### 5.4 Memory v3 integration — recall API

New endpoint family on the existing Author UI service:

```
GET  /api/projects/{projectId}/recall?q=<name>
     → { entities: [{ id, type, canonical_name, last_mentions: [...], current_state, pending_conflicts: [...] }], elapsed_ms: <n> }

GET  /api/projects/{projectId}/recall/entity/{entityId}/mentions?limit=20
     → { mentions: [{ chapter, line, snippet, ts }] }

POST /api/projects/{projectId}/recall/index
     body: { yjs_state: <bytes> }   (full document, used to refresh the recall index)
     → { indexed_entities: <n>, ms: <n> }
```

The recall index is built server-side from the Yjs document plus the existing Memory v3 entity store. It is rebuilt on every snapshot (every minute or on chapter break). The picker hits the index, not the live document, so latency stays <300ms.

We do *not* reuse `withAuthorUiService` directly because recall must work without CSRF (it is read-only, frequent, and called from a desktop/CLI client that doesn't carry browser cookies). The recall endpoints accept Bearer-only auth (Supabase JWT or scoped API key).

### 5.5 CLI surface

```
seizn login
seizn project list
seizn project create <name>
seizn project import <path>           # imports docx, md, txt, hwp, scrivener .scriv
seizn write [--project <id>]          # opens a $EDITOR-controlled session with sync
seizn outline                         # prints chapter sidebar to stdout
seizn check [--severity P1|P2|P3]     # runs canon validation, returns exit code
seizn recall <name>                    # canon recall to stdout (terminal-friendly card)
seizn export --format docx|hwp|md|txt|pdf [--out <path>]
seizn snapshot list [--limit 20]
seizn snapshot restore <id>            # restores to a prior snapshot
```

`seizn write` is the most-used command: it opens the writer's `$EDITOR` (vim / vscode / nano) on the local Yjs-backed file, watches for changes, and propagates to the cloud relay. Closes cleanly on exit. Useful for power users and automation (scheduled writing reminders, daily-summary git-commit pattern).

### 5.6 Web surface (extends dashboard)

The existing `/dashboard/author` Workspace already has Sidebar + TopBar + tab routing. Author Studio adds two tabs:

- `/dashboard/author?tab=write` — the editor, embedded in the existing WorkspaceShell. Same sidebar / top bar / breadcrumb. Lexical + Yjs.
- `/dashboard/author?tab=manuscript` — read-only chapter-by-chapter manuscript viewer (for editor / co-author review without giving them write access).

The remaining tabs (inbox, characters, graph, conflicts, simulate, audit) are unchanged.

### 5.7 Desktop surface (Tauri 2.x)

- React 19 + Lexical + Yjs in the WebView (same codebase as web)
- Rust backend handles:
  - Native filesystem access for offline projects (encrypted at rest using user-provided passphrase or OS keychain)
  - HWP write (via rhwp WASM, but invoked from Rust)
  - Crash recovery (catch panics, auto-restart with last Yjs state)
  - Native menus, keyboard shortcuts, system notifications
- Bundle target: <15 MB on each of macOS, Windows, Linux
- Auto-update channel: Tauri-updater with EdDSA signatures
- Mobile (iOS / Android) not in v1; deferred to v2 since Tauri 2.x supports mobile (so we are not blocking that path)

### 5.8 Auth & data model

Reuses the existing Seizn auth (NextAuth / Supabase). Same projects are visible in dashboard and Author Studio. Seamless. No second login.

Data layout (existing where indicated):

```
projects                                (existing)
  id, owner_user_id, name, plan, created_at, ...

manuscripts                             (NEW)
  id, project_id, title, body_yjs_state (bytea), updated_at

manuscript_snapshots                    (NEW)
  id, manuscript_id, taken_at, yjs_state_diff (bytea, gzipped),
  reason ('autosave' | 'chapter_break' | 'manual' | 'pre_export')

manuscript_exports                      (NEW)
  id, manuscript_id, format, content (bytea), created_at, hash

recall_index                            (NEW, derived)
  id, project_id, entity_id, last_mention_ch, last_mention_snippet,
  current_state (jsonb), pending_conflict_ids (jsonb), refreshed_at
```

All NEW tables go into a single migration: `supabase/migrations/<ts>_author_studio_schema.sql`.

---

## 6. Data safety architecture (deep dive)

This is the differentiator and deserves its own section. Writers will leave forever the first time they lose a chapter; we cannot let that happen.

### 6.1 Three layers of defense

1. **Local CRDT** — every keystroke commits immediately to local IndexedDB / leveldb. Crash recovery returns to the last keystroke.
2. **Cloud snapshot** — every 60s and on chapter break, full snapshot pushed to Postgres. Snapshots are gzipped Yjs state bundles, retained for 90 days minimum (longer on paid tier).
3. **User-visible export** — one-click 'download full project as zip' produces markdown + media + version history that the writer can store anywhere.

If any single layer fails, the other two cover. No single point of failure.

### 6.2 What we DO NOT do

- **No automatic merge on conflict.** If device A and device B both edited the same paragraph offline, we show a side-by-side diff and the writer picks. Never silently merge.
- **No deletion without confirmation.** 'Delete project' requires typing the project name. 'Delete manuscript' requires explicit confirmation. Tombstones are kept for 30 days minimum before hard delete.
- **No third-party sync layer.** We control the relay, the storage, and the snapshot pipeline. No 'Dropbox failed' excuse.

### 6.3 Failure-mode tests (gate to GA, not just to ship)

These tests must pass before the product leaves beta:

- **Network drop during edit** — pull network for 10 minutes during a 10,000-keystroke session, then reconnect. Expectation: zero lost keystrokes, sync resumes.
- **Concurrent edit on two devices** — same paragraph, different content, both offline, reconnect both. Expectation: diff UI appears; writer picks; no silent merge.
- **Server outage** — relay returns 503 for 1 hour during edit session. Expectation: writer gets 'sync paused, your work is safe locally' indicator; on relay return, sync catches up.
- **Crash recovery** — kill the desktop process during heavy edit. Expectation: on restart, last keystroke is intact within 1s.
- **Disk full** — fill the local disk to 100% during edit. Expectation: app warns, refuses new writes (does not silently lose them), and offers to export a zip to a different volume.
- **Corrupt local state** — truncate the IndexedDB / leveldb file mid-write. Expectation: app detects, fetches latest from cloud, recovers without writer intervention beyond 'Recover from cloud?' prompt.

Each of these gets an automated test in CI. Every release runs them. No release ships if any fails.

---

## 7. Phased plan

### Phase 0 — interview + spec lock (Week 0–1, 1–2 weeks)

- Conduct 3–5 additional writer interviews (in addition to the ones already done) to confirm the patterns and surface anything new.
- Finalize MVP feature list (this doc, after stakeholder review).
- Recruit 5 founding writers (free Pro tier for life in exchange for monthly feedback + 1 public testimonial within 6 months).
- Lock the design doc.

**Gate to Phase 1:** stakeholder approval, 5 founding writers verbally committed.

### Phase 1 — single-file editor + sync (Week 2–4, ~3 weeks)

- Tauri 2.x desktop shell scaffolded.
- Lexical + Yjs editor with chapter marker detection.
- y-indexeddb / y-leveldb local persistence.
- Cloud relay running, JWT-authed.
- Visible save indicator + version history UI.
- Failure-mode test suite (item 6.3) — must pass before Phase 2.

**Gate to Phase 2:** all 6 data-safety tests pass on CI.

### Phase 2 — Memory v3 recall + export (Week 4–6, ~2 weeks)

- `@`-mention plugin wired to the recall API.
- Recall API endpoints live (`/api/projects/{id}/recall*`).
- Recall index pipeline runs on every snapshot.
- docx / md / txt / pdf export.
- On-demand spellcheck panel (KoSpellCheck or 부산대 API integration).

**Gate to GA-beta:** end-to-end demo with one founding writer drafts 5,000 words across desktop and web, exports docx, never sees a save error.

### Phase 3 — CLI + web parity (Week 6–8, ~2 weeks)

- `seizn` CLI with all commands listed in 5.5.
- Web `/dashboard/author?tab=write` parity with desktop.
- Marketing site / landing copy update.

**Gate to public beta:** all 5 founding writers have written ≥10,000 words in the tool. Zero data-loss reports.

### Phase 4 — HWP write + mobile (post-MVP, deferred 2–3 months)

- rhwp embedded in Tauri Rust backend.
- HWP write export.
- Tauri 2.x mobile build (iOS + Android).
- Validation toggle UI polish.

---

## 8. Founding writer plan

5 writers. Each gets:

- Free Pro tier for life
- Direct line to the Seizn team (private channel)
- Early access to every release ahead of public
- Their name listed (with consent) on the launch landing page

In exchange:

- Monthly 30-minute feedback call for 6 months
- One public testimonial within the first 6 months (blog post / Twitter / writer-community share — writer's choice of channel)
- Permission to anonymously cite their workflow in marketing case studies

Recruit through:
- 노벨피아 / 카카오페이지 / 네이버 시리즈 / 문피아 publisher contacts
- Existing Author Memory v3 dashboard founding-member pool
- Direct outreach to writers who publicly complain about Scrivener / Word data loss

Day-1 metric: 5 founding writers signed within 2 weeks of Phase 0 start.

---

## 9. Risks & mitigations

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Data loss event in beta — single biggest reputational risk | Low if §6 enforced; catastrophic if it happens | Three-layer safety, six-test gate, 30-day tombstone. No release without all six passing. |
| Pensiv lock-in among Naver writers — they have ~50 already | Medium | Differentiate on single-file model + offline + CLI. Recruit founding writers who are *not* in Pensiv beta. |
| KR HWP requirement blocks v1 launch | Medium | Honest 'v2 HWP' messaging plus DOCX export today. If 3+ founding writers refuse to use without HWP, escalate rhwp embed into v1. |
| AI homogenization concern (82% of Authors Guild respondents) | Low for our product since we don't generate prose | Position recall as 'looks up your own writing' not 'generates new writing.' Validation toggle defaults OFF. We never train on user content. |
| Korean spellcheck vendor risk (open-source 부산대 API rate limits, commercial alts cost) | Medium | v1 ships with rate-limit-aware queue. Vendor-specific licensing decision for v2 after usage data. |
| CRDT performance on >500k-character manuscripts | Low (Yjs scales) but unproven for our specific workload | Stress-test with 1M-character manuscript before Phase 2 gate. If degradation appears, evaluate Diamond Types or sharding strategies. |
| Tauri Rust learning curve for solo + AI dev | Low — AI bridges gap; Tauri JS APIs cover most surface | Limit Rust code to: file IO, HWP rhwp wrapper, native menus. Everything else stays in TypeScript. |
| Founding writer churn before testimonials | Medium | Set expectation in onboarding: '6 months of feedback in exchange for free Pro forever.' No hard contract; reputation-based. |
| Memory v3 recall index lag on rapid edits | Medium | Debounce indexing to once per minute or on chapter break (already in design). Show 'recall up to date as of <ts>' in the UI. |

---

## 10. Open questions (pre-build)

These need answers before Phase 1 starts:

1. **Pricing.** Free tier (with full export) + Pro at what price? Founding writer 'free for life' is on top of whatever the standard tier becomes. Recommended: Free tier with 2 projects / unlimited words / full export; Pro at $9–$12/mo with unlimited projects + cloud sync + recall AI + advanced versioning.
2. **Founding writer recruiting channel.** Publisher direct? Existing Seizn dashboard early users? Cold outreach to specific KR writer communities (트위터 작가 / 디씨 웹소설 갤러리 / 노벨피아 카페)?
3. **Spellcheck vendor.** 부산대 API vs commercial KoSpellCheck SDK vs Hancom (paid).
4. **CRDT relay hosting.** Same Vercel deployment as the existing Seizn web app, or separate Fly.io / Render service for lower-latency persistent connections?
5. **Memory v3 recall scope.** Should the recall be only across the current manuscript, or across all manuscripts in the same project (cross-novel canon)? Interview signal not yet clear.
6. **Conflict resolution UX.** When two devices diverge mid-paragraph, what does the diff UI look like? Side-by-side text? Inline track-changes-style? This needs a UI sketch in Phase 0.
7. **Beta closure.** Does v1 ship as 'public beta' or 'closed beta with waitlist'? Public beta accepts faster feedback but increases data-safety blast radius if anything fails.

---

## 11. Anti-goals

In addition to §3.4 anti-scope, the *cycle itself* should not:

- Modify Author Memory v3 service / store / supabase-store (they are persistence-cycle territory; this cycle adds new tables for manuscript / snapshot / export, but does not touch existing Memory v3 internals)
- Touch `src/components/landing/*` (Author flagship landing — separate surface)
- Touch `src/app/engine/*` (Engine surface — dual-surface separation strict)
- Touch `(auth)/*` or `src/app/api/auth/*` (auth flow stable)
- Introduce KNOT identifiers anywhere (Saebyeok sample IPs only for any sample data, matching the existing project policy)
- Add engine-surface design cues (cosmic dark / violet / cyan / JetBrains Mono dominant / season tier)
- Use double quotes in user-facing Korean text — single quotes only (existing project rule)

---

## 12. Appendix A — interview source data (paraphrased, anonymized)

Captured from user interviews 2026-04 to 2026-05. Patterns ≥2 writers unless noted (1 = single-source, do not act on alone).

- '1화부터 완결까지 한 파일에 몰아쓴다' — pattern, ≥2 writers, also confirmed in KR web novel community signals (e.g. 디씨 웹소설 갤러리 references).
- '워드 + 드라이브 연동 믿다가 몇 화 날아간 적 있다' — pattern, ≥2 writers. Drives 'never lose data' as the #1 marketing line.
- '메모장 쓰는 이유는 빨간 줄 안 떠서' — pattern, ≥2 writers. Drives 'distraction-free default' design choice.
- '스크리브너 = 다른 사람들도 써서' — pattern, ≥2 writers, *and* explicitly identified by the user as the strongest reason. Drives 'do not target Scrivener power users' positioning.
- '예상 못한 설정 오류를 잡아 주면 좋겠다' — single source so far, but consistent with the recall pain point. Drives the validation toggle (DRAFT mode for P1 only).
- '한 파일 안에서 자기가 까먹은 설정 찾느라 Ctrl-F 시간 오래 소모' — single explicit source but referenced as a chronic pain. Drives the *primary* AI surface (recall).
- 'Notion (영감 기록) / Word (메인) / 메모장 (방해 회피) / Scrivener (사회증명) / Gmail (자동저장 + 간편)' — five-tool combo, ≥2 writers. Drives the multi-tool consolidation play.

---

## 13. Appendix B — hand-off checklist for the build cycle

When the user approves this doc and a build cycle starts, the build agent should receive:

- [ ] This doc (`docs/architecture/seizn-author-studio-design-doc.md`)
- [ ] Existing Memory v3 spec (`docs/architecture/seizn-author-memory-v3.md`)
- [ ] Existing Author UI service (`src/lib/author/ui/service.ts`) for recall API integration
- [ ] Dashboard redesign code for Sidebar / TopBar / WorkspaceShell reuse (`src/components/dashboard/redesign/`)
- [ ] Existing tokens (`src/styles/tokens.css`) — Author Studio inherits the warm paper-tone palette
- [ ] Failure-mode test suite specification (§6.3 of this doc)
- [ ] Founding writer list (5 names + contact, pending Phase 0)

The build cycle should be a separate task pack, structured similarly to `seizn-author-dashboard-redesign-task-pack.md`, with phases, verify gates, and commit conventions.

---

*End of design doc. Next action: stakeholder review (= user review). On approval, run additional 3–5 interviews, then commission a build cycle task pack.*
