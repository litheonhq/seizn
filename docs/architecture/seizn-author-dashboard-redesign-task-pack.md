# Author Dashboard Redesign — Task Pack (2nd UX rebrand cycle)

Status: ready for Claude session execution
Owner: handoff written 2026-05-05
Companion design brief: [`../marketing/dashboard_redesign_brief.md`](../marketing/dashboard_redesign_brief.md) (PR #244)
Companion design source: [`../design/dashboard-redesign-source/`](../design/dashboard-redesign-source/) (10 files from claude.ai Designer, 2026-05-05)
Sister cycle (1차, 이미 완료): [`./seizn-author-ui-rebrand-task-pack.md`](./seizn-author-ui-rebrand-task-pack.md)
Sister cycle (persistence, 이미 완료): [`./seizn-author-memory-v3-persistence-task-pack.md`](./seizn-author-memory-v3-persistence-task-pack.md)

## How to use this document

자동 순차 진행 모드. 단일 Claude run 으로 Phase 0~7 (코드 작업 전체) 를
연달아 실행. Phase 8 은 수동 (PR + production verify).

각 phase:

1. Phase 섹션 read.
2. 참조된 design source 파일 read.
3. Steps 실행 + 정해진 commit 단위로 commit.
4. Verify gate 평가.
5. **Gate pass → 즉시 다음 phase 진입.** 보고 없이 진행.
6. **Gate fail → 즉시 stop, 실패 phase·gate·로그 보고, Phase 7 완료까지 자동 진행 중단.**
7. Phase 7 완료 → 자동 stop (Phase 8 은 인간 작업).

병렬 금지 — 항상 sequential. cross-task 오염 방지
(`feedback_codex_sequential_execution` 정합).

verify gate 가 안전망. 실패하지 않은 phase 는 묻지 않고 진행.

### Dispatch header (단 1회)

```
작업 디렉토리: C:/Users/admin/Projects/seizn
실행 대상: docs/architecture/seizn-author-dashboard-redesign-task-pack.md §Phase 0 → §Phase 7 순차 자동
지침: Phase 0부터 시작. 각 phase verify gate 통과 시 다음 phase 즉시 진입.
      verify gate 실패 시 즉시 stop, 실패 phase·gate·로그 보고.
      Phase 7 완료 후 자동 stop (Phase 8 PR + production verify 는 인간 작업).
      병렬 실행 금지·순차만 (feedback_codex_sequential_execution 정합).
      각 phase 의 commit 양식 준수. 한 phase = 정해진 commit 단위.
      Design source 는 docs/design/dashboard-redesign-source/* — 그대로 복사 X·
        Pretext-native React/TypeScript 로 재구현.
      KNOT 식별자 (char.sori·knot.short1·청학여 등) 절대 추가 금지.
      예시는 design source 의 Saebyeok sample IP (Midnight City / Seoyun /
        Doyoon / Jin / Minho / Yeonsu 등) 만 사용.
      공개 텍스트에 큰따옴표 금지 (작은따옴표만).
      Engine surface 디자인 cue 0건 (cosmic dark · violet · cyan · JetBrains
        Mono dominant · NPC 어휘 · season tier).
      Master copy language = English (i18n keys 영어 master · ko/ja/zh 번역
        Phase 7).
```

The agent must not invent extra phases or skip the verify gate to keep moving.

### Commit message convention

- One commit per phase boundary (default). Sub-commits 가능 — 단 phase 끝에 verify gate 통과 commit 1개 더 두는 패턴.
- Format: `<type>(<scope>): <imperative summary>`
- Scopes used: `dashboard`, `design-tokens`, `i18n`, `routing`
- Types used: `feat`, `refactor`, `chore`, `docs`
- Example: `feat(dashboard): add WorkspaceShell with Inbox/Characters/Graph views`
- No emoji. `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` footer 권장.

### Brief 미정 4 routes — disposition (이번 cycle 결정)

Brief Appendix A 의 review 4개:

| route | disposition | rationale |
|---|---|---|
| `/dashboard/canon` | **`_legacy/`** | NPC 시절 canon viewer. Author canon 은 별도 (이미 author/* 안에 통합·sidebar Conflicts/Characters tab 안에서 expose) |
| `/dashboard/replay` | **keep, sidebar Memory > Replay** | Author replay 흐름 유효. NPC 잔재 코드만 정리 (별 micro-cycle) |
| `/dashboard/story-health` | **`_legacy/`** | 이름은 Author스럽지만 NPC 시절 구현. Author 전용 새로 만들 별 cycle 필요 |
| `/dashboard/privacy` | **`/dashboard/account/privacy`** 로 이동 | RTBF/DSR Author 도 필요. Account group sub-page (sidebar 비노출, Settings 안 link) |

## Pre-flight checklist (before Phase 0)

- [ ] Working directory is `C:/Users/admin/Projects/seizn`.
- [ ] On branch `main` (or any clean branch).
- [ ] `git status` clean (no untracked / modified — `packages/seizn-cli/package-lock.json` 이 untracked 면 stash or git ignore 처리).
- [ ] `npm install` already run (no missing deps).
- [ ] `git fetch origin main` ran recently (origin/main 최신).
- [ ] `npm run verify:knot-separation` passes baseline.
- [ ] Design source 모두 read: `docs/design/dashboard-redesign-source/SOURCE_README.md` · `DESIGNER_CHAT.md` · `Seizn Author Dashboard.html` · `tokens.css` · `primitives.jsx` · `sidebar.jsx` · `topbar.jsx` · `view-inbox.jsx` · `view-characters.jsx` · `view-graph.jsx` · `polish.jsx` · `workspace.jsx`.

> 1차 cycle 머지 완료 (commits `9bf629de`·`8dbc4c15`·... ~8개) 이후 main 위에 cut.
> Persistence cycle 도 머지 완료 (`AUTHOR_UI_STORE=supabase` env dispatch 작동중).
> 두 cycle 의 코드는 **그대로 유지** — 본 cycle 은 visual layer + IA + routing 만 변경.

---

## Phase 0 — Branch + baseline

**Goal**: Cut working branch from origin/main and confirm green baseline.

### Steps

1. `git fetch origin main`
2. `git checkout -b feat/author-dashboard-redesign-2nd origin/main`
3. `npm run typecheck`
4. `npm run lint`
5. `npm run test:run`
6. `npm run verify:knot-separation`
7. Read `docs/design/dashboard-redesign-source/SOURCE_README.md`, `DESIGNER_CHAT.md`, `Seizn Author Dashboard.html` to load design context.

### Verify gate

- [ ] `npm run typecheck` exit 0
- [ ] `npm run lint` exit 0
- [ ] `npm run test:run` 통과 (회귀 baseline)
- [ ] `npm run verify:knot-separation` 통과
- [ ] `git status` clean (branch 가 유일한 artifact)
- [ ] Design source 4 핵심 파일 read 완료

**Verify gate pass → Phase 1 자동 진행. Fail → stop and report.**

---

## Phase 1 — Design tokens extension

**Goal**: V1 ink token system 위에 dashboard redesign 전용 토큰 추가 (Newsreader serif font + 3-tier severity tokens + paper-bg utility). 기존 V1 ink palette 변경 X.

### Steps

1. Read [`docs/design/dashboard-redesign-source/tokens.css`](../design/dashboard-redesign-source/tokens.css) 전체.
2. Open [`src/styles/tokens.css`](../../src/styles/tokens.css). 기존 `--ink-*`·`--terracotta-*`·`--dawn-*` 토큰 그대로 유지 (overlap 확인 필수).
3. Add new tokens (없는 것만 추가, dashboard redesign 영역에 그룹):

   ```css
   /* === Dashboard redesign — 2nd UX rebrand cycle (2026-05-05) === */

   :root {
     /* Severity tier (conflict cards) */
     --sev-p1-bg:     #fbeee6;
     --sev-p1-border: var(--terracotta-500);
     --sev-p1-text:   var(--terracotta-700);
     --sev-p2-bg:     #fdf3da;
     --sev-p2-border: var(--dawn-500);
     --sev-p2-text:   var(--dawn-700);
     --sev-p3-bg:     var(--ink-50);
     --sev-p3-border: var(--ink-200);
     --sev-p3-text:   var(--ink-500);

     /* Dashboard-only fonts (Newsreader for italic display + canon labels) */
     --font-display-serif: 'Newsreader', 'Iowan Old Style', 'Apple Garamond', Georgia, serif;
   }

   /* Paper-tone gradient utility */
   .paper-bg {
     background:
       radial-gradient(1200px 600px at 90% -10%, rgba(217, 168, 71, 0.06), transparent 60%),
       radial-gradient(800px 500px at -10% 110%, rgba(201, 100, 66, 0.04), transparent 60%),
       var(--ink-25);
   }

   /* Skeleton shimmer keyframe */
   @keyframes sk {
     0%   { background-position: 100% 0; }
     100% { background-position: -100% 0; }
   }
   ```

4. Newsreader font 로드 — Phase 1 은 token 만 추가. Phase 5 의 WorkspaceShell 이 `next/font/google` 로 로드 (root layout 오염 회피).
5. Verify token shadow X (existing `--ink-200` 등 변경 X — 신규 키만).

### Files

- `src/styles/tokens.css` (+~25 lines, 신규 섹션)

### Verify gate

- [ ] `npm run typecheck` exit 0
- [ ] `npm run lint` exit 0
- [ ] 기존 V1 ink token (--ink-0 ~ --ink-900, --terracotta-*, --dawn-*) 값 변경 0건 (`git diff src/styles/tokens.css` 로 확인 — 추가만)
- [ ] 새 토큰 5개 (`--sev-p1-*` 3개 + `--sev-p2-*` 3개 + `--sev-p3-*` 3개 + `--font-display-serif` + `.paper-bg` + `@keyframes sk`) 추가됨
- [ ] 기존 컴포넌트 시각 회귀 X (1차 cycle 산출물 그대로 렌더)

### Commit

`feat(design-tokens): extend V1 ink with severity tier + Newsreader serif + paper-bg utility`

**Verify gate pass → Phase 2 자동 진행. Fail → stop and report.**

---

## Phase 2 — Shared primitives (redesign namespace)

**Goal**: Design source `primitives.jsx` + `polish.jsx` 의 atoms 를 React/TypeScript 로 재구현. 기존 `src/components/dashboard/*` 는 변경 X — 신규 `src/components/dashboard/redesign/` namespace 분리.

### Steps

1. Read [`docs/design/dashboard-redesign-source/primitives.jsx`](../design/dashboard-redesign-source/primitives.jsx) 전체.
2. Read [`docs/design/dashboard-redesign-source/polish.jsx`](../design/dashboard-redesign-source/polish.jsx) 전체.
3. Create `src/components/dashboard/redesign/` directory.
4. Create files:

   | 파일 | 내용 |
   |---|---|
   | `redesign/icons.tsx` | 35+ icon set from `primitives.jsx I` object — TypeScript Icon component + named exports (InboxIcon, ReviewIcon, CharactersIcon, GraphIcon, TimelineIcon, ConflictIcon, SimulateIcon, AuditIcon, BrainIcon, EditIcon, MapIcon, ReplayIcon, UsageIcon, ByokIcon, SettingsIcon, SearchIcon, PlusIcon, ChevronDownIcon, ChevronRightIcon, MoreIcon, CommandIcon, BellIcon, FeatherIcon, CheckIcon, XIcon, BookmarkIcon, FilterIcon, SortIcon, PanelIcon, PinIcon, ArrowRightIcon, ArrowUpRightIcon, BookIcon, SparkIcon, ActsIcon) |
   | `redesign/atoms.tsx` | `Tag` (5 tones: ink/terracotta/dawn/cream/solid · 2 sizes: xs/sm) · `Avatar` (name + color + size + ring) · `KBD` · `Skel` (skeleton with shimmer animation) |
   | `redesign/empty-state.tsx` | `EmptyIllustration` (3 kinds: characters/inbox/graph SVG line illustration) + `EmptyState` (illustration + title + body + primary CTA + hints) |
   | `redesign/conflict-card.tsx` | `ConflictCard` v2 (severity P1/P2/P3 · kind · episode · why · refs · Resolve/Open/Dismiss actions) |
   | `redesign/skeletons.tsx` | `SkeletonInbox` (5 row placeholder for inbox loading) |
   | `redesign/types.ts` | TypeScript types: `Severity` (`'P1' \| 'P2' \| 'P3'`), `TagTone`, `EmptyKind`, `ConflictRef` |
   | `redesign/index.ts` | re-export all named exports |

5. **Mock data → real data**: Design source 의 `MOCK` (Midnight City IP) 는 prototype 용. Phase 2 의 atoms 는 props 만 받음 — mock data 직접 import 금지. Phase 5 가 실제 service.ts 호출로 data 주입.
6. JSX → TSX: 모든 props typed. `any` 금지.
7. inline style 패턴 유지 (engine surface 와 동일 — Tailwind utility class 가 아닌 inline + CSS var). 단 `style={{ ... }}` 객체가 50줄 이상이면 별 const 로 분리.

### Files

- `src/components/dashboard/redesign/icons.tsx` (~150 lines)
- `src/components/dashboard/redesign/atoms.tsx` (~150 lines)
- `src/components/dashboard/redesign/empty-state.tsx` (~120 lines)
- `src/components/dashboard/redesign/conflict-card.tsx` (~100 lines)
- `src/components/dashboard/redesign/skeletons.tsx` (~30 lines)
- `src/components/dashboard/redesign/types.ts` (~20 lines)
- `src/components/dashboard/redesign/index.ts` (~15 lines)

### Verify gate

- [ ] `npm run typecheck` exit 0 (모든 props typed)
- [ ] `npm run lint` exit 0 (`any` 0건 in redesign/)
- [ ] `redesign/index.ts` 가 모든 named exports re-export
- [ ] 기존 `src/components/dashboard/*` (DashboardShell.tsx, MobileSidebar.tsx, TopBar.tsx, navigation.ts 등) 변경 0건
- [ ] 새 컴포넌트 단위 테스트 (Phase 7 에서 추가) — Phase 2 는 컴파일만

### Commit

`feat(dashboard): add redesign primitives (Tag/Avatar/KBD/Skel/EmptyState/ConflictCard v2 + 35 icons)`

**Verify gate pass → Phase 3 자동 진행. Fail → stop and report.**

---

## Phase 3 — Sidebar redesign (15 items + WorkspaceSwitcher + MemoryHealth)

**Goal**: 사이드바를 design source `sidebar.jsx` 패턴으로 재구성. 15 items (Workspace 8 + Memory 4 + Account 3) · WorkspaceSwitcher (sidebar 상단) · MemoryHealth indicator (sidebar bottom 위 user card) · expanded(232px) ↔ collapsed(56px) toggle.

### Steps

1. Read [`docs/design/dashboard-redesign-source/sidebar.jsx`](../design/dashboard-redesign-source/sidebar.jsx) 전체.
2. Create `src/components/dashboard/redesign/sidebar/` directory:

   | 파일 | 내용 |
   |---|---|
   | `sidebar/nav-config.ts` | NAV constant — Workspace 8 + Memory 4 + Account 3. id, label (i18n key path), icon (icons.tsx import), badge?, kbd?, dot? (`'p1'`) |
   | `sidebar/sidebar-item.tsx` | SidebarItem — active + hover + collapsed state · density support |
   | `sidebar/sidebar-group.tsx` | SidebarGroup — group label (uppercase) + collapsed=divider only |
   | `sidebar/workspace-switcher.tsx` | WorkspaceSwitcher — top component (S avatar + workspace name + Studio + entries count + chevDown) |
   | `sidebar/user-card.tsx` | UserCard — bottom component (avatar + name + plan tier + more) |
   | `sidebar/memory-health.tsx` | MemoryHealth — between user card and group (live dot pulse + 'Memory synced · just now · N facts') |
   | `sidebar/sidebar.tsx` | Sidebar shell — composes WorkspaceSwitcher / search bar / 3 groups / MemoryHealth / UserCard |
   | `sidebar/index.ts` | re-export |

3. **NAV mapping** (사이드바 구조):

   ```ts
   export const NAV_GROUPS = [
     {
       id: 'workspace',
       labelKey: 'dashboard.nav.groups.workspace',
       items: [
         { id: 'inbox',      labelKey: 'dashboard.nav.inbox',      href: '/dashboard/author?tab=inbox',     icon: InboxIcon, badgeKey: 'inbox.unread', kbd: 'I' },
         { id: 'review',     labelKey: 'dashboard.nav.review',     href: '/dashboard/author?tab=review',    icon: ReviewIcon, badgeKey: 'review.pending', kbd: 'R' },
         { id: 'characters', labelKey: 'dashboard.nav.characters', href: '/dashboard/author?tab=characters',icon: CharactersIcon, badgeKey: 'characters.count', kbd: 'C' },
         { id: 'graph',      labelKey: 'dashboard.nav.graph',      href: '/dashboard/author?tab=graph',     icon: GraphIcon, kbd: 'G' },
         { id: 'timeline',   labelKey: 'dashboard.nav.timeline',   href: '/dashboard/author?tab=timeline',  icon: TimelineIcon, kbd: 'T' },
         { id: 'conflicts',  labelKey: 'dashboard.nav.conflicts',  href: '/dashboard/author?tab=conflicts', icon: ConflictIcon, badgeKey: 'conflicts.open', dotKey: 'conflicts.has_p1', kbd: 'X' },
         { id: 'simulate',   labelKey: 'dashboard.nav.simulate',   href: '/dashboard/author?tab=simulate',  icon: SimulateIcon, kbd: 'S' },
         { id: 'audit',      labelKey: 'dashboard.nav.audit',      href: '/dashboard/author?tab=audit',     icon: AuditIcon, kbd: 'A' },
       ],
     },
     {
       id: 'memory',
       labelKey: 'dashboard.nav.groups.memory',
       items: [
         { id: 'memories',     labelKey: 'dashboard.nav.memories',     href: '/dashboard/memories',          icon: BrainIcon },
         { id: 'memory-edit',  labelKey: 'dashboard.nav.memoryEditor', href: '/dashboard/memory-editor',     icon: EditIcon },
         { id: 'mindmap',      labelKey: 'dashboard.nav.mindMap',      href: '/dashboard/memories/mindmap',  icon: MapIcon },
         { id: 'replay',       labelKey: 'dashboard.nav.replay',       href: '/dashboard/replay',            icon: ReplayIcon },
       ],
     },
     {
       id: 'account',
       labelKey: 'dashboard.nav.groups.account',
       items: [
         { id: 'usage',    labelKey: 'dashboard.nav.usage',    href: '/dashboard/usage',     icon: UsageIcon },
         { id: 'byok',     labelKey: 'dashboard.nav.byok',     href: '/dashboard/settings/byok', icon: ByokIcon },
         { id: 'settings', labelKey: 'dashboard.nav.settings', href: '/dashboard/settings',  icon: SettingsIcon },
       ],
     },
   ];
   ```

4. **MemoryHealth indicator data source**: `useAuthorUiHealth()` hook (Phase 5에서 만듦) 이 `{ status: 'synced' | 'syncing' | 'error', lastSyncedAt: Date, factsCount: number }` 반환. Phase 3 단계에선 mock fallback (`{ status: 'synced', lastSyncedAt: new Date(), factsCount: 0 }`).
5. **WorkspaceSwitcher data**: `useSession()` 의 `session.user.workspaces` (현재 활성 workspace + 다른 project) — 1 workspace 만 있을 때 dropdown 비활성. Studio plan 만 multi-project.
6. **active state derivation**: `usePathname()` + `useSearchParams().get('tab')` 조합으로 active item 결정.
7. 기존 `DashboardShell.tsx` 의 sidebar JSX 는 **건드리지 않음** (Phase 6 routing 단계에서 신구 sidebar dispatch 결정). Phase 3 는 신규 컴포넌트만 추가.

### Files

- `src/components/dashboard/redesign/sidebar/nav-config.ts` (~80 lines)
- `src/components/dashboard/redesign/sidebar/sidebar-item.tsx` (~70 lines)
- `src/components/dashboard/redesign/sidebar/sidebar-group.tsx` (~30 lines)
- `src/components/dashboard/redesign/sidebar/workspace-switcher.tsx` (~70 lines)
- `src/components/dashboard/redesign/sidebar/user-card.tsx` (~50 lines)
- `src/components/dashboard/redesign/sidebar/memory-health.tsx` (~50 lines)
- `src/components/dashboard/redesign/sidebar/sidebar.tsx` (~80 lines)
- `src/components/dashboard/redesign/sidebar/index.ts` (~10 lines)

### Verify gate

- [ ] `npm run typecheck` exit 0
- [ ] `npm run lint` exit 0
- [ ] NAV_GROUPS 구조 = Workspace 8 + Memory 4 + Account 3 = 15 items 정확
- [ ] 모든 i18n key path (`dashboard.nav.*`, `dashboard.nav.groups.*`) 가 string literal (Phase 7 에서 사전 추가될 키)
- [ ] 기존 `src/components/dashboard/DashboardShell.tsx`·`MobileSidebar.tsx`·`navigation.ts` 변경 0건

### Commit

`feat(dashboard): add redesign sidebar shell (15-item nav + WorkspaceSwitcher + MemoryHealth)`

**Verify gate pass → Phase 4 자동 진행. Fail → stop and report.**

---

## Phase 4 — TopBar redesign

**Goal**: design source `topbar.jsx` 패턴으로 TopBar 재구현. breadcrumb (Workspace > active tab) · Command bar (⌘K) · Bell · Write CTA (terracotta primary).

### Steps

1. Read [`docs/design/dashboard-redesign-source/topbar.jsx`](../design/dashboard-redesign-source/topbar.jsx) 전체.
2. Create `src/components/dashboard/redesign/top-bar.tsx`.
3. Components:

   - `TopBar` — height density-aware (compact 48px / comfortable 54px / spacious 60px). Default `comfortable`.
   - 좌측: sidebar toggle (panel icon) + breadcrumb (Workspace > current tab serif italic)
   - 우측: Command bar button (⌘K) + Bell (notification) + Write CTA (terracotta filled, feather icon)
   - `iconBtn` style helper (32x32 ghost button)

4. **Variant B prop** (top-bar tabs visible) — design source의 VariantB 패턴. Phase 4 는 `variant?: 'A' | 'B'` prop 만 추가, default `'A'`. Phase 5 의 WorkspaceShell 이 어떤 variant 쓸지 결정.
5. **Command palette wiring**: Phase 4 는 button 만. 실제 palette open handler 는 Phase 5 WorkspaceShell 의 state 로 lift up.

### Files

- `src/components/dashboard/redesign/top-bar.tsx` (~120 lines)

### Verify gate

- [ ] `npm run typecheck` exit 0
- [ ] `npm run lint` exit 0
- [ ] 기존 `src/components/dashboard/TopBar.tsx` 변경 0건

### Commit

`feat(dashboard): add redesign top bar (breadcrumb + Command + Write CTA)`

**Verify gate pass → Phase 5 자동 진행. Fail → stop and report.**

---

## Phase 5 — WorkspaceShell + 3 views (Inbox / Characters / Graph) + Conflicts + Simulate empty

**Goal**: 가장 큰 phase. 3-pane Inbox · Characters register + detail · SVG relationship graph · ConflictsView · SimulateEmpty · WorkspaceShell composer 모두 구현. 실제 service.ts data 와 wired up.

### Steps

1. Read 4 design source 파일 전체:
   - [`workspace.jsx`](../design/dashboard-redesign-source/workspace.jsx) (~170 lines)
   - [`view-inbox.jsx`](../design/dashboard-redesign-source/view-inbox.jsx) (~215 lines)
   - [`view-characters.jsx`](../design/dashboard-redesign-source/view-characters.jsx) (~195 lines)
   - [`view-graph.jsx`](../design/dashboard-redesign-source/view-graph.jsx) (~225 lines)

2. Create `src/components/dashboard/redesign/views/`:

   | 파일 | 역할 |
   |---|---|
   | `views/types.ts` | View prop types (`InboxRow`, `Character`, `GraphNode`, `GraphEdge`, etc.) |
   | `views/use-author-data.ts` | hooks — `useAuthorInbox()` · `useAuthorCharacters()` · `useAuthorGraph()` · `useAuthorConflicts()` · `useAuthorUiHealth()`. Wraps existing service.ts methods. |
   | `views/inbox-view.tsx` | 3-pane (list 380px + detail) · PriorityDot · InboxRow · InboxDetail with evidence + suggested resolution |
   | `views/characters-view.tsx` | register table (7-column grid) + CharDetailPanel (340px) with canon facts + relationships |
   | `views/graph-view.tsx` | SVG relationship graph (Force/Radial/Hierarchy mode buttons - default Force) + legend + zoom + detail panel (300px) |
   | `views/conflicts-view.tsx` | ConflictCard grid (auto-fill 360px min) wrapping ConflictCard from Phase 2 |
   | `views/simulate-empty.tsx` | EmptyState wrapper for /author?tab=simulate (uses graph kind illustration) |
   | `views/fallback-view.tsx` | "This tab uses the same shell pattern" placeholder for unimplemented tabs (timeline/audit/etc.) |

3. Create `src/components/dashboard/redesign/workspace-shell.tsx`:

   - Composes `<Sidebar>` + `<TopBar>` + active view
   - `defaultTab` prop (default `'inbox'`)
   - `collapsed` prop (controlled or internal)
   - `density` prop (`'compact' | 'comfortable' | 'spacious'`, default `'comfortable'`)
   - tab state via URL searchParam `tab` (single source of truth — sidebar nav, top bar tabs, deep linking 모두 같은 source)
   - active view dispatch:
     ```tsx
     {tab === 'inbox' ? <InboxView /> :
      tab === 'characters' ? <CharactersView /> :
      tab === 'graph' ? <GraphView /> :
      tab === 'conflicts' ? <ConflictsView /> :
      tab === 'simulate' ? <SimulateEmpty /> :
      <FallbackView tab={tab} />}
     ```

4. **react-flow / SVG ssr 처리**: GraphView 의 SVG 는 server-renderable (interactive 만 client). 단 `useState`/`useEffect` 가 있으면 `'use client'` directive 명시. WorkspaceShell 도 `'use client'` (interactive shell).
5. **font 로딩**: WorkspaceShell 의 root `<div>` 에 `next/font/google` 로 Newsreader 로드:

   ```tsx
   import { Newsreader } from 'next/font/google';
   const newsreader = Newsreader({
     subsets: ['latin'],
     weight: ['400', '500', '600'],
     style: ['normal', 'italic'],
     variable: '--font-display-loaded',
     display: 'swap',
   });
   ```

   `--font-display-serif` token 의 fallback chain 가장 앞에 `var(--font-display-loaded)` 이 오도록 tokens.css Phase 1 수정 보완 (또는 WorkspaceShell 안에서 inline style override).
6. **data hooks**: `use-author-data.ts` 의 hooks 가 service.ts 직접 호출 X — `/api/author/*` 호출 (existing endpoints). 없는 endpoint 는 Phase 5 단계에서 생성 X (placeholder 데이터로 채우고 followup task 로 표시 — 코멘트 `// TODO(dashboard-redesign): wire to /api/author/<endpoint>`).
7. **mock fallback 로직**: data hook 가 실패하거나 data 없을 때 design source `MOCK` 의 데이터 형태로 graceful fallback (Midnight City IP — Saebyeok sample IP 안에 있으므로 KNOT 격리 OK).

### Files

- `src/components/dashboard/redesign/views/types.ts` (~80 lines)
- `src/components/dashboard/redesign/views/use-author-data.ts` (~150 lines)
- `src/components/dashboard/redesign/views/inbox-view.tsx` (~250 lines)
- `src/components/dashboard/redesign/views/characters-view.tsx` (~220 lines)
- `src/components/dashboard/redesign/views/graph-view.tsx` (~280 lines)
- `src/components/dashboard/redesign/views/conflicts-view.tsx` (~100 lines)
- `src/components/dashboard/redesign/views/simulate-empty.tsx` (~30 lines)
- `src/components/dashboard/redesign/views/fallback-view.tsx` (~25 lines)
- `src/components/dashboard/redesign/workspace-shell.tsx` (~150 lines)

총 ~1,300 lines.

### Verify gate

- [ ] `npm run typecheck` exit 0 (모든 view props typed)
- [ ] `npm run lint` exit 0
- [ ] WorkspaceShell 단독 import → render 가능 (lint check)
- [ ] react-flow / SVG SSR 안전 (`'use client'` directive 모든 interactive 컴포넌트에 명시)
- [ ] Newsreader font `next/font` 로 로드 — `<link>` tag 사용 X (Author flagship 토큰 leakage 방지)
- [ ] 기존 `src/components/dashboard/*` (DashboardShell·MobileSidebar·TopBar·navigation) 변경 0건

### Commit

`feat(dashboard): add redesign WorkspaceShell with Inbox/Characters/Graph/Conflicts/Simulate views`

**Verify gate pass → Phase 6 자동 진행. Fail → stop and report.**

---

## Phase 6 — Routing + legacy isolation

**Goal**: `/dashboard` 진입을 Author workspace 로 redirect (Author plan user) + 22 NPC SDK routes 를 `/dashboard/_legacy/*` 로 이동 + brief 미정 4 routes disposition 적용.

### Steps

1. Read [`src/proxy.ts`](../../src/proxy.ts) §dashboard 부분 (line 47-50 isDashboardPath, line 232-247 dashboard 처리).
2. Read [`src/app/(dashboard)/dashboard/page.tsx`](../../src/app/(dashboard)/dashboard/page.tsx) (현재 generic landing).
3. **Routing change** — `/dashboard` 진입 시:

   - Author plan user → `/dashboard/author` 로 308 redirect
   - 다른 plan / unauthenticated → 기존 generic landing (별 cycle 에서 정리)
   - 구현: `src/app/(dashboard)/dashboard/page.tsx` 에서 `getServerSession()` 으로 user.plan 확인 후 `redirect()`. infinite loop 회피 — `/dashboard/author` 자체는 redirect target 이므로 source 와 다름.

4. **Legacy isolation** — 22 routes 를 `_legacy/` 로 git mv:

   ```
   src/app/(dashboard)/dashboard/autopilot/          → _legacy/autopilot/
   src/app/(dashboard)/dashboard/budget/             → _legacy/budget/
   src/app/(dashboard)/dashboard/calculator/         → _legacy/calculator/
   src/app/(dashboard)/dashboard/canon/              → _legacy/canon/
   src/app/(dashboard)/dashboard/chaos/              → _legacy/chaos/
   src/app/(dashboard)/dashboard/compliance/         → _legacy/compliance/
   src/app/(dashboard)/dashboard/devtools/           → _legacy/devtools/
   src/app/(dashboard)/dashboard/enterprise/         → _legacy/enterprise/
   src/app/(dashboard)/dashboard/evals/              → _legacy/evals/
   src/app/(dashboard)/dashboard/federated/          → _legacy/federated/
   src/app/(dashboard)/dashboard/governance/         → _legacy/governance/
   src/app/(dashboard)/dashboard/integrations/       → _legacy/integrations/
   src/app/(dashboard)/dashboard/moderation/         → _legacy/moderation/
   src/app/(dashboard)/dashboard/npcs/               → _legacy/npcs/
   src/app/(dashboard)/dashboard/organizations/      → _legacy/organizations/
   src/app/(dashboard)/dashboard/playground/         → _legacy/playground/
   src/app/(dashboard)/dashboard/policy-marketplace/ → _legacy/policy-marketplace/
   src/app/(dashboard)/dashboard/post-mortem/        → _legacy/post-mortem/
   src/app/(dashboard)/dashboard/reports/            → _legacy/reports/
   src/app/(dashboard)/dashboard/reranker/           → _legacy/reranker/
   src/app/(dashboard)/dashboard/security/           → _legacy/security/
   src/app/(dashboard)/dashboard/story-health/       → _legacy/story-health/
   src/app/(dashboard)/dashboard/traces/             → _legacy/traces/
   src/app/(dashboard)/dashboard/webhooks/           → _legacy/webhooks/
   ```

   (24 dirs — brief Appendix A 의 22 + canon + story-health = 24)

5. **Brief 미정 4 routes disposition** (이번 cycle 결정 — task pack 상단 표 참조):
   - `/dashboard/canon` → `/dashboard/_legacy/canon` (위 git mv 에 포함)
   - `/dashboard/replay` → **그대로 유지** (Author replay 로 사용 — `git mv` 안 함)
   - `/dashboard/story-health` → `/dashboard/_legacy/story-health` (위 git mv 에 포함)
   - `/dashboard/privacy` → `/dashboard/account/privacy` 로 이동:
     ```bash
     mkdir -p src/app/(dashboard)/dashboard/account
     git mv src/app/(dashboard)/dashboard/privacy src/app/(dashboard)/dashboard/account/privacy
     ```

6. **Internal links update** — 22+ legacy routes 로의 internal href 를 `/dashboard/_legacy/*` 로 업데이트. `Grep -r "/dashboard/<route>"` 로 모두 찾고 일괄 교체. 외부 link (CHANGELOG / docs / external) 는 변경 X.
7. **navigation.ts cleanup** — `src/components/dashboard/navigation.ts` 의 `buildNavigationGroups` (legacy) 는 그대로 유지 (다른 plan user 가 사용). 단 Author plan user 진입 시 `buildAuthorNavigationGroups` (1차 cycle 산출물) 또는 신규 redesign sidebar 둘 중 하나만 활성. **DashboardShell.tsx 의 Sidebar 호출 dispatch**:
   - Author plan user (URL 이 `/dashboard/author/*` or `/dashboard/memories/*` 등) → 신규 `redesign/sidebar/sidebar.tsx` 사용
   - 다른 user → 기존 sidebar 그대로
   - 구현: DashboardShell.tsx 안에서 `usePathname()` 으로 `/dashboard/author` 진입 시 redesign Sidebar 컴포넌트 import 후 swap. 1차 cycle 의 `buildAuthorNavigationGroups` 는 backwards-compat 유지 (Phase 7 i18n 갈때 정리).

### Files

- `src/app/(dashboard)/dashboard/page.tsx` (modify — Author plan redirect 추가)
- `src/app/(dashboard)/dashboard/_legacy/*` (24 dirs · git mv)
- `src/app/(dashboard)/dashboard/account/privacy/` (git mv from /dashboard/privacy)
- `src/components/dashboard/DashboardShell.tsx` (modify — Sidebar dispatch by plan/path)
- Internal link updates (~5-15 files, grep-based)

### Verify gate

- [ ] `npm run typecheck` exit 0
- [ ] `npm run lint` exit 0
- [ ] `npm run test:run` 통과 (라우팅 테스트 회귀 X)
- [ ] `git status` 에 ~24 directory rename + 1 redirect 변경 + ~5-15 link update — 깨끗
- [ ] `/dashboard/_legacy/<old-route>` 직접 접근 시 page render 정상
- [ ] sidebar 에 24 legacy route 노출 0건 (수동: `Grep "/_legacy"` in DashboardShell + redesign/sidebar/nav-config.ts → 0건)
- [ ] `/dashboard/author` 진입 = 신규 redesign sidebar (`'use client'` working)
- [ ] `/dashboard` 진입 (Author plan) = `/dashboard/author` 308 redirect
- [ ] `/dashboard` 진입 (no session) = generic landing (변경 X)

### Commit

분리 권장 (3 sub-commits):
1. `refactor(routing): isolate 24 NPC SDK legacy routes under /dashboard/_legacy/*`
2. `refactor(routing): move /dashboard/privacy under /dashboard/account/privacy (Author RTBF)`
3. `feat(routing): /dashboard auto-redirect to /dashboard/author for Author plan users`

**Verify gate pass → Phase 7 자동 진행. Fail → stop and report.**

---

## Phase 7 — i18n + tests + final wiring

**Goal**: dashboard.* i18n key 추가 (en master + ko/ja/zh-hans/zh-hant 4 우선 locale 번역) + redesign 컴포넌트 테스트 + 1차 cycle backwards-compat 확인.

### Steps

1. **i18n key inventory** — 새로 필요한 키 (~70 개):

   ```
   dashboard.nav.groups.workspace          → "Workspace"
   dashboard.nav.groups.memory             → "Memory"
   dashboard.nav.groups.account            → "Account"

   dashboard.nav.inbox                     → "Inbox"
   dashboard.nav.review                    → "Review"
   dashboard.nav.characters                → "Characters"
   dashboard.nav.graph                     → "Graph"
   dashboard.nav.timeline                  → "Timeline"
   dashboard.nav.conflicts                 → "Conflicts"
   dashboard.nav.simulate                  → "Simulate"
   dashboard.nav.audit                     → "Audit"
   dashboard.nav.memories                  → "Memories"
   dashboard.nav.memoryEditor              → "Memory editor"
   dashboard.nav.mindMap                   → "Mind map"
   dashboard.nav.replay                    → "Replay"
   dashboard.nav.usage                     → "Usage"
   dashboard.nav.byok                      → "BYOK"
   dashboard.nav.settings                  → "Settings"

   dashboard.workspace.switcher.studio     → "Studio"
   dashboard.workspace.switcher.entries    → "{count} entries"

   dashboard.memoryHealth.synced           → "Memory synced"
   dashboard.memoryHealth.syncing          → "Syncing..."
   dashboard.memoryHealth.error            → "Sync error"
   dashboard.memoryHealth.factsCount       → "{relativeTime} · {count} facts"

   dashboard.topBar.search                 → "Search"
   dashboard.topBar.command                → "Command"
   dashboard.topBar.write                  → "Write"
   dashboard.topBar.notifications          → "Notifications"
   dashboard.topBar.toggleSidebar          → "Toggle sidebar"

   dashboard.inbox.title                   → "Inbox"
   dashboard.inbox.newCount                → "{count} new"
   dashboard.inbox.filter.all              → "All"
   dashboard.inbox.filter.conflicts        → "Conflicts"
   dashboard.inbox.filter.reviews          → "Reviews"
   dashboard.inbox.filter.characters       → "Characters"
   dashboard.inbox.empty                   → "Inbox is clear."
   dashboard.inbox.empty.body              → "Memory v3 will surface canon, character, and timeline conflicts here as you draft."
   dashboard.inbox.detail.evidence         → "Evidence"
   dashboard.inbox.detail.suggestion       → "Suggested resolution"
   dashboard.inbox.detail.memorySuggests   → "Memory v3 suggests"
   dashboard.inbox.detail.applySuggestion  → "Apply suggestion"
   dashboard.inbox.detail.openIn           → "Open in {episode}"
   dashboard.inbox.detail.notConflict      → "Mark not a conflict"
   dashboard.inbox.priority                → "Priority {p}"

   dashboard.characters.title              → "Characters"
   dashboard.characters.add                → "Add character"
   dashboard.characters.filter             → "Filter characters"
   dashboard.characters.col.name           → "Name"
   dashboard.characters.col.role           → "Role"
   dashboard.characters.col.episodes       → "Eps"
   dashboard.characters.col.relations      → "Rel"
   dashboard.characters.col.conflicts      → "Conflicts"
   dashboard.characters.role.lead          → "Lead"
   dashboard.characters.role.supporting    → "Supporting"
   dashboard.characters.role.minor         → "Minor"
   dashboard.characters.detail.canonFacts  → "Canon facts"
   dashboard.characters.detail.relationships → "Relationships"
   dashboard.characters.empty              → "It's quiet here."
   dashboard.characters.empty.body         → "Add your first character. We'll start a canon entry and watch for inconsistencies as you write."
   dashboard.characters.empty.cta          → "Add character"

   dashboard.graph.title                   → "Relationship graph"
   dashboard.graph.summary                 → "{characters} characters · {ties} ties"
   dashboard.graph.mode.force              → "Force"
   dashboard.graph.mode.radial             → "Radial"
   dashboard.graph.mode.hierarchy          → "Hierarchy"
   dashboard.graph.legend.lead             → "Lead"
   dashboard.graph.legend.supporting       → "Supp."
   dashboard.graph.legend.minor            → "Minor"
   dashboard.graph.legend.tie              → "Tie"
   dashboard.graph.legend.conflict         → "Conflict"
   dashboard.graph.detail.directTies       → "Direct ties · {count}"
   dashboard.graph.detail.tieStrength      → "Tie strength"
   dashboard.graph.detail.avgStrength      → "Avg. {percent}% across {count} ties"
   dashboard.graph.empty                   → "No ties yet."
   dashboard.graph.empty.body              → "Add two characters and a relationship. The graph fills out as you write — no manual upkeep."
   dashboard.graph.empty.cta               → "Add a relationship"

   dashboard.conflicts.title               → "Conflicts"
   dashboard.conflicts.criticalCount       → "{count} critical"
   dashboard.conflicts.warningCount        → "{count} warning"
   dashboard.conflicts.severity.p1         → "Critical"
   dashboard.conflicts.severity.p2         → "Warning"
   dashboard.conflicts.severity.p3         → "Note"
   dashboard.conflicts.action.resolve      → "Resolve"
   dashboard.conflicts.action.openEvidence → "Open evidence"
   dashboard.conflicts.action.dismiss      → "Dismiss"

   dashboard.simulate.empty                → "Run your first scene simulation"
   dashboard.simulate.empty.body           → "Drop two characters and a beat. We replay how they'd react against your canon — useful before you commit a scene to draft."
   dashboard.simulate.empty.cta            → "Set up a simulation"
   ```

2. Add all keys to `src/i18n/dictionaries/en.json` (master).
3. Translate to `ko.json` (Korean writer-friendly · -요체 · "인물" / "갈등" / "검수" / "타임라인" / "장" 어휘):

   ```
   dashboard.nav.groups.workspace          → "워크스페이스"
   dashboard.nav.groups.memory             → "메모리"
   dashboard.nav.groups.account            → "계정"
   dashboard.nav.inbox                     → "인박스"
   dashboard.nav.review                    → "검수"
   dashboard.nav.characters                → "인물"
   dashboard.nav.graph                     → "관계 그래프"
   ...
   ```

4. Translate to `ja.json` (丁寧語 · 「人物」「対立」「レビュー」「タイムライン」).
5. Translate to `zh-hans.json` (简体 · 「人物」「冲突」「检视」).
6. Translate to `zh-hant.json` (繁體 · 「人物」「衝突」「檢視」).
7. **나머지 17 locale** (es / pt-BR / pt-PT / fr / de / it / ru / uk / pl / nl / ar / hi / vi / th / tl / fi / sv / he / id) — 추가 X. 영어 fallback (next-intl 기본 동작) — `feedback_translation_guide_for_agents` 별 cycle 에서 처리.
8. **Tests**:
   - `src/__tests__/dashboard/redesign/sidebar.test.ts` — NAV_GROUPS structure (15 items 구성, 3 groups, label keys 모두 존재)
   - `src/__tests__/dashboard/redesign/conflict-card.test.tsx` — severity 3-tier render
   - `src/__tests__/dashboard/redesign/empty-state.test.tsx` — 3 illustration kinds + cta optional
   - `src/__tests__/dashboard/redesign/workspace-shell.test.tsx` — tab dispatch, default tab, router param sync
   - `src/__tests__/i18n/dashboard-keys.test.ts` — en master 의 모든 dashboard.* key 가 ko/ja/zh-hans/zh-hant 사전에도 존재 확인
9. **1차 cycle backwards-compat**: `src/components/landing/author-flagship-landing.tsx` 등 1차 cycle 산출물의 컴포넌트들이 그대로 작동하는지 확인 (tests 회귀 X). 1차 cycle 의 `buildAuthorNavigationGroups` 는 deprecation 코멘트만 추가 (실제 제거 X).
10. `npm run verify:knot-separation` 통과 확인 (KNOT 식별자 leakage X).

### Files

- `src/i18n/dictionaries/en.json` (~70 keys 추가)
- `src/i18n/dictionaries/ko.json` (~70 keys 번역)
- `src/i18n/dictionaries/ja.json` (~70 keys 번역)
- `src/i18n/dictionaries/zh-hans.json` (~70 keys 번역)
- `src/i18n/dictionaries/zh-hant.json` (~70 keys 번역)
- `src/__tests__/dashboard/redesign/sidebar.test.ts` (~50 lines)
- `src/__tests__/dashboard/redesign/conflict-card.test.tsx` (~80 lines)
- `src/__tests__/dashboard/redesign/empty-state.test.tsx` (~60 lines)
- `src/__tests__/dashboard/redesign/workspace-shell.test.tsx` (~120 lines)
- `src/__tests__/i18n/dashboard-keys.test.ts` (~60 lines)

### Verify gate

- [ ] `npm run typecheck` exit 0
- [ ] `npm run lint` exit 0
- [ ] `npm run test:run` 100% pass (회귀 X · 신규 ~5 file 테스트 모두 pass)
- [ ] `npm run verify:knot-separation` 통과
- [ ] en.json 의 모든 신규 dashboard.* key 가 ko / ja / zh-hans / zh-hant 4 사전에도 존재 (test 통과)
- [ ] 1차 cycle 산출물 (`buildAuthorNavigationGroups`, author-flagship-landing) 컴파일 + 테스트 통과
- [ ] author-landing tests 17/17 통과 (1차 cycle 회귀 X)

### Commit

분리 권장 (2 sub-commits):
1. `feat(i18n): add ~70 dashboard.* keys (en master + ko/ja/zh-hans/zh-hant)`
2. `test(dashboard): add redesign component tests (sidebar/conflict-card/empty-state/workspace-shell + i18n integrity)`

**Verify gate pass → 자동 stop. Phase 8 은 인간 작업. Fail → stop and report.**

---

## Phase 8 — PR + production verify (수동, 인간 작업)

**Goal**: PR 생성·머지·Vercel production deploy 확인.

### Steps (사용자 / 인간 작업)

1. `git push -u origin feat/author-dashboard-redesign-2nd`
2. `gh pr create --title "feat(dashboard): 2nd UX rebrand cycle — Author-first redesign" --body "..."` (body = task pack 요약 + 합격 기준 13 items + 스크린샷)
3. PR review (사용자 self + optional 외부 review)
4. `gh pr merge <N> --squash`
5. Vercel production auto-deploy 트리거 확인 (`vercel ls --scope litheon`)
6. `https://www.seizn.com/dashboard` 접속 → `/dashboard/author` 자동 redirect 확인
7. Sidebar 15 items · WorkspaceSwitcher · MemoryHealth · 3 view tabs (Inbox / Characters / Graph) 작동 확인
8. `https://www.seizn.com/dashboard/_legacy/<route>` 직접 접근 → page 정상 렌더 확인 (sidebar 비노출 확인)
9. KO locale (`/ko/dashboard?` — locale prefix 정책 확인 필요) 한국어 라벨 확인
10. dogfood — 사용자 1명 (founding member candidate) 첫 인상 collect

### Verify gate

- [ ] PR merged
- [ ] Vercel production deploy Ready
- [ ] `/dashboard` redirect → `/dashboard/author` 정상
- [ ] Sidebar 15 items 정확
- [ ] MemoryHealth indicator 'synced' 표시
- [ ] 3 view tab (Inbox / Characters / Graph) 모두 render
- [ ] Legacy route 24개 sidebar 비노출 + URL 직접 접근 OK
- [ ] author-landing 회귀 X (시각 + 테스트)
- [ ] dogfood 1명 confirm "첫 화면이 작가 워크스페이스로 느껴진다"

---

## Failure-mode notes

- **Phase 1 token name collision**: 새 토큰 (`--sev-p1-bg` 등) 이 이미 V1 ink palette 에 있으면 stop, 사용자 confirm 받고 namespace `--dashboard-sev-*` 등으로 변경.
- **Phase 2 primitives 중복**: 기존 `src/components/ui/*` 또는 `src/components/dashboard/*` 에 같은 이름 컴포넌트 (`Tag` / `Avatar` 등) 가 있을 수 있음. `redesign/` namespace 격리로 해결되지만, import path 혼동 risk. 모든 redesign import 는 `@/components/dashboard/redesign/...` 절대 경로 명시.
- **Phase 3 sidebar 빈 화면**: `usePathname()` SSR 시 null 반환. `useEffect` 안으로 dispatch 이동 또는 default fallback 명시 (1차 cycle 의 `feat/npc-memory-pivot-ui-rebrand` Phase 3 failure mode 참조).
- **Phase 5 react-flow / SVG ssr error**: `'use client'` directive 누락. 모든 interactive view (InboxView / CharactersView / GraphView / WorkspaceShell) top 에 명시.
- **Phase 5 Newsreader font 가 다른 surface 에 leakage**: `next/font` 가 root layout 에 import 되면 글로벌 적용. WorkspaceShell 안에서만 `className={newsreader.variable}` 적용 — 외부로 새지 않게 격리. tokens.css 의 `--font-display-serif` 는 fallback chain 로만 (`var(--font-display-loaded, 'Newsreader', Georgia, serif)`).
- **Phase 6 routing infinite loop**: `/dashboard` → `/dashboard/author` redirect 인데 `/dashboard/author` 자체가 다시 `/dashboard` 로 redirect 되면 무한. middleware 와 page.tsx 의 redirect 로직 둘 다 확인 — 단방향 확실히.
- **Phase 6 internal link 누락**: legacy route 로의 link 가 22+ 곳 (Footer / docs / generic landing). `Grep -r "/dashboard/<route>"` 일괄 grep 후 update. 일부는 의도적으로 legacy URL 노출 (admin / debugging) — 사용자 confirm 받기.
- **Phase 7 i18n key collision**: `dashboard.brand.tagline` 같은 기존 키와 충돌. 사전 추가 전 `grep -r "dashboard.nav.groups.workspace" src/i18n/` 등으로 collision 검사. 충돌 시 namespace 변경 (`dashboard.v2.nav.*`) 후 spec reference update.
- **Phase 7 ko 번역의 어색함**: 메뉴 라벨 "인박스" vs "받은 함" — 작가 어휘 우선 ("인박스" 가 한국 작가에게 더 명료, KO IT 익숙). 결정 못할 때 (ko/ja/zh) Memory MEMORY 의 `feedback_translation_guide_for_agents` reference 따름.
- **Verify gate 통과했지만 의미적으로 잘못된 변경 누적**: 자동 진행 중에 발견 어려움. Phase 7 완료 후 사용자가 git log + diff 검토 → 잘못된 phase 부터 commit revert + dispatch header `§Phase N → §Phase 7` 부분만 실패 phase 번호로 교체 후 재실행.

## Anti-goals (do NOT do these)

- Do not modify `src/lib/author/ui/service.ts`, `src/lib/author/ui/store.ts`, `src/lib/author/ui/supabase-store.ts` — persistence cycle territory.
- Do not modify any file under `supabase/migrations/`.
- Do not modify `src/lib/author/audit/logger.ts` 또는 audit log 마이그레이션.
- Do not delete legacy route code — `git mv` 만 (`_legacy/` 격리, 코드 보존).
- Do not modify `src/components/landing/author-flagship-landing.tsx` 또는 `src/components/landing/*` (1차 cycle 산출물·Author flagship landing은 별 surface).
- Do not modify `src/app/engine/*` (engine surface — dual-surface separation strict).
- Do not modify `src/app/[locale]/*` outside dashboard scope (`/[locale]/legal/*`, `/[locale]/pricing/*`, `/[locale]/docs/*` 등).
- Do not modify auth flow (`src/app/(auth)/*`, NextAuth config, `src/app/api/auth/*`).
- Do not modify Stripe checkout / billing flow.
- Do not introduce KNOT identifiers (`char.sori`, `knot.short1`, `청학여`, `소리`, `레이카` 등) anywhere. Use only Saebyeok sample IP names from design source (`Midnight City`, `Seoyun`, `Doyoon`, `Jin`, `Minho`, `Yeonsu`, `Mrs. Han`, `Sunwoo`).
- Do not use double quotes (`"`) in user-facing Korean text. Single quotes (`'`) only — `feedback_no_double_quotes`.
- Do not introduce engine surface 디자인 cue: cosmic dark background · violet (`#7C3AED`) / cyan (`#22D3EE`) accent · JetBrains Mono dominant · orbiting graph · season tier (Spring/Summer/Fall/Winter) · "NPC" 어휘 · "memory infrastructure" 어휘 · "SDK" 어휘.
- Do not introduce a new env var (no `AUTHOR_DASHBOARD_REDESIGN=...` 류 토글).
- Do not skip a verify gate to keep moving.
- Do not change route signatures of `/api/author/*` endpoints (Phase 5 의 view hooks 는 기존 endpoint 만 호출, 없는 endpoint 는 mock fallback + TODO 코멘트).
- Do not delete `buildNavigationGroups` (legacy nav builder) 또는 `buildAuthorNavigationGroups` (1차 cycle nav builder) — backwards-compat 유지. Phase 6 dispatch logic 으로만 신구 sidebar 분기.
- Do not add a translation pass for the other 17 locales — en/ko/ja/zh-hans/zh-hant 5개만. 영어 fallback 허용. 별 cycle 에서 17 locale 추가.

---

## Appendix A — Design source file index

| 파일 | role | Phase 적용 |
|---|---|---|
| `tokens.css` | V1 ink + severity tokens + Newsreader serif | Phase 1 |
| `primitives.jsx` | 35+ icons + MOCK data + Tag · Avatar · KBD · Skel | Phase 2 |
| `polish.jsx` | ConflictCard v2 · EmptyState · EmptyIllustration · SkeletonInbox | Phase 2 |
| `sidebar.jsx` | NAV 15 items · WorkspaceSwitcher · MemoryHealth · UserCard · Sidebar shell | Phase 3 |
| `topbar.jsx` | TopBar (breadcrumb + Command + Bell + Write CTA) + iconBtn helper | Phase 4 |
| `view-inbox.jsx` | InboxView (3-pane) · PriorityDot · InboxRow · InboxDetail | Phase 5 |
| `view-characters.jsx` | CharactersView (register table + detail panel) | Phase 5 |
| `view-graph.jsx` | GraphView (SVG relationship graph + legend + zoom + detail) | Phase 5 |
| `workspace.jsx` | WorkspaceShell composer + TweaksPanel + ConflictsView + SimulateEmpty + FallbackView | Phase 5 |
| `Seizn Author Dashboard.html` | Design canvas (3 hero variations + 3 tab details + polish + conflicts + rationale) | Reference 전체 |
| `SOURCE_README.md` | claude.ai Designer handoff README | Pre-flight |
| `DESIGNER_CHAT.md` | 디자이너 ↔ 사용자 conversation transcript | Pre-flight |

## Appendix B — Brief 미정 4 routes disposition rationale

| route | disposition | rationale |
|---|---|---|
| `/dashboard/canon` | `_legacy/canon/` | NPC 시절 canon viewer. Author canon graph 는 `/dashboard/author?tab=characters` 와 `?tab=graph` 안에서 expose. 별도 canon 페이지 불필요 |
| `/dashboard/replay` | keep · sidebar Memory > Replay | Author replay 흐름 유효. NPC replay 잔재가 같은 페이지에 있다면 별 micro-cycle 에서 정리 |
| `/dashboard/story-health` | `_legacy/story-health/` | 이름은 Author스럽지만 NPC SDK 시절 health metrics 구현. Author 전용 새로 (별 cycle, W8+) |
| `/dashboard/privacy` | `/dashboard/account/privacy/` | RTBF / DSR Author 도 필수. Account group sub-page (sidebar 비노출, Settings 안 link 만). brief Appendix A 의 'review' 항목 |

## Appendix C — Acceptance criteria (brief §13 13-items 정합)

- [ ] `/dashboard` 기본 진입 = `/dashboard/author` 자동 redirect (Author plan user) — Phase 6
- [ ] NPC SDK 시절 24+ routes 모두 `/dashboard/_legacy/*` 로 이동·sidebar 비노출 — Phase 6
- [ ] Sidebar nav = Workspace 8 + Memory 4 + Account 3 (15 items) — Phase 3
- [ ] 1차 UX rebrand 산출물 visual polish 완료 (ConflictCard v2 · EmptyState · 관계 그래프 polish) — Phase 2 + Phase 5
- [ ] dual-surface separation strict — NPC 어휘·engine 톤 cue 0건 — Anti-goals
- [ ] 디자이너 prototype = English master · ko/ja/zh-hans/zh-hant 4 우선 locale 번역 + 영어 fallback 17 locale — Phase 7
- [ ] Mobile responsive (full mobile rebuild 아닌 desktop fallback OK) — Phase 5 (responsive media query)
- [ ] Persistence env (`AUTHOR_UI_STORE=supabase`) 그대로 작동 — Anti-goals (service.ts 변경 X)
- [ ] Vercel auto-deploy production 정상 — Phase 8
- [ ] `tsc --noEmit` exit 0 — Phase 0~7 verify gate
- [ ] eslint clean — Phase 0~7 verify gate
- [ ] 기존 tests 100% pass (회귀 X) — Phase 7
- [ ] founding member 1명 dogfood "처음 화면이 작가 워크스페이스로 느껴진다" — Phase 8
