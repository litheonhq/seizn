# Author UI Rebrand Spec

Status: design locked, awaiting Codex execution
Owner: spec written 2026-05-03
Source dogfood report: `~/.codex/private/seizn-dogfood-report-2026-05-03.md` §8 P1 items 1–8
Companion (separate cycle): [seizn-author-memory-v3-persistence-handoff.md](../architecture/seizn-author-memory-v3-persistence-handoff.md) — persistence work runs first; this rebrand layers on top.
Sample IP for examples: Saebyeok Academy (`docs/marketing/sample_ip/`) — synthetic demo data per [saebyeok-readme.md](../marketing/sample_ip/saebyeok-readme.md). All character names, world rules, and relationship examples in this spec come from that sample IP.

---

## 1. Scope

The Author Memory v3 surface (`/dashboard/author`) currently reads as a developer tool: English dev-tone labels, snake_case column headers, raw IDs, numeric edge weights, missing empty states, and a sidebar carrying NPC SDK / Enterprise items irrelevant to authors. The dogfood report flagged eight P1 issues that block 작가 onboarding.

This spec covers:

1. Sidebar — author-only nav via new `buildAuthorNavigationGroups` builder
2. 8 tabs · 6 count cards · 6 table column sets — full Korean copy mapping
3. Empty state copy for every screen with a possible empty list
4. Conflicts UI redesign — offending rule citation + 1-click override
5. Relationship Graph — human-readable nodes, qualitative intensity bands

Out of scope (separate cycles):

- Persistence layer (P0, separate handoff already in flight)
- Stack trace cleanup, broader buffering indicators (P2)
- Multilingual rollout beyond Korean — spec focuses on `ko`; `en` keys remain as fallback. Other locales fill in during the standard translation pass.

## 2. Reference: dogfood findings to address

| # | Finding (dogfood §8 P1) | Spec section |
|---|---|---|
| 1 | Sidebar shows NPC SDK + Enterprise items irrelevant to authors | §3 |
| 2 | 8 tab labels English (Inbox · Review · Characters · Graph · Timeline · Conflicts · Simulate · Audit) | §4 |
| 3 | 6 count cards dev-tone (IMPORTS · CANDIDATES · CHARACTERS · CONFLICTS · EDGES · EVENTS) | §5 |
| 4 | Table columns English + DB-tone (FILE NAME · SOURCE ROLE · PARSE STATUS …) | §6 |
| 5 | Relationship Graph raw IDs + numeric intensity exposed | §8 |
| 6 | Empty state guidance missing across screens | §7 |
| 7 | Conflicts screen UX bare — no offending rule cite, no 1-click override | §9 |
| 8 | 'Generate backlog' English label · 'Review Queue updated' English | §4, §5, §11 |

## 3. Sidebar — `buildAuthorNavigationGroups`

### 3.1 Current state

[`src/components/dashboard/navigation.ts`](../../src/components/dashboard/navigation.ts) exports a single `buildNavigationGroups(t)` function. Every dashboard route — including `/dashboard/author` — sees the full set: Memory, Observe, Govern (with 'For studios'), FinOps, Connect, System. The Memory group has a hardcoded English `Author Memory` item ([navigation.ts:79](../../src/components/dashboard/navigation.ts#L79)) that bypasses i18n entirely.

[`src/components/dashboard/DashboardShell.tsx`](../../src/components/dashboard/DashboardShell.tsx) calls `buildNavigationGroups(t)` once with no persona context.

### 3.2 New builder

Add a parallel builder to `navigation.ts`:

```ts
export function buildAuthorNavigationGroups(t: (key: string) => string): NavGroup[] {
  return [
    {
      key: '',
      label: '',
      items: [
        { label: t('dashboard.nav.author.workspace'), href: '/dashboard/author', icon: BookIcon },
      ],
    },
    {
      key: 'work',
      label: t('dashboard.nav.author.groups.work'),
      defaultOpen: true,
      items: [
        { label: t('dashboard.nav.author.inbox'), href: '/dashboard/author?tab=inbox', icon: FileTextIcon },
        { label: t('dashboard.nav.author.review'), href: '/dashboard/author?tab=review', icon: RefreshCwIcon },
        { label: t('dashboard.nav.author.characters'), href: '/dashboard/author?tab=characters', icon: UserRoundIcon },
        { label: t('dashboard.nav.author.graph'), href: '/dashboard/author?tab=graph', icon: GitBranchIcon },
        { label: t('dashboard.nav.author.timeline'), href: '/dashboard/author?tab=timeline', icon: Clock3Icon },
        { label: t('dashboard.nav.author.conflicts'), href: '/dashboard/author?tab=conflicts', icon: AlertTriangleIcon },
        { label: t('dashboard.nav.author.simulate'), href: '/dashboard/author?tab=simulate', icon: PlayIcon },
        { label: t('dashboard.nav.author.audit'), href: '/dashboard/author?tab=audit', icon: ScrollTextIcon },
      ],
    },
    {
      key: 'account',
      label: t('dashboard.nav.author.groups.account'),
      defaultOpen: false,
      items: [
        { label: t('dashboard.nav.author.usage'), href: '/dashboard/usage', icon: BarChart3Icon },
        { label: t('dashboard.nav.author.byok'), href: '/dashboard/settings/byok', icon: KeyIcon },
        { label: t('dashboard.nav.author.settings'), href: '/dashboard/settings/author', icon: SettingsIcon },
      ],
    },
  ];
}
```

### 3.3 Persona dispatch

`DashboardShell` decides which builder to call based on the active route. Author surface routes use the author builder; everything else keeps the existing builder:

```ts
const isAuthorSurface = pathname.startsWith('/dashboard/author')
  || pathname.startsWith('/dashboard/settings/author')
  || pathname.startsWith('/dashboard/settings/byok');
const groups = isAuthorSurface
  ? buildAuthorNavigationGroups(t)
  : buildNavigationGroups(t);
```

A user toggling between surfaces sees the sidebar redraw — that is the intended signal that they are in a different workspace. No env flag, no role lookup, no DB query.

### 3.4 What this drops for authors

NPC SDK groups (Observe, Govern → 'For studios', FinOps, Connect → API Keys / Webhooks, System → Organizations) disappear from the author sidebar. They remain reachable by typing the URL or bookmarking, so dual-persona power users are not locked out.

### 3.5 What it adds

A flat author-only structure: workspace entry, the eight working tabs as direct links, and a small Account group for usage / BYOK / settings. This collapses the cognitive load and matches the way the eight tabs already organize the work inside the page.

## 4. Tabs — 8 labels

Tab definitions live in [`author-memory-v3-client.tsx:40-48`](../../src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx#L40-L48) as a hardcoded `screens` array. Replace each `label: 'Inbox'` literal with `label: t('author.tabs.inbox')`.

| Tab id | English (current) | Korean (new) | i18n key |
|---|---|---|---|
| `inbox` | Inbox | 받은 자료 | `author.tabs.inbox` |
| `review` | Review | 검토 대기 | `author.tabs.review` |
| `characters` | Characters | 인물 | `author.tabs.characters` |
| `graph` | Graph | 관계도 | `author.tabs.graph` |
| `timeline` | Timeline | 시간선 | `author.tabs.timeline` |
| `conflicts` | Conflicts | 충돌 | `author.tabs.conflicts` |
| `simulate` | Simulate | 장면 미리보기 | `author.tabs.simulate` |
| `audit` | Audit | 결정 기록 | `author.tabs.audit` |

Rationale notes:

- `Simulate` becomes 장면 미리보기 ('scene preview'), not 시뮬레이션. The latter sounds like a stress test; the former tells the writer what the screen does for them.
- `Audit` becomes 결정 기록 ('decision log'), not 감사. 감사 reads as compliance/finance; the screen is a writer-facing changelog of canon decisions.
- `Inbox` becomes 받은 자료 ('received material') because 인박스 is loanword and 받은편지함 reads as email.

### 4.1 Active tab indicator copy

When a tab is active, the page shows `<h1>{tabLabel}</h1>` style heading. Add a sub-line for context per tab:

| Tab | Sub-line copy (i18n key `author.tabs.<id>.subline`) |
|---|---|
| `inbox` | 새로 올린 원고와 자료가 여기에 도착합니다. 파싱이 끝나면 검토 대기로 넘어갑니다. |
| `review` | 추출된 후보 사실을 캐논·보류·반려로 정리합니다. |
| `characters` | 등록된 인물의 목소리·성격·관계를 한눈에 봅니다. |
| `graph` | 인물 사이의 관계를 그림으로 봅니다. |
| `timeline` | 사건이 일어난 날짜 순서로 정리합니다. |
| `conflicts` | 새 사실이 기존 캐논과 부딪히는 지점을 모읍니다. |
| `simulate` | 장면을 미리 돌려서 인물이 무엇을 알고 어떤 대사를 할지 확인합니다. |
| `audit` | 그동안 내린 결정의 기록을 시간 순서로 봅니다. |

## 5. Count cards — 6 metrics

[`author-memory-v3-client.tsx:107-117`](../../src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx#L107-L117) renders six `<Metric label="..." />` calls with hardcoded English labels. Replace with i18n keys and lower the visual shouting (current implementation uses `uppercase tracking-normal text-xs` — keep size, drop `uppercase`).

| Slot | English (current) | Korean (new) | i18n key |
|---|---|---|---|
| 1 | Imports | 받은 자료 | `author.cards.imports` |
| 2 | Candidates | 검토 후보 | `author.cards.candidates` |
| 3 | Characters | 등록 인물 | `author.cards.characters` |
| 4 | Conflicts | 충돌 건수 | `author.cards.conflicts` |
| 5 | Edges | 관계 연결 | `author.cards.edges` |
| 6 | Events | 사건 수 | `author.cards.events` |

Add a one-line descriptor under each card value. Example for `imports`:

```
받은 자료
12
업로드된 원고·자료 파일
```

Descriptor copy per card (i18n key `author.cards.<slot>.descriptor`):

| Card | Descriptor |
|---|---|
| `imports` | 업로드된 원고·자료 파일 |
| `candidates` | 검토 대기 중인 사실 후보 |
| `characters` | 작품에 등록된 인물 |
| `conflicts` | 캐논과 부딪히는 새 사실 |
| `edges` | 인물 사이 관계의 수 |
| `events` | 시간선에 기록된 사건 |

The `Metric` component ([author-memory-v3-client.tsx:381-390](../../src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx#L381-L390)) gains an optional `descriptor?: string` prop rendered under the value at `text-xs text-slate-500`.

## 6. Tables — column header mapping

The generic `Rows({ rows, columns })` component at [`author-memory-v3-client.tsx:351-378`](../../src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx#L351-L378) auto-humanizes snake_case column names with `.replaceAll('_', ' ')`. Replace the auto-humanize path with an i18n lookup keyed by table + column.

### 6.1 New column-spec shape

Change call sites from:

```tsx
<Rows rows={imports} columns={['file_name', 'source_role', 'parse_status', ...]} />
```

to:

```tsx
<Rows rows={imports} columns={IMPORT_COLUMNS} table="imports" />
```

Where `IMPORT_COLUMNS = ['file_name', 'source_role', ...]` and the header renderer becomes:

```tsx
<th>{t(`author.table.${table}.columns.${col}`)}</th>
```

### 6.2 Imports table

Source: [`author-memory-v3-client.tsx:408-412`](../../src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx#L408-L412)

| Column key | Korean header | i18n key |
|---|---|---|
| `file_name` | 파일 이름 | `author.table.imports.columns.file_name` |
| `source_role` | 자료 분류 | `author.table.imports.columns.source_role` |
| `parse_status` | 파싱 상태 | `author.table.imports.columns.parse_status` |
| `extract_status` | 추출 상태 | `author.table.imports.columns.extract_status` |
| `candidate_count` | 추출된 후보 수 | `author.table.imports.columns.candidate_count` |
| `parsed_text_preview` | 본문 미리보기 | `author.table.imports.columns.parsed_text_preview` |
| `error_message` | 오류 메시지 | `author.table.imports.columns.error_message` |

Cell rendering for status fields gets enum mapping (i18n key `author.table.imports.parse_status.<value>`):

| Raw value | Korean cell |
|---|---|
| `queued` | 대기 |
| `parsing` | 분석 중 |
| `parsed` | 완료 |
| `failed` | 실패 |

`extract_status` mirrors the same pattern (`queued` → 대기, `extracting` → 추출 중, `extracted` → 완료, `failed` → 실패).

`source_role` enum mapping (`canon` → 캐논, `character` → 인물, `scene` → 장면, `reference` → 참고, `visual` → 비주얼).

### 6.3 Candidates / Review queue table

Source: [`author-memory-v3-client.tsx:222`](../../src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx#L222)

| Column key | Korean header |
|---|---|
| `id` | (drop from default view; expose under 자세히) |
| `type` | 종류 |
| `status` | 상태 |
| `confidence` | 신뢰도 |
| `content` | 내용 (add to default view; current `id` is dev-noise) |

Type enum (`character` → 인물, `world_rule` → 세계 규칙, `event` → 사건, `relationship` → 관계, `voice_sample` → 대사 샘플, `fact` → 사실).

Status enum, writer-facing labels:

| Raw status | Korean cell | Color |
|---|---|---|
| `candidate` | 검토 중 | slate-500 |
| `canon` | 캐논 채택 | emerald-600 |
| `rejected` | 반려 | rose-500 |
| `retired` | 은퇴 | slate-400 |
| `past_only` | 과거 한정 | amber-600 |
| `contradicted` | 모순 | rose-600 |
| `invalidated` | 무효 | slate-400 |
| `author_only` | 작가 전용 | indigo-500 |
| `character_known` | 인물 인지 | sky-600 |
| `character_unknown` | 인물 비인지 | slate-500 |

Confidence renders as a small bar plus the percentage rounded to whole numbers (`87%`), not the raw `0.87`.

### 6.4 Characters table

Source: [`author-memory-v3-client.tsx:242`](../../src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx#L242)

| Column key | Korean header |
|---|---|
| `name` | 이름 |
| `summary` | 한 줄 소개 |
| `scope` | 등장 범위 (add) |
| `aliases` | 다른 이름 (add, comma-joined) |

### 6.5 Graph edges table

Source: [`author-memory-v3-client.tsx:227`](../../src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx#L227). Currently shows `from`, `type`, `to`, `intensity` as raw values. See §8 for the full graph rebuild; the table fallback should become:

| Column key | Korean header |
|---|---|
| `from_name` | 출발 인물 |
| `relation` | 관계 |
| `to_name` | 도착 인물 |
| `intensity_band` | 관계 강도 |
| `valid_at` | 시작 시점 |

Where `from_name` / `to_name` are resolved via the character lookup map (§8.4) and `intensity_band` is the qualitative band from §8.3.

### 6.6 Timeline table

Source: [`author-memory-v3-client.tsx:232`](../../src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx#L232)

| Column key | Korean header |
|---|---|
| `day` | Day (D1, D2…) |
| `date` | 날짜 |
| `where` | 장소 |
| `what` | 일어난 일 |

Day labels stay as `D1`/`D2` — that is the writer-facing day notation in the saebyeok sample (D1-D30) and is concise enough to keep.

### 6.7 Conflicts table

See §9 — the conflicts screen drops the table form entirely and becomes a card list with explicit fact-vs-fact citation.

### 6.8 Audit log table

Source: `src/components/author/audit-log-view.tsx`

| Column key | Korean header |
|---|---|
| `event` | 결정 종류 |
| `created` | 시각 |
| `decision` | 결정 ID |
| `llm` | LLM 정보 |
| `payload` | 자세한 내용 |
| `replay` | 재생 |

`event` cell maps the existing `AuthorAuditEventType` enum (e.g., `import.upload` → 자료 업로드, `candidate.decided` → 후보 결정, `conflict.resolved` → 충돌 해결, `simulation.run` → 장면 실행, `backlog.generated` → 백로그 생성). Full enum table goes in `i18n/dictionaries/ko.json` under `author.events.<event_type>`.

## 7. Empty state copy — every screen

Currently a mix of one Korean fallback (`업로드된 파일이 없습니다.`) and several English placeholders (`No rows`, `Run a scene to generate candidate thoughts...`, `No audit events recorded yet.`).

Standardize on a small `<EmptyState>` component:

```tsx
<EmptyState
  title={t('author.empty.<screen>.title')}
  body={t('author.empty.<screen>.body')}
  cta={cta && { label: t('author.empty.<screen>.cta'), onClick }}
/>
```

Each empty state has a title (one short line), a body (one short paragraph orienting the writer), and an optional CTA button.

| Screen | Title | Body | CTA |
|---|---|---|---|
| Inbox empty | 받은 자료가 아직 없어요 | 원고나 설정 자료를 업로드하면 자동으로 분석한 뒤 검토 대기로 넘어갑니다. | 자료 업로드 |
| Inbox parsing in progress | 자료를 읽는 중이에요 | 큰 파일은 1~2분 정도 걸릴 수 있습니다. 끝나면 후보 사실이 자동으로 정리됩니다. | (none) |
| Review queue empty | 검토할 후보가 없어요 | 새로운 자료를 업로드하거나, 인물 화면에서 백로그를 생성해 후보를 채울 수 있습니다. | 백로그 생성 |
| Characters empty | 등록된 인물이 없어요 | 첫 자료가 들어오면 후보로 잡힌 인물을 캐논으로 채택할 수 있습니다. | 자료 업로드 |
| Character detail empty | 아직 비어 있는 인물이에요 | 백로그를 생성하면 좋아하는 것·싫어하는 것 같은 작은 결을 빠르게 채울 수 있습니다. | 백로그 생성 |
| Graph empty | 관계도가 비어 있어요 | 인물이 두 명 이상 등록되고 관계가 잡히면 여기에서 한눈에 볼 수 있습니다. | (none) |
| Timeline empty | 시간선이 비어 있어요 | 사건이 들어오면 Day 단위로 정리됩니다. 사건은 자료에서 자동으로 추출되거나 직접 추가할 수 있습니다. | 사건 추가 |
| Conflicts empty | 충돌이 없어요 | 캐논과 부딪히는 새 사실이 생기면 여기에 모입니다. 지금은 깨끗합니다. | (none) |
| Simulate empty | 장면을 아직 돌려보지 않았어요 | 인물 한 명을 골라 장면 입력을 적으면 그 인물이 무엇을 알고 어떻게 말할지 미리 보여 드려요. | 장면 만들기 |
| Audit empty | 기록할 결정이 아직 없어요 | 후보를 채택하거나 충돌을 해결하면 결정이 시간 순으로 쌓입니다. | (none) |

i18n keys follow the pattern `author.empty.<screen>.title|body|cta`.

The `<EmptyState>` component reuses the existing dashed-border container but adds:

- An icon at the top (24px, `text-slate-400`) chosen per screen (Inbox → 📥 svg, Review → ✅ svg, etc. — actual icons via lucide).
- Title at `text-base font-medium text-slate-700`.
- Body at `text-sm text-slate-600` with max width 480px.
- CTA button as an existing button primitive (no new style).

## 8. Relationship Graph — human-readable rebuild

### 8.1 Current state

[`author-memory-v3-client.tsx:346-349`](../../src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx#L346-L349) renders a 12-row `<Rows columns={['from', 'type', 'to', 'intensity']}>` slice. Cells show raw entity IDs, internal relationship-type strings, and numeric intensity values. There is no graph visualization library in use. Character names exist in `state.characterDetailsByProject` but are not joined onto the edges.

### 8.2 New layout

Two views toggled by a top-right segmented control:

```
[ 그림으로 보기 | 표로 보기 ]
```

Default is `그림으로 보기` ('view as diagram'). The table view stays available for power users and accessibility (screen readers prefer it).

### 8.3 Diagram view

Implementation uses `react-flow` (already widely-used React-friendly graph viz; weighs ~50KB gzipped; fits the existing tree-shaken Next.js setup). If a runtime audit shows an existing graph lib already loaded for another surface, prefer that one and update this section with the actual choice.

Node rendering:

- Label: 인물 한국어 이름 (e.g., `한이슬`). Pull from `state.characterDetailsByProject[projectId][nodeId].name`. If missing, fall back to `nodeId` with a `text-rose-500` color and a tooltip `이 인물의 이름을 아직 등록하지 않았어요.`.
- Subtitle (smaller, below name): scope tag (e.g., `단편 데모`). For the saebyeok sample, scopes look like `short_demo_30day` → render as `30일 단편 데모`.
- Node color: `archetype` based — observer types in slate, support types in indigo, antagonist-tier in rose. Mapping table goes in `author.graph.archetype_palette` config (5 colors max).
- Importance: scales node radius from 24px (importance < 0.4) to 40px (importance > 0.8).

Edge rendering:

- No raw IDs visible.
- No raw numeric intensity (`0.87` etc.) visible.
- Edge thickness encodes the absolute intensity band (§8.4).
- Edge color encodes the sign + dominant dimension:
  - Positive trust-led → emerald
  - Positive attachment-led → rose
  - Negative hostility-led → rose-700 dashed
  - Negative suspicion-led → amber dashed
  - Mixed / informational asymmetry-led → slate
- Hover tooltip on each edge shows: relationship label (Korean), intensity band (Korean), and dimension breakdown (e.g., `신뢰 강함 · 의심 약함 · 부채 보통`).
- Click on an edge opens a side drawer with full dimension list, the timeline of recent events that shaped this relationship, and a `사실 추가` button that prefills a candidate against this character pair.

### 8.4 Intensity bands

Replace the raw `intensity` numeric (range -1.0 to +1.0, computed at [`service.ts ~line 2144`](../../src/lib/author/ui/service.ts) `relationshipIntensity()`) with a qualitative band. Mapping table:

| Numeric range | Korean band | i18n key |
|---|---|---|
| `+0.7` to `+1.0` | 매우 강한 호감 | `author.graph.bands.very_strong_positive` |
| `+0.3` to `+0.7` | 호감 | `author.graph.bands.positive` |
| `+0.1` to `+0.3` | 약한 호감 | `author.graph.bands.weak_positive` |
| `-0.1` to `+0.1` | 중립 | `author.graph.bands.neutral` |
| `-0.3` to `-0.1` | 약한 거부감 | `author.graph.bands.weak_negative` |
| `-0.7` to `-0.3` | 거부감 | `author.graph.bands.negative` |
| `-1.0` to `-0.7` | 매우 강한 적대 | `author.graph.bands.very_strong_negative` |

The numeric value stays in the underlying data and is shown only in the edge-detail drawer behind a `자세히` toggle, for users who need the exact value.

### 8.5 Relationship-type labels

The Saebyeok sample uses descriptors like `best_friend`, `co_lead`, `senior_mentor`, `family`, `informant`, `crush`, `rival`. Add an enum-to-Korean mapping under `author.graph.relation.<key>`:

| Raw | Korean |
|---|---|
| `best_friend` | 단짝 |
| `co_lead` | 공동 주역 |
| `senior_mentor` | 선배·멘토 |
| `family` | 가족 |
| `informant` | 정보원 |
| `crush` | 호감 상대 |
| `rival` | 라이벌 |
| `acquaintance` | 지인 |
| `unknown` | 알 수 없음 |

Unknown / unmapped values fall back to the raw string with a small warning icon and tooltip `등록되지 않은 관계 종류입니다. 추가 등록이 필요할 수 있어요.`.

### 8.6 Sample (Saebyeok)

For illustration, an edge between **한이슬** (protagonist) and **세린** (best friend) currently surfaces in the table as something like:

```
saebyeok.short.char.iseul   |   best_friend   |   saebyeok.short.char.serin   |   0.82
```

After rebuild it reads:

```
[한이슬] ──단짝·호감 강함── [세린]
```

with hover detail `신뢰 강함 · 부채 약함 · 정보 비대칭 낮음`.

### 8.7 Character lookup wiring

`getGraph` ([service.ts:870](../../src/lib/author/ui/service.ts#L870)) already returns `nodes` with `label: character.name`. The current renderer ignores that field. Updated table view and the new diagram view both consume `node.label` first and fall back to `node.id`.

A small `useCharacterNameMap(projectId)` hook builds a `Map<string, string>` once per render so edges can resolve `from_name` / `to_name` without a second API call.

## 9. Conflicts UI — offending rule citation + 1-click override

### 9.1 Current state

`buildSeedConflicts` ([service.ts ~line 1658](../../src/lib/author/ui/service.ts)) returns a fixed array of four conflicts, each with:

- `id`: `conflict-1` … `conflict-4` (sequential, semantically empty)
- `severity`, `status`, `detected_at`
- `existing_fact`: `{ entity_id, content: 'Existing canon around <type>', confidence, status: 'canon' }` — generic placeholder content
- `new_fact`: `{ content: candidate.content, confidence, suggested_relationship: 'contradicts' | 'scope_diff' }`
- `llm_analysis`: free-text string
- `impact_summary`: hardcoded `'Requires author review before promoting candidate into canon.'` for every conflict
- `affected_entities`: array of entity IDs
- `resolution`: nullable string

The current UI ([author-memory-v3-client.tsx:356-360](../../src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx#L356-L360)) renders these as a 4-column generic table. The `useResolveAuthorConflict` hook exists but is not wired to any button.

### 9.2 New card list

Replace the table with a vertical stack of conflict cards. Each card has four regions:

```
┌─────────────────────────────────────────────────────────────┐
│  [심각도 배지]  [상태 배지]                  2026-04-29 14:22 │
│  〈한이슬〉의 정보 처리 방식 — 캐논과 새 사실 충돌            │
│                                                              │
│  기존 캐논                          새 사실                  │
│  ─────────────────                 ─────────────────         │
│  '확실하지 않으면 결정 못 내림'      '위기에서는 즉시 행동한다' │
│  rule#trait.iseul.cautious         후보 #cand_8a3f          │
│  자료: saebyeok_canon_v1.json     자료: 4월 메모.md          │
│  신뢰도 88%                        신뢰도 64%                │
│                                                              │
│  왜 충돌인가요                                                │
│  '결정을 미룬다'와 '즉시 행동한다'는 같은 인물의 핵심 결정     │
│  방식에서 서로 반대 방향입니다. 하나만 캐논으로 둘 수 있어요. │
│                                                              │
│  영향                                                         │
│  · D7 폐역 장면 시뮬레이션 결과가 달라집니다.                  │
│  · 세린·하나와의 위기 반응 관계 강도가 재계산됩니다.            │
│                                                              │
│  [기존 캐논 유지]  [새 사실로 교체]  [둘 다 보류]  [직접 수정] │
└─────────────────────────────────────────────────────────────┘
```

### 9.3 Card region details

**Header (top row):**
- Severity badge: `심각` (red), `중요` (amber), `낮음` (slate). Maps to existing `severity` enum.
- Status badge: `미해결` (slate fill) or `해결됨` (emerald fill).
- Detected timestamp at the right, formatted `YYYY-MM-DD HH:mm` in Asia/Seoul.

**Title:** `〈인물명〉의 <차원>에서 — 캐논과 새 사실 충돌`. Inferred from the `affected_entities[0]` and the `existing_fact.entity_id` slot. Pull the dimension (e.g., 정보 처리 방식, 가치관, 행동 양식) from the rule's `dimension` field if present; otherwise fall back to `사실 충돌`.

**Two-column comparison:** existing canon on the left, new fact on the right.

For each side:

| Field | Source | Display |
|---|---|---|
| Quote | `existing_fact.content` / `new_fact.content` | Single-quoted, italic |
| Citation | `existing_fact.entity_id` (existing) / candidate ID (new) | Mono, `text-xs text-slate-500` |
| Source file | World rule registry path / candidate's `source.file_path` | Plain, `text-xs` |
| Confidence | `existing_fact.confidence` / `new_fact.confidence` | Whole-percent (`88%`) |

This is the **offending rule cite** the dogfood report asked for: the writer can see exactly which canon row is being challenged, by which candidate, sourced from which file.

**Reasoning block (왜 충돌인가요):** Renders `llm_analysis` if present, otherwise a default explanation derived from `suggested_relationship` (`contradicts` → `정반대 진술입니다.`, `scope_diff` → `같은 사실인데 적용 범위가 다릅니다.`).

**Impact bullets (영향):** Replaces the current hardcoded `impact_summary` string. Compute downstream impact from `affected_entities` plus a small heuristic over the timeline:

- For each affected entity, list scenes (D-day) where this fact would change behavior. Cap at 3 bullets.
- For each affected relationship edge, list the connected character pair.

If the heuristic returns nothing, fall back to a generic line: `이 결정이 다른 캐논에 미칠 영향은 적습니다.`

**Resolution buttons (1-click override):**

| Button | Action | Resolution payload |
|---|---|---|
| 기존 캐논 유지 | Reject the new fact | `{ decision: 'keep_existing' }` |
| 새 사실로 교체 | Promote new fact, retire the existing canon row | `{ decision: 'replace_with_new' }` |
| 둘 다 보류 | Mark both as `defer`, keep conflict open with status `deferred` | `{ decision: 'defer_both' }` |
| 직접 수정 | Open a modal to write a custom resolution string and optionally edit either fact | `{ decision: 'custom', text: '...', edits: {...} }` |

`useResolveAuthorConflict` already POSTs to `/api/projects/[projectId]/conflicts/[conflictId]/resolve` with a `decision` field. Extend the route handler to accept these four enum values (plus `'custom'` with optional `text` and `edits`). The audit-log event `conflict.resolved` continues to fire (no change there).

After resolution, the card collapses to a one-line summary:

```
[해결됨] 〈한이슬〉의 정보 처리 방식 — 기존 캐논 유지 · 2026-05-03 11:08
```

with a small `되돌리기` button visible for 30 seconds in case the writer mis-clicked.

### 9.4 Header summary above the list

Above the card stack:

```
충돌 4건
미해결 3건  ·  해결됨 1건
```

A small filter row lets the writer toggle by status (`전체 · 미해결 · 해결됨`) and severity.

### 9.5 Empty state

Falls under §7 Conflicts empty: `충돌이 없어요 / 캐논과 부딪히는 새 사실이 생기면 여기에 모입니다. 지금은 깨끗합니다.`

## 10. i18n key hierarchy

All new keys land under `author.*` in `src/i18n/dictionaries/<locale>.json`. The Korean dictionary (`ko.json`, currently 3348 lines) gets the largest addition; English (`en.json`) gets the same key shape with the existing English labels as values to preserve fallback behavior.

Top-level structure:

```
author.tabs.<id>                     // §4 — 8 keys + 8 subline keys
author.cards.<slot>                  // §5 — 6 keys + 6 descriptor keys
author.table.<table>.columns.<col>   // §6 — 5 tables × ~5 columns
author.table.imports.parse_status.<value>
author.table.imports.extract_status.<value>
author.table.imports.source_role.<value>
author.table.candidates.type.<value>
author.table.candidates.status.<value>
author.empty.<screen>.title|body|cta // §7 — 10 screens
author.graph.archetype_palette       // §8.3 (config object, not strings)
author.graph.bands.<band>            // §8.4 — 7 bands
author.graph.relation.<key>          // §8.5 — ~10 relation types
author.conflict.severity.<value>     // §9 — 3 values
author.conflict.status.<value>       // §9 — 3 values
author.conflict.actions.<key>        // §9.3 — 4 actions
author.events.<event_type>           // §6.8 — 16 audit event types
author.nav.workspace                 // §3 sidebar items
author.nav.groups.work
author.nav.groups.account
author.nav.<item>                    // 8 tab items + 3 account items
```

Total new keys: roughly 130 in `ko.json`, mirrored in `en.json`. Other 20 locales auto-fall-back to `en.json` until the standard translation pass picks them up.

### 10.1 Style notes for the Korean dictionary

- 큰따옴표 (`"`) 금지. 인용·강조는 작은따옴표 (`'`) 만 사용. 메모리 `feedback_no_double_quotes` 정합.
- 외래어 음차 최소화. 인박스 → 받은 자료, 시뮬레이션 → 장면 미리보기, 캐스트 → 인물.
- 명사 위주, 동사·문장 끝 가급적 `~합니다·~해요` 중립체. 빈 상태 본문은 친근한 `~예요·~어요` 톤.
- 숫자 단위 표기는 띄어쓰기 후 한국어 단위 (`12 건`, `4 명`, `7 일`).
- 'AI' 등 통용 약어는 그대로 둡니다. 'LLM' 도 통용.

## 11. Other English copy strings to localize

Beyond tabs / cards / tables / empty states, the dogfood report calls out specific button and message strings.

| Source | Current English | Korean (new) | i18n key |
|---|---|---|---|
| [client.tsx:233](../../src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx#L233) | Generate backlog | 백로그 생성 | `author.actions.generate_backlog` |
| [client.tsx:266](../../src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx#L266) | Review Queue updated | 검토 대기 새로고침 완료 | `author.toasts.review_queue_updated` |
| [client.tsx:116](../../src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx#L116) | Run Scene | 장면 돌리기 | `author.actions.run_scene` |
| [client.tsx:208](../../src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx#L208) | Upload | 업로드 | `author.actions.upload` |
| [client.tsx:259](../../src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx#L259) | Uploading… | 업로드 중… | `author.toasts.uploading` |
| Panel title | Document Inbox | 받은 자료함 | `author.panels.inbox` |
| Panel title | Review Queue | 검토 대기 | `author.panels.review` |
| Sidebar (legacy) [navigation.ts:79](../../src/components/dashboard/navigation.ts#L79) | Author Memory | 작가 메모리 | `dashboard.nav.memory.author_memory` (kept for non-author surface) |

The mixed-Korean string `'AI가 생성 중…'` ([client.tsx:313](../../src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx#L313)) becomes `t('author.toasts.ai_generating')` → `'AI가 생성 중이에요…'` (warmer 어요체 to match the empty-state body voice).

## 12. Files touched (summary)

Modified:

- `src/components/dashboard/navigation.ts` — add `buildAuthorNavigationGroups`; replace hardcoded `Author Memory` with `t('dashboard.nav.memory.author_memory')`.
- `src/components/dashboard/DashboardShell.tsx` — dispatch builder by route prefix.
- `src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx` — replace hardcoded labels with `t(...)`; swap inline tables for column-spec form; replace conflicts table with the card list from §9; replace graph table with the dual-view layout from §8.
- `src/components/author/audit-log-view.tsx` — column header i18n.
- `src/i18n/dictionaries/ko.json` — add `author.*` tree (~130 keys).
- `src/i18n/dictionaries/en.json` — add same `author.*` tree, English values.

New:

- `src/components/author/empty-state.tsx` — `<EmptyState>` primitive used across screens.
- `src/components/author/conflicts/conflict-card.tsx` — single conflict card per §9.
- `src/components/author/conflicts/conflict-list.tsx` — header + filter + card stack.
- `src/components/author/graph/relationship-graph.tsx` — diagram view per §8.3.
- `src/components/author/graph/relationship-graph-table.tsx` — table fallback view per §6.5.
- `src/hooks/useCharacterNameMap.ts` — char-id → name lookup (§8.7).

Untouched (out of scope):

- Persistence layer files (covered by `seizn-author-memory-v3-persistence-handoff.md`).
- `src/lib/author/ui/service.ts` business logic — only consumes existing service methods and conflict resolution payload extension.
- `docs/knot-input/**` — read-only seed source.
- `scripts/verify-knot-separation.ts` — separation guard.
- Demo / marketing surfaces (`src/components/demo/`, `docs/marketing/`).

## 13. Verification

End-to-end checklist after Codex execution (separate session):

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test:run` passes; existing 12 author-ui-service tests stay green
- [ ] `npm run build` passes
- [ ] `npm run verify:knot-separation` passes (this spec must not introduce KNOT identifiers into UI components)
- [ ] Visual smoke: open `/dashboard/author` with `lang=ko`, confirm sidebar shows author-only nav, all 8 tabs render Korean labels, all 6 count cards render Korean labels with descriptors.
- [ ] Visual smoke: open Conflicts tab with seeded data (the 4 dogfood conflicts) — every card shows offending rule citation, confidence percent, impact bullets, four action buttons. 1-click resolution works end-to-end with optimistic UI + audit log entry.
- [ ] Visual smoke: open Graph tab — diagram view shows character names in Korean, no raw IDs visible, edge tooltips show qualitative bands not numeric values.
- [ ] Visual smoke: every empty state for `imports`, `review`, `characters`, `graph`, `timeline`, `conflicts`, `simulate`, `audit` renders the title + body + optional CTA from §7.
- [ ] Audit log entries fire as before for `conflict.resolved`, with new `decision` enum values accepted by the route handler.
- [ ] Dogfood §8 P1 items 1, 2, 3, 4, 5, 6, 7, 8 all visibly resolved.

Failures on any visual smoke item → file findings in a new dogfood report dated to the smoke run; do not merge.
