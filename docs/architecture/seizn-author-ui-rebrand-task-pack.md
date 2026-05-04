# Author UI Rebrand — Task Pack

Status: ready for Codex execution
Owner: handoff written 2026-05-04
Companion design spec: [`seizn-author-ui-rebrand-spec.md`](../design/seizn-author-ui-rebrand-spec.md)
Sister cycle (persistence, prerequisite): [`seizn-author-memory-v3-persistence-task-pack.md`](./seizn-author-memory-v3-persistence-task-pack.md)

## How to use this document

자동 순차 진행 모드. 단일 Codex run 으로 Phase 0~7 (코드 작업 전체) 를
연달아 실행. Phase 8 은 수동 (Vercel preview + PR).

각 phase:

1. Phase 섹션 read.
2. 참조된 spec 섹션 read.
3. Steps 실행 + 정해진 commit 단위로 commit.
4. Verify gate 평가.
5. **Gate pass → 즉시 다음 phase 진입.** 보고 없이 진행.
6. **Gate fail → 즉시 stop, 실패 phase·gate·로그 보고, Phase 7 완료까지 자동 진행 중단.**
7. Phase 7 완료 → 자동 stop (Phase 8 은 codex 권한 밖).

병렬 금지 — 항상 sequential. cross-task 오염 방지
(`feedback_codex_sequential_execution` 정합).

verify gate 가 안전망. 실패하지 않은 phase 는 묻지 않고 진행.

### Dispatch header (단 1회)

```
작업 디렉토리: C:/Users/admin/Projects/seizn
실행 대상: C:/Users/admin/Projects/seizn/docs/architecture/seizn-author-ui-rebrand-task-pack.md §Phase 0 → §Phase 7 순차 자동
지침: Phase 0부터 시작. 각 phase verify gate 통과 시 다음 phase 즉시 진입.
      verify gate 실패 시 즉시 stop, 실패 phase·gate·로그 보고.
      Phase 7 완료 후 자동 stop (Phase 8 Vercel preview + PR 은 인간 작업).
      병렬 실행 금지·순차만 (feedback_codex_sequential_execution 정합).
      각 phase 의 commit 양식 준수. 한 phase = 정해진 commit 단위.
      KNOT 식별자 (char.sori·knot.short1·청학여 등) 절대 추가 금지.
      예시는 Saebyeok sample IP (한이슬·세린·하나) 만 사용.
      공개 텍스트에 큰따옴표 금지 (작은따옴표만).
```

The agent must not invent extra phases or skip the verify gate to keep moving.

### Commit message convention

- One commit per phase boundary.
- Format: `<type>(<scope>): <imperative summary>`
- Scopes used: `author`, `dashboard`, `i18n`
- Types used: `feat`, `refactor`, `chore`
- Example: `feat(i18n): add author.* dictionary keys for ko/en`

No emoji, no Co-Authored-By footer unless requested.

## Pre-flight checklist (before Phase 0)

- [ ] Working directory is `C:/Users/admin/Projects/seizn`.
- [ ] On branch `feat/npc-memory-pivot-persistence` (UX rebrand cuts from
      this branch to inherit the Phase 2 lint hotfix `8c1d28c2` and the
      persistence work).
- [ ] `git status` clean.
- [ ] `npm install` already run (no missing deps).
- [ ] `npm run verify:knot-separation` passes baseline.

> Why cut from `feat/npc-memory-pivot-persistence` and not base: the
> persistence branch already contains the lint regression hotfix. After the
> persistence PR merges to `feat/npc-memory-pivot`, this branch needs a
> `git rebase feat/npc-memory-pivot` once. No file overlap with persistence
> work (service.ts is not touched here).

---

## Phase 0 — Branch + baseline

**Goal:** Cut the working branch and confirm the baseline is green.

### Steps

1. `git checkout -b feat/npc-memory-pivot-ui-rebrand`
   (off `feat/npc-memory-pivot-persistence`).
2. `npm run typecheck`
3. `npm run lint`
4. `npm run test:run`
5. `npm run verify:knot-separation`
6. Read spec §1, §2, §10 to load context.

### Verify gate

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test:run` passes
- [ ] `npm run verify:knot-separation` passes
- [ ] `git status` clean
- [ ] No commit yet — branch is the only artifact

**Verify gate pass → Phase 1 자동 진행. Fail → stop and report.**

---

## Phase 1 — i18n dictionaries (~130 keys)

**Goal:** Land the `author.*` key tree in `ko.json` and `en.json` upfront so
later phases can reference them without redo.

**Reference:** Spec §10 (key hierarchy), §10.1 (Korean style notes).
Per-key Korean values come from the tables in spec §3 through §11.

### Steps

1. Open `src/i18n/dictionaries/ko.json` and add an `author` top-level node
   under the existing tree. Copy every key listed in spec §3 through §11
   with the Korean value from the spec tables. Required key groups:

   - `author.tabs.<id>` (8) + `author.tabs.<id>.subline` (8) — spec §4
   - `author.cards.<slot>` (6) + `author.cards.<slot>.descriptor` (6) — spec §5
   - `author.table.imports.columns.<col>` (7) — spec §6.2
   - `author.table.imports.parse_status.<value>` (4) — spec §6.2
   - `author.table.imports.extract_status.<value>` (4) — spec §6.2
   - `author.table.imports.source_role.<value>` (5) — spec §6.2
   - `author.table.candidates.columns.<col>` (5) — spec §6.3
   - `author.table.candidates.type.<value>` (6) — spec §6.3
   - `author.table.candidates.status.<value>` (10) — spec §6.3
   - `author.table.characters.columns.<col>` (4) — spec §6.4
   - `author.table.graph.columns.<col>` (5) — spec §6.5
   - `author.table.timeline.columns.<col>` (4) — spec §6.6
   - `author.table.audit.columns.<col>` (6) — spec §6.8
   - `author.empty.<screen>.title|body|cta` (10 screens × 3 fields) — spec §7
   - `author.graph.bands.<band>` (7) — spec §8.4
   - `author.graph.relation.<key>` (9) — spec §8.5
   - `author.graph.view.diagram` / `author.graph.view.table` — spec §8.2
   - `author.graph.unknown_name` / `author.graph.unknown_relation` — spec §8.3, §8.5
   - `author.conflict.severity.<value>` (3) — spec §9.3
   - `author.conflict.status.<value>` (2) — spec §9.3
   - `author.conflict.actions.<key>` (4) — spec §9.3
   - `author.conflict.title` / `author.conflict.reasoning_title` /
     `author.conflict.impact_title` / `author.conflict.impact_fallback` /
     `author.conflict.undo` — spec §9.2, §9.3
   - `author.events.<event_type>` (16) — spec §6.8
   - `author.actions.generate_backlog` / `author.actions.run_scene` /
     `author.actions.upload` — spec §11
   - `author.toasts.review_queue_updated` / `author.toasts.uploading` /
     `author.toasts.ai_generating` — spec §11
   - `author.panels.inbox` / `author.panels.review` — spec §11
   - `dashboard.nav.author.workspace` /
     `dashboard.nav.author.groups.work` /
     `dashboard.nav.author.groups.account` /
     `dashboard.nav.author.<item>` (8 tab items + usage + byok + settings) — spec §3.2
   - `dashboard.nav.memory.author_memory` — spec §11 (kept for non-author
     surface, replaces the hardcoded `Author Memory` literal)

2. Open `src/i18n/dictionaries/en.json` and add the same key tree with the
   existing English literals as values (`author.tabs.inbox` → `'Inbox'`,
   etc.). Where no English equivalent exists in the current code, write a
   sensible English fallback.

3. Other 20 locale files: do **not** edit. They auto-fall-back to `en.json`
   per the existing dictionary loader. The standard translation pass picks
   them up later.

4. Style guard for the Korean values:
   - Single quotes only (no `"` in any value). `feedback_no_double_quotes`.
   - 외래어 음차 최소화 — 인박스 → 받은 자료, 시뮬레이션 → 장면 미리보기,
     캐스트 → 인물.
   - Empty-state body: 친근한 `~예요·~어요` 톤.
   - 숫자 단위는 띄어쓰기 후 한국어 단위 (`12 건`, `4 명`, `7 일`).

### Verify gate

- [ ] `npm run typecheck` passes (JSON imports type-check cleanly)
- [ ] `node -e "JSON.parse(require('fs').readFileSync('src/i18n/dictionaries/ko.json'))"`
      exits 0 (sanity JSON parse)
- [ ] Same for `en.json`
- [ ] `npm run verify:knot-separation` passes (no KNOT identifiers leak in)
- [ ] No double quotes in any added Korean value:
      `npm run lint` covers this implicitly via no-restricted-syntax if
      configured; otherwise visually verify the diff
- [ ] One commit: `feat(i18n): add author.* dictionary keys for ko/en`

**Verify gate pass → Phase 2 자동 진행. Fail → stop and report.**

---

## Phase 2 — Shared primitives

**Goal:** Add the cross-cutting primitives (`<EmptyState>` + `useCharacterNameMap`)
before any screen consumes them.

**Reference:** Spec §7 (EmptyState shape + style), §8.7 (character lookup).

### Steps

1. Create `src/components/author/empty-state.tsx`:
   - Props: `title: string`, `body: string`, `icon?: ReactNode`,
     `cta?: { label: string; onClick: () => void }`.
   - Container: existing dashed-border style from the current
     `'No rows'` placeholder in `author-memory-v3-client.tsx`.
   - Layout: icon (24px, `text-slate-400`) → title (`text-base
     font-medium text-slate-700`) → body (`text-sm text-slate-600` max
     width 480px) → optional CTA button.
   - CTA uses the existing button primitive (no new style).

2. Create `src/hooks/useCharacterNameMap.ts`:
   - Signature: `useCharacterNameMap(projectId: string): Map<string, string>`.
   - Reads `state.characterDetailsByProject[projectId]` from the existing
     author state hook (whichever store-of-record exists at the call site).
   - Returns a memoized `Map<characterId, name>`. Recomputes only when the
     character list changes.
   - Fallback behavior is the consumer's responsibility — the hook just
     returns whatever the source dictionary has.

3. No screen consumes these yet. Pure additions.

### Verify gate

- [ ] `npm run typecheck` passes
- [ ] `npm run lint -- src/components/author/empty-state.tsx src/hooks/useCharacterNameMap.ts`
      passes
- [ ] `npm run test:run` passes (no behavior change to existing screens)
- [ ] One commit: `feat(author): add EmptyState and useCharacterNameMap primitives`

**Verify gate pass → Phase 3 자동 진행. Fail → stop and report.**

---

## Phase 3 — Sidebar persona dispatch

**Goal:** Author-only sidebar via `buildAuthorNavigationGroups` + route
prefix dispatch in `DashboardShell`.

**Reference:** Spec §3.

### Steps

1. Open `src/components/dashboard/navigation.ts`:
   - Add `buildAuthorNavigationGroups(t)` per spec §3.2 (verbatim shape).
   - Replace the hardcoded `'Author Memory'` literal at
     [`navigation.ts:79`](../../src/components/dashboard/navigation.ts#L79)
     with `t('dashboard.nav.memory.author_memory')`.
   - Keep `buildNavigationGroups` (the legacy non-author builder) intact.
   - Reuse the existing icon imports; add `BookIcon`, `FileTextIcon`,
     `RefreshCwIcon`, `UserRoundIcon`, `GitBranchIcon`, `Clock3Icon`,
     `AlertTriangleIcon`, `PlayIcon`, `ScrollTextIcon`, `BarChart3Icon`,
     `KeyIcon`, `SettingsIcon` from `lucide-react` if not already imported.

2. Open `src/components/dashboard/DashboardShell.tsx`:
   - At the call site that invokes `buildNavigationGroups(t)`, derive
     `isAuthorSurface` per spec §3.3:
     ```ts
     const isAuthorSurface = pathname.startsWith('/dashboard/author')
       || pathname.startsWith('/dashboard/settings/author')
       || pathname.startsWith('/dashboard/settings/byok');
     const groups = isAuthorSurface
       ? buildAuthorNavigationGroups(t)
       : buildNavigationGroups(t);
     ```
   - `pathname` already comes from `usePathname()` — verify the existing
     import. If `usePathname` is not in scope, add `import { usePathname }
     from 'next/navigation';` and ensure `'use client'` is at the top.

3. Do not touch any other navigation consumers.

### Verify gate

- [ ] `npm run typecheck` passes
- [ ] `npm run lint -- src/components/dashboard/navigation.ts src/components/dashboard/DashboardShell.tsx`
      passes
- [ ] `npm run test:run` passes
- [ ] Visual smoke is deferred to the human; agent does not run dev server
- [ ] One commit: `feat(dashboard): dispatch author-only sidebar by route prefix`

**Verify gate pass → Phase 4 자동 진행. Fail → stop and report.**

---

## Phase 4 — Tabs, cards, panel actions, empty states

**Goal:** Localize `screens` array, `Metric` cards, panel titles, action
buttons, toasts. Wire `<EmptyState>` into Inbox / Review / Characters /
Timeline / Audit screens.

**Reference:** Spec §4, §5, §7 (rows for inbox/review/characters/timeline/audit
empty states), §11.

### Steps

1. Open `src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx`:

2. Replace each `screens` array entry (lines ~40–48) `label: 'Inbox'` with
   `label: t('author.tabs.inbox')`. Same for the other 7 tab ids.

3. Below the active tab heading, render the tab subline:
   ```tsx
   <p className='text-sm text-slate-500'>
     {t(`author.tabs.${activeTabId}.subline`)}
   </p>
   ```
   Place between the heading and the tab body.

4. Update the `Metric` component (lines ~381–390):
   - Add an optional prop `descriptor?: string`.
   - Render `descriptor` under the value at `text-xs text-slate-500`.
   - Drop the `uppercase` class from the label; keep `text-xs tracking-normal`.

5. Replace each of the 6 `<Metric label='...' />` invocations (lines ~107–117)
   with:
   ```tsx
   <Metric
     label={t('author.cards.imports')}
     value={state.imports.length}
     descriptor={t('author.cards.imports.descriptor')}
   />
   ```
   Repeat for `candidates`, `characters`, `conflicts`, `edges`, `events`.

6. Localize panel titles and action buttons per spec §11 table:
   - `'Document Inbox'` → `t('author.panels.inbox')`
   - `'Review Queue'` → `t('author.panels.review')`
   - `'Generate backlog'` button → `t('author.actions.generate_backlog')`
   - `'Run Scene'` button → `t('author.actions.run_scene')`
   - `'Upload'` button → `t('author.actions.upload')`
   - `'Uploading…'` toast → `t('author.toasts.uploading')`
   - `'Review Queue updated'` toast → `t('author.toasts.review_queue_updated')`
   - `'AI가 생성 중…'` → `t('author.toasts.ai_generating')`

7. Wire `<EmptyState>` into the screens that have a possible empty list.
   For each, replace the existing `'No rows'` / `업로드된 파일이 없습니다.` /
   `'Run a scene to generate candidate thoughts...'` /
   `'No audit events recorded yet.'` placeholders with:
   ```tsx
   <EmptyState
     title={t('author.empty.inbox.title')}
     body={t('author.empty.inbox.body')}
     cta={{ label: t('author.empty.inbox.cta'), onClick: openUploadDialog }}
   />
   ```
   Screens to wire in this phase: `inbox`, `review`, `characters`,
   `timeline`, `audit`. Conflicts empty goes in Phase 6, graph empty goes
   in Phase 7.

8. For screens with a `parsing in progress` state (Inbox), branch on the
   import status: if every import has `parse_status === 'parsing'`, render
   the `inbox.parsing` empty state instead of `inbox.empty`.

### Verify gate

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes (full lint, not just touched files — Phase 2
      lint regression must not recur)
- [ ] `npm run test:run` passes
- [ ] No remaining English literals in `author-memory-v3-client.tsx` for
      tabs, cards, panel titles, the action buttons listed above. Tables,
      conflicts, graph English literals are out of scope until later phases.
- [ ] One commit: `feat(author): localize tabs, cards, panels, and primary empty states`

**Verify gate pass → Phase 5 자동 진행. Fail → stop and report.**

---

## Phase 5 — Tables: column-spec form + enum mapping

**Goal:** Refactor `Rows` to take a `table` key + column list, resolve
headers via i18n, and map enum cell values to Korean.

**Reference:** Spec §6.

### Steps

1. Open the `Rows` component
   ([`author-memory-v3-client.tsx:351-378`](../../src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx#L351-L378)).
   Change the signature from:
   ```ts
   function Rows({ rows, columns }: { rows: any[]; columns: string[] })
   ```
   to:
   ```ts
   function Rows({ rows, columns, table, cellRenderers }: {
     rows: any[];
     columns: string[];
     table: 'imports' | 'candidates' | 'characters' | 'graph' | 'timeline' | 'audit';
     cellRenderers?: Record<string, (value: any, row: any) => ReactNode>;
   })
   ```

2. Header rendering: replace the auto-humanize path
   (`col.replaceAll('_', ' ')`) with `t(\`author.table.${table}.columns.${col}\`)`.

3. Cell rendering: when `cellRenderers[col]` is defined, use it; else fall
   back to the raw value (toString). The cellRenderers prop carries the
   per-table enum maps and confidence-bar rendering.

4. Build per-table column constants in a sibling module
   `src/app/(dashboard)/dashboard/author/table-specs.ts`:
   ```ts
   export const IMPORT_COLUMNS = ['file_name', 'source_role', 'parse_status', 'extract_status', 'candidate_count', 'parsed_text_preview', 'error_message'] as const;
   export const CANDIDATE_COLUMNS = ['type', 'status', 'confidence', 'content'] as const;
   export const CHARACTER_COLUMNS = ['name', 'summary', 'scope', 'aliases'] as const;
   export const TIMELINE_COLUMNS = ['day', 'date', 'where', 'what'] as const;
   export const AUDIT_COLUMNS = ['event', 'created', 'decision', 'llm', 'payload', 'replay'] as const;
   ```

5. Build cell renderers per table:

   **Imports** — wrap status fields in i18n lookup:
   ```ts
   const importCellRenderers = {
     parse_status: (v: string) => t(`author.table.imports.parse_status.${v}`),
     extract_status: (v: string) => t(`author.table.imports.extract_status.${v}`),
     source_role: (v: string) => t(`author.table.imports.source_role.${v}`),
   };
   ```

   **Candidates** — type + status enum + confidence bar:
   ```ts
   const candidateCellRenderers = {
     type: (v: string) => t(`author.table.candidates.type.${v}`),
     status: (v: string) => (
       <StatusBadge status={v} label={t(`author.table.candidates.status.${v}`)} />
     ),
     confidence: (v: number) => <ConfidenceBar value={v} />,
   };
   ```
   `StatusBadge` and `ConfidenceBar` are inline components in the same file
   (no need for separate modules at this scale). Color palette from spec
   §6.3 status table.

   **Characters** — `aliases` joined by `, `:
   ```ts
   const characterCellRenderers = {
     aliases: (v: string[] | undefined) => (v ?? []).join(', '),
   };
   ```

   **Timeline** — `day` rendered as-is (`D1`, `D2`); no enum mapping.

   **Audit** — `event` mapped via `t(\`author.events.${v}\`)`.

6. Replace each call site:
   ```tsx
   <Rows
     rows={imports}
     columns={IMPORT_COLUMNS}
     table='imports'
     cellRenderers={importCellRenderers}
   />
   ```
   Repeat for candidates, characters, timeline, audit.

7. Update `src/components/author/audit-log-view.tsx` similarly: replace
   hardcoded English column headers with `t('author.table.audit.columns.<col>')`,
   and the event cell with `t(\`author.events.${row.event}\`)`.

8. The graph edges table is rebuilt in Phase 7. Leave it untouched here.

9. The conflicts table is dropped in Phase 6. Leave it untouched here.

### Verify gate

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test:run` passes (existing render tests still green)
- [ ] No raw `replaceAll('_', ' ')` path remains in `Rows`
- [ ] Audit log table renders Korean column headers in dev (not verified
      by agent — gate is structural)
- [ ] One commit: `feat(author): refactor tables to column-spec form with enum mapping`

**Verify gate pass → Phase 6 자동 진행. Fail → stop and report.**

---

## Phase 6 — Conflicts UI: card list + 1-click resolve

**Goal:** Drop the generic conflicts table. Replace with a card stack that
cites the offending rule, shows two-column comparison, and exposes four
resolution buttons. Extend the resolve route to accept the new decision
enum values.

**Reference:** Spec §9.

### Steps

1. Create `src/components/author/conflicts/conflict-card.tsx`:
   - Props: `conflict: AuthorUiConflict`, `characterNameMap: Map<string, string>`,
     `onResolve: (decision: ConflictDecision, payload?: ConflictPayload) => void`.
   - `ConflictDecision = 'keep_existing' | 'replace_with_new' | 'defer_both' | 'custom'`.
   - `ConflictPayload = { text?: string; edits?: Record<string, unknown> }`.
   - Layout per spec §9.2 ASCII mock:
     - Header row: severity badge + status badge + detected timestamp
       (`YYYY-MM-DD HH:mm` Asia/Seoul).
     - Title: `〈{characterName}〉의 {dimension} — 캐논과 새 사실 충돌`.
       Resolve `characterName` via `characterNameMap.get(conflict.affected_entities[0])`
       with fallback to the raw id.
     - Two-column comparison block (left = `existing_fact`, right = `new_fact`)
       with the four fields from spec §9.3 (Quote, Citation, Source file,
       Confidence percent).
     - Reasoning block: `llm_analysis` if present, else default text from
       `suggested_relationship` (`contradicts` → `'정반대 진술입니다.'`,
       `scope_diff` → `'같은 사실인데 적용 범위가 다릅니다.'`).
     - Impact block: render bullets from `affected_entities`. If no
       affected entities, show `t('author.conflict.impact_fallback')`.
     - Action row: 4 buttons in this order — `기존 캐논 유지` /
       `새 사실로 교체` / `둘 다 보류` / `직접 수정`. The last opens a modal.
   - When `conflict.resolution` is set, collapse to the one-line summary
     (spec §9.3 last block) with a `되돌리기` button visible for 30 seconds
     (use a `useEffect` timer + local `showUndo` state).

2. Create `src/components/author/conflicts/conflict-list.tsx`:
   - Props: `conflicts: AuthorUiConflict[]`, `projectId: string`.
   - Renders the header summary above the stack (spec §9.4):
     ```
     충돌 4건
     미해결 3건  ·  해결됨 1건
     ```
   - Filter row: status (`전체 · 미해결 · 해결됨`) + severity (`전체 ·
     심각 · 중요 · 낮음`). Local component state.
   - Maps over filtered conflicts and renders `<ConflictCard>` for each.
   - Calls the existing `useResolveAuthorConflict` hook for the `onResolve`
     callback. Pass `projectId` and `conflict.id` through.
   - Empty state: `<EmptyState title={t('author.empty.conflicts.title')}
     body={t('author.empty.conflicts.body')} />` (no CTA per spec §7 row).

3. Replace the old conflicts table render path in
   `author-memory-v3-client.tsx` (around the `'Conflicts'` screen branch)
   with `<ConflictList conflicts={state.conflicts} projectId={projectId} />`.

4. Extend the resolve route handler at
   `src/app/api/projects/[projectId]/conflicts/[conflictId]/resolve/route.ts`
   (or wherever `useResolveAuthorConflict` POSTs to — locate via grep) to
   accept the new `decision` enum:
   - Allowed values: `'keep_existing' | 'replace_with_new' | 'defer_both' | 'custom'`.
   - For `'custom'`, also accept optional `text: string` and
     `edits: Record<string, unknown>` fields.
   - On `'defer_both'`, persist the conflict status as `'deferred'` (add
     this enum value to the conflict status type if not already present).
   - The `conflict.resolved` audit log event still fires on every
     resolution (no change).

5. Add a unit test for the route handler (extend the existing test file
   if one exists; otherwise create a minimal one): each of the 4 decision
   enum values returns 200 + writes the correct resolution payload via the
   mocked store.

### Verify gate

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test:run` passes (new resolve-route test green; existing
      conflicts tests still green)
- [ ] `npm run verify:knot-separation` passes (sample IP names only)
- [ ] No old `<Rows table='conflicts' .../>` render path remains
- [ ] One commit: `feat(author): replace conflicts table with card list and 1-click resolve`

**Verify gate pass → Phase 7 자동 진행. Fail → stop and report.**

---

## Phase 7 — Relationship Graph: dual view (diagram + table)

**Goal:** Replace the generic graph table with a react-flow diagram view
(default) plus a fallback table view (toggle). Edges show qualitative
intensity bands instead of numeric values.

**Reference:** Spec §8.

### Steps

1. Add the `react-flow` dependency:
   - `npm install reactflow` (note: package name is `reactflow`, not
     `react-flow`).
   - Verify the existing `package-lock.json` updates cleanly. Commit the
     lockfile change as part of the phase commit.

2. Create `src/components/author/graph/relationship-graph.tsx`:
   - Props: `nodes: AuthorUiGraphNode[]`, `edges: AuthorUiGraphEdge[]`,
     `characterNameMap: Map<string, string>`.
   - Wrap the import in `next/dynamic` with `ssr: false` from the
     consuming module — react-flow requires the browser. Example:
     ```ts
     const RelationshipGraph = dynamic(
       () => import('@/components/author/graph/relationship-graph'),
       { ssr: false }
     );
     ```
   - Node rendering per spec §8.3:
     - Label: Korean character name from `characterNameMap.get(nodeId)`,
       fallback to `nodeId` with `text-rose-500` color and tooltip
       `t('author.graph.unknown_name')`.
     - Subtitle: scope tag (e.g., `'30일 단편 데모'` for `scope: 'short_demo_30day'`).
     - Color: archetype palette (spec §8.3) — define a config object
       inline at the top of the file:
       ```ts
       const ARCHETYPE_PALETTE = {
         observer: 'slate',
         support: 'indigo',
         antagonist: 'rose',
         lead: 'emerald',
         neutral: 'gray',
       } as const;
       ```
     - Importance: scales node radius from 24px to 40px based on
       `node.importance`.
   - Edge rendering per spec §8.3:
     - No raw IDs visible.
     - No raw numeric intensity visible.
     - Thickness: maps to absolute intensity band (spec §8.4 — 7 bands).
     - Color: per the rules in spec §8.3 (positive trust → emerald,
       positive attachment → rose, negative hostility → rose-700 dashed,
       etc.).
     - Hover tooltip: `{relationship label} · {intensity band} · {dimension breakdown}`.
       Use the band-mapping helper from step 4.

3. Create `src/components/author/graph/relationship-graph-table.tsx`:
   - Renders the same data as a table using the `Rows` component from
     Phase 5 with `table='graph'`.
   - Columns per spec §6.5: `from_name`, `relation`, `to_name`,
     `intensity_band`, `valid_at`.
   - Cell renderers:
     - `from_name` / `to_name`: resolve via `characterNameMap`.
     - `relation`: `t(\`author.graph.relation.${row.type}\`)` with fallback.
     - `intensity_band`: helper from step 4 → Korean band string.
     - `valid_at`: format `YYYY-MM-DD`.

4. Add a small helper module
   `src/lib/author/ui/graph-bands.ts`:
   - Export `intensityBand(value: number): { key: string; label: string }`.
   - Maps the numeric range to one of the 7 bands per spec §8.4.
   - Returns the i18n key (`author.graph.bands.<band>`) and the resolved
     Korean label.

5. Wire the dual view into `author-memory-v3-client.tsx`:
   - On the Graph tab, render a top-right segmented control:
     ```
     [ 그림으로 보기 | 표로 보기 ]
     ```
     (i18n keys `author.graph.view.diagram` / `author.graph.view.table`.)
   - Default view: `diagram`. Stored in component-local state.
   - When `nodes.length === 0`, render `<EmptyState title={t('author.empty.graph.title')}
     body={t('author.empty.graph.body')} />` instead of either view.

6. Keep `getGraph` in `service.ts` unchanged. The diagram and table both
   consume the existing service output; edge intensity numbers stay in
   the data and are only hidden in the rendered UI.

### Verify gate

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test:run` passes
- [ ] `npm run build` passes (react-flow SSR isolation must not break the
      build)
- [ ] `npm run verify:knot-separation` passes
- [ ] `package.json` includes `reactflow` and `package-lock.json` is updated
- [ ] No raw numeric intensity values visible in either render path
- [ ] One commit: `feat(author): add relationship graph diagram and table dual view`

**Verify gate pass → 자동 stop (Phase 8 은 수동, codex 권한 밖).
Fail → stop and report.**

---

## Phase 8 — Vercel preview + PR (manual)

**Goal:** Push the branch, capture preview URL, open the PR. Do not merge.

### Steps

1. Push branch: `git push -u origin feat/npc-memory-pivot-ui-rebrand`.
2. Wait for Vercel preview build to succeed; capture the preview URL.
3. `gh pr create` with:
   - Title: `feat(author): localize Author UI to Korean writer-friendly surface`
   - Body: link to the spec, this task pack, and the dogfood report
     (`~/.codex/private/seizn-dogfood-report-2026-05-03.md` — referenced by
     name only).
   - Test plan: the visual smoke checklist from spec §13.
4. Do **not** merge. Wait for the human's smoke pass on the preview URL.

### Verify gate

- [ ] Branch pushed to origin
- [ ] Preview build green
- [ ] PR open against `feat/npc-memory-pivot` (or whichever base the
      persistence PR landed on)
- [ ] Description references spec + task pack + dogfood report
- [ ] Smoke checklist included in the test plan section
- [ ] CI green (or known-flaky failures noted)

**Stop. Hand off to human.** The user runs the visual smoke from spec §13
in a separate session and files findings as a new dogfood report.

---

## Failure-mode notes

- **Phase 1 i18n key collision:** Adding `author.*` may collide with an
  existing namespace (`author.header.*` etc. already in `ko.json`). If a
  collision is detected during JSON parse or runtime, rename the new keys
  under `author.v2.*` and update the spec reference in the commit message.
  Do not silently overwrite an existing key.
- **Phase 3 sidebar shows nothing on `/dashboard/author`:** `usePathname()`
  returned `null` (SSR). Move the dispatch into a `useEffect` or default
  to the legacy builder when `pathname == null`.
- **Phase 5 enum cell shows the raw key (`'queued'`) instead of Korean:**
  The i18n lookup failed silently. Verify the `author.table.imports.parse_status.<value>`
  keys actually landed in `ko.json` from Phase 1. Fix at the source
  dictionary, not by special-casing the cell renderer.
- **Phase 6 resolve route 400s on `'defer_both'`:** The conflict status
  enum needs the `'deferred'` value added at the type level. Check the
  conflict types definition (likely
  [`src/lib/author/ui/types.ts`](../../src/lib/author/ui/types.ts) or
  similar) and extend the union.
- **Phase 7 build fails with `window is not defined`:** react-flow leaked
  into the SSR bundle. Confirm the `next/dynamic` import has `ssr: false`
  and the wrapping import path matches.
- **Verify gate 통과했지만 의미적으로 잘못된 변경이 누적되는 경우:**
  자동 진행 중에는 발견 어려움. Phase 7 완료 후 사용자가 git log 와 diff
  검토 → 잘못된 추상화 발견 시 phase 별 commit 단위로 revert 후 해당
  phase 부터 재실행 (단일 dispatch 헤더의 `§Phase N → §Phase 7` 부분을
  실패 phase 번호로 교체).

## Anti-goals (do NOT do these)

- Do not modify `src/lib/author/ui/service.ts` (persistence cycle territory;
  this rebrand only consumes existing service methods).
- Do not modify `src/lib/author/ui/store.ts`,
  `src/lib/author/ui/supabase-store.ts`, or any persistence-cycle file.
- Do not modify any file under `supabase/migrations/`.
- Do not modify `docs/knot-input/**`.
- Do not modify `scripts/verify-knot-separation.ts`.
- Do not edit `author_audit_log` migration or `src/lib/author/audit/logger.ts`.
- Do not introduce KNOT identifiers (`char.sori`, `knot.short1`, `청학여`,
  etc.) anywhere in the rebrand. Use only Saebyeok sample IP names
  (`한이슬`, `세린`, `하나`, `다온시`, `새벽고등학교`, `여명 진동`).
- Do not use double quotes (`"`) in any user-facing Korean text. Single
  quotes (`'`) only — `feedback_no_double_quotes`.
- Do not introduce a new env var.
- Do not change route signatures beyond the conflict resolve route's
  `decision` enum extension in Phase 6.
- Do not add a translation pass for the other 20 locales — they
  auto-fall-back to `en.json`. Translation pass is a separate cycle.
- Do not skip a verify gate to keep moving.
