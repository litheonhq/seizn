# Seizn Author Dashboard — Redesign Brief

**Surface**: `seizn.com/dashboard/*` (Author flagship product UI, post-login)
**Status**: ready for claude.ai Designer handoff
**Author**: written 2026-05-05
**Companion task pack**: `docs/architecture/seizn-author-dashboard-redesign-task-pack.md` (작성 예정 — 디자이너 산출 후)
**Sister cycle (이미 완료)**: `docs/architecture/seizn-author-ui-rebrand-task-pack.md` (1차 cycle, 2026-05-05 머지)

---

## 1. 한 줄 요약

Default `/dashboard` 진입점부터 30+ legacy routes 까지 Author-first 로 재설계 — 작가가 로그인 후 첫 화면에서 "이게 내 워크스페이스" 라고 느끼게 한다. 1차 UX rebrand 산출물 (관계 그래프·conflict card·empty state) 도 visual polish 1 라운드 더.

## 2. 컨텍스트

**W0~W6 cycle 완료 (2026-05-05)**: persistence + 1차 UX rebrand 두 cycle 머지. Author Memory v3 영속화·8 tabs 한국어화·관계 그래프·conflict card·empty state·sidebar dispatch 모두 production.

**W7+ 진입**: founding member outreach 직전. dual-surface 결정 (`seizn.com` = Author flagship / `engine.seizn.com` = NPC Engine SDK) 도 머지 완료.

**dogfood 피드백 (2026-05-05)**:
- "대시보드 UI 아직도 별로"
- "/ko 든 /dashboard 든 같은 화면" (locale routing 혼동)
- 사이드바 헤더에 hardcoded `NPC MEMORY · LIVE` (이미 [PR #243](https://github.com/litheonhq/seizn/pull/243) 에서 fix)
- 사이드바·main 사이 seam border 정렬 어긋남 (같이 fix)

**root cause**: 1차 UX rebrand cycle 은 `/dashboard/author/*` (8 tabs Author workspace) 를 정리했지만, default `/dashboard` 진입점·sidebar groups·30+ legacy routes (NPC SDK 시절 잔재 — chaos / federated / autopilot / reranker / policy-marketplace / story-health 등) 는 손 안 댐. 작가가 처음 보는 화면이 NPC SDK 톤 그대로.

**본 cycle = 2차 UX rebrand**: scope 가 1차보다 넓다. 30+ routes audit + sidebar IA 재설계 + workspace redirect + 1차 산출물 visual polish.

## 3. 청중 — global writers, EN-first

Seizn Author 는 글로벌 product (Litheon LLC · Wyoming · USD flat pricing · 22 i18n locales). Founding member outreach **첫 타겟 = 글로벌 EN-first market** (Royal Road · Wattpad · indie SF/fantasy writers · 영문 IP studios). KO / JA / ZH 등은 후속 i18n 라운드에서 cover.

디자이너 prototype master language = **English**. 모든 카피·micro-copy·empty state 는 EN 으로 설계. 22 locale 번역은 코드 통합 후 별 i18n 라운드.

### Persona B — Genre fiction series writer (P0)

- **role**: Indie genre writer / IP builder (SF · fantasy · mystery · serial)
- **scope**: novella (50K-100K words), serial fiction (5-10+ entries), multi-book IP
- **plan**: Seizn Author Indie ($39/mo) → Pro ($129/mo)
- **device**: desktop-heavy (drafting), mobile lightweight review
- **comparable tools**: Scrivener · Notion · World Anvil · Sudowrite · Novelcrafter
- **pain point**: "Canon, character relationships, timelines, and conflicts live scattered in my head — I have to reassemble them every episode."
- **desired first impression**: Log in → immediate workspace (zero demo cards · zero NPC SDK menu noise · zero "15 route categories")
- **why P0**: matches the wedge cleanest — the canon engine + AI memory v3 visibly pays off when the IP is 30+ characters and crosses entries

### Persona E — Studio team lead (P1)

- **role**: lead writer + 1-3 secondary writers + editor + IP owner
- **scope**: long-running IP (game narrative · comic series · TV bible · franchise)
- **plan**: Seizn Author Studio ($499/mo)
- **extra needs**: multi-project workspace switcher · org member roster · BYOK · audit log
- **device**: desktop primary + occasional review-on-tablet

### Persona radar (informing — not exhaustive)

These shape edge-case design decisions but are **not** the primary outreach target:

| ID | shorthand | tier | what they push the design toward |
|---|---|---|---|
| A | Literary fiction writer | Indie | minimalist chrome · paper-tone variant · reading-optimal body width |
| C | Serial / ongoing fiction writer (Royal Road, KO platforms, etc.) | Indie/Pro | density compact · daily wordcount affordance · platform export hook (out of scope here, mark surface) |
| D | Game narrative writer | Pro | dialog branching tree view · domain English vocab borrowed (branching, NPC, dialog) |

**All personas — "writing workspace", not "AI tool".** AI memory is the underlying engine, the surface is the writer's desk.

## 4. 경쟁 포지션

| product | strength | gap (Seizn Author 가 채우는 것) |
|---|---|---|
| Notion / Coda | flexible DB·docs | 작가 도메인 0·캐논·conflict 검수 X |
| Scrivener / Ulysses | single-author writing focus | 멀티 캐릭터 그래프·AI 메모리 X |
| Bear / Reflect | minimalist note taking | structured canon·timeline·simulation X |
| Linear / Asana | task tree | narrative graph X·AI X |
| World Anvil | worldbuilding wiki | AI 검수·실시간 conflict detection X |
| Sudowrite / Novelcrafter | AI assist for writers | canon engine·deterministic memory·dual-surface X |

**Seizn Author 의 wedge**: canon engine + AI memory v3 + writer-first workspace, 셋이 한 surface 에서 통합. 경쟁군은 둘 중 하나만 잘 함.

## 5. Wedge — 디자인이 시각적으로 표현해야 할 3가지

1. **Author-first workspace** — Notion 같은 generic tool 이 아니라, "작가의 책상" 메타포가 모든 view 에 일관. 메뉴 구조·empty state·micro-copy 모두 작가용 어휘 (인물 / 장 / 갈등 / 타임라인 / 검수).
2. **Canon-aware UI** — 모든 surface (memories / characters / graph / timeline / conflicts) 가 같은 canon graph 위에 떠있다는 시각적 cue. 색·아이콘·테이블 컬럼이 하나의 system.
3. **Memory v3 영속·재현** — 어제 입력한 fact 가 오늘 같은 자리에·같은 모양으로. "AI 가 또 잊었다" 는 트라우마 0. visible state indicator (last sync·persistence health) 작가에게 안심.

## 6. IA — 정보 구조

### 6.1 Top-level routing

```
/dashboard
  ↓ (Author plan user 자동 redirect)
/dashboard/author     ← default workspace · 8 tabs (1차 cycle 산출물)
/dashboard/memories   ← memory inspector / mind map / replay
/dashboard/account    ← usage · BYOK · settings · billing · keys
/dashboard/_legacy/*  ← 30+ NPC SDK routes (sidebar 비노출, URL 직접만)
```

### 6.2 Sidebar nav groups (target — 15 items 이내)

```
WORKSPACE
  📥 Inbox
  🔁 Review
  👥 Characters
  🕸 Graph
  ⏳ Timeline
  ⚠️ Conflicts
  🎬 Simulate
  📜 Audit

MEMORY
  🧠 Memories
  ✏️  Memory editor
  🗺  Mind map
  ⏪ Replay

ACCOUNT
  📊 Usage
  🔑 BYOK
  ⚙️ Settings
```

### 6.3 Legacy routes — _legacy 격리 정책

NPC SDK 시절 30+ routes — sidebar 노출 금지·URL 직접 접근만 허용 (코드는 보존, dual-surface NPC 부활 신호 W7+ 평가에 따라 미래 engine.seizn.com 으로 마이그레이션 가능):

```
/dashboard/_legacy/autopilot
/dashboard/_legacy/budget
/dashboard/_legacy/calculator
/dashboard/_legacy/canon          ← 옛 NPC canon (Author canon 과 다름)
/dashboard/_legacy/chaos
/dashboard/_legacy/devtools
/dashboard/_legacy/enterprise
/dashboard/_legacy/evals
/dashboard/_legacy/federated
/dashboard/_legacy/governance
/dashboard/_legacy/import         ← Author import 와 다름
/dashboard/_legacy/integrations
/dashboard/_legacy/keys           ← Author BYOK 와 다름
/dashboard/_legacy/memory-editor  ← Author memory-editor 와 통합 검토
/dashboard/_legacy/moderation
/dashboard/_legacy/npcs
/dashboard/_legacy/organizations
/dashboard/_legacy/playground
/dashboard/_legacy/policy-marketplace
/dashboard/_legacy/post-mortem
/dashboard/_legacy/replay         ← Author replay 와 통합 검토
/dashboard/_legacy/reports
/dashboard/_legacy/reranker
/dashboard/_legacy/security
/dashboard/_legacy/story-health   ← 이름은 Author스럽지만 NPC 시절 구현
/dashboard/_legacy/traces
/dashboard/_legacy/usage          ← Author usage 와 통합 검토
/dashboard/_legacy/webhooks
```

(통합 후보 4개 — memory-editor / replay / story-health / usage — 디자이너가 검토. NPC 버전이 그대로 쓸 만하면 keep, 아니면 Author 전용 새로 정리)

## 7. 브랜드 가이드

### 7.1 Author 시각 token (이미 V1 token system 으로 정립)

- **palette**: `--ink-0` (white) / `--ink-50` (warm cream / ivory) / `--ink-500` (mid-warm gray) / `--ink-900` (rich ink black)
- **accent**: `--terracotta-500` (warm signal) · `--dawn-500` (sunrise highlight)
- **font sans**: Pretendard Variable
- **font serif**: author-serif (book-quality serif for titles · canon labels · long copy)
- **font mono**: author-mono (used in canon IDs · audit codes only)
- **micro-style**: paper texture cue OK (실제 paper texture image 아님 — color tone)
- **이미 정립**: `src/styles/tokens.css` V1 ink palette + Phase D'' tokens

### 7.2 Engine surface 와 strict separation (최우선 규칙)

Author dashboard 디자인에서 다음 cue **0건** 이어야 함:

- ❌ cosmic dark background (engine 의 `#08080F`)
- ❌ violet (`#7C3AED`) / cyan (`#22D3EE`) accent
- ❌ JetBrains Mono 가 dominant font
- ❌ orbiting graph / season tier (Spring/Summer/Fall/Winter) cue
- ❌ "NPC" / "memory infrastructure" / "SDK" 어휘
- ❌ developer console 톤

이건 [feedback_brand_separation_seizn](https://memory) + dual-surface 결정 정합. 두 surface 가 같은 회사 product 라는 단서 없어도 무방 — strict separation.

### 7.3 Writer-friendly tone — English master, locale-aware i18n

**Master language = English.** 디자이너 prototype 의 모든 카피·micro-copy·empty state·label·CTA 는 영어 master 1종으로 설계. KO/JA/ZH/그 외 19 locale 은 코드 통합 후 별 i18n 라운드.

**English master tone**:

- **menu labels**: writer vocabulary (Characters / Conflicts / Review / Timeline / Acts) — 게임 dev 어휘 (NPC, branching, dialog) 회피. 단 게임 narrative 페르소나용 borrowed vocab 은 본문 영역 안에서 OK.
- **empty state**: warm + approachable, not instructional. 예: "It's quiet here. Add your first character." (NOT "Click + to add character")
- **micro-copy**: friendly but uncluttered — no exclamation points · no marketing speak · 1-2 sentences max
- **CTA verbs**: action-first 단, 작가 행위 (Write / Review / Resolve / Add character) 우선. dev 행위 (Configure / Provision / Deploy) 회피

**Locale i18n 가이드 (코드 통합 후 라운드)**:

- 22 locale 모두 번역 완료 = 합격 기준
- locale-specific 어휘 가이드 별 doc 으로 (KO: -요체 + "인물/갈등/검수/타임라인" / JA: 丁寧語 / ZH: 简体 vs 繁體 / 등)
- locale 별 가이드는 launch 후 점진 (en/ko/ja/zh-hans/zh-hant 우선 5개 + 영어 fallback 17 locale)

## 8. 재사용 자산 — 그대로 쓰는 것

이번 cycle 에서 **건드리지 않을** 코드 (visual polish 만 가능):

| 자산 | 위치 | 그대로 쓰는 이유 |
|---|---|---|
| Persistence layer | `src/lib/author/ui/service.ts` + Supabase migrations | 1차 cycle 에서 `AUTHOR_UI_STORE` env dispatch 로 안정 |
| Author 8 tabs 컴포넌트 | `src/components/author/*` | 1차 cycle 산출물, visual polish 만 |
| 관계 그래프 | `src/components/author/graph/relationship-graph.tsx` | 1차 cycle Phase 7 (react-flow), polish 만 |
| Conflict card | `src/components/author/conflicts/conflict-card.tsx` | 1차 cycle 산출물, polish 만 |
| Empty state | 1차 cycle | polish 만 |
| DashboardShell | `src/components/dashboard/DashboardShell.tsx` | shell 구조 keep, sidebar groups 만 재정렬 |
| MobileSidebar | `src/components/dashboard/MobileSidebar.tsx` | 같음 |
| TopBar | `src/components/dashboard/TopBar.tsx` | 같음 |
| V1 token system | `src/styles/tokens.css` | 이미 정립, 새 token 추가 X |
| 22 i18n 사전 | `src/i18n/dictionaries/*.json` | 키 추가만 (제거 X — backwards-compat) |

## 9. 벤치마크 — 디자인 referencе

| product | 가져올 것 |
|---|---|
| **Linear** | 좌측 sidebar collapsible groups · 빠른 keyboard navigation · 미니멀 chrome |
| **Notion** | Sidebar groups 의 visual hierarchy · workspace switcher pattern |
| **Reflect** | 작가 친화 minimalism · 본문 영역 max-width 제한 · serif typography |
| **Bear** | tagging system 의 visual elegance · 책상 metaphor |
| **Things 3** | 작업 organization · empty state 의 친근함 |

**Anti-reference**: Slack / Datadog / Sentry / LangSmith 같은 dev-console 톤은 회피 (engine.seizn.com 에 어울림).

## 10. 기술 제약

- **framework**: Next.js 16 App Router · React Server Components 우선
- **styling**: Tailwind v4 + V1 ink token system + 일부 inline style (engine 패턴 안 됨 — Author 는 utility class 위주)
- **font**: `next/font` (Pretendard variable + author-serif)
- **i18n**: 22 사전 (en + ko + ja + zh-hans + zh-hant + es + pt-* + fr + de + it + ru + uk + pl + nl + ar + hi + vi + th + tl + fi + sv + he + id)
- **persistence**: Supabase (env: `AUTHOR_UI_STORE=supabase`)
- **auth**: NextAuth.js
- **mobile**: desktop-first · mobile responsive fallback (full mobile rebuild 별 cycle)
- **build**: Vercel auto-deploy on main · ignore-build script (`scripts/vercel-ignore-build.mjs`)
- **route count**: 현재 `/dashboard/*` 30+ routes — 정리 후 sidebar 노출 15 이내 + `_legacy/*` 27+ (URL 직접만)

## 11. 산출물·timeline (2 sprint)

### Sprint 1 (W1 · 디자이너 작업)

**Day 1-3**: design canvas
- 2-3 hero workspace layout variation (sidebar 위치·collapsible 패턴·top bar 변종)
- main workspace prototype (Author 8 tabs 중 Inbox·Characters·Graph 3개 detail)
- key components spec — Sidebar group · Workspace card · Empty state · Conflict card v2 · Relationship graph polish · Loading states

**Day 4-5**: 디자이너 self-QA + 사용자 review + 1차 revision

### Sprint 2 (W2 · 통합)

**Day 1-3**: codex 통합
- routing redirect (Author plan → `/dashboard/author`)
- legacy 30+ routes → `/dashboard/_legacy/*` 이동
- sidebar groups 단순화 (15 items 이내)
- 디자이너 산출물 컴포넌트 적용
- 22 i18n 사전 새 키 번역 (en/ko 우선, 나머지 영어 fallback OK)

**Day 4**: 1차 산출물 visual polish (관계 그래프·conflict card·empty state)

**Day 5**: QA + production deploy

### 산출물 정리

- `docs/marketing/dashboard_redesign_brief.md` (본 문서) — 디자이너 입력
- `docs/marketing/dashboard_redesign_design_spec.md` — 디자이너 산출 후 작성
- `docs/architecture/seizn-author-dashboard-redesign-task-pack.md` — codex dispatch (디자이너 산출 후)
- code commits — Sprint 2 PR

## 12. Out of scope

- ❌ engine.seizn.com 변경 (별 surface)
- ❌ Author flagship landing (`/[locale]`) 변경
- ❌ Stripe checkout flow
- ❌ Auth flow (NextAuth)
- ❌ Mobile native rebuild (별 cycle)
- ❌ Persistence layer 변경 (이미 안정)
- ❌ V1 token system 변경 (Phase D'' 정립)
- ❌ NPC SDK routes 코드 삭제 (보존만, `_legacy/` 격리)

## 13. 합격 기준 (13 items)

- [ ] `/dashboard` 기본 진입 = `/dashboard/author` 자동 redirect (Author plan user)
- [ ] NPC SDK 시절 30+ routes 모두 `/dashboard/_legacy/*` 로 이동·sidebar 비노출
- [ ] Sidebar nav = Workspace 8 + Memory 4 + Account 3 (15 items)
- [ ] 1차 UX rebrand 산출물 visual polish 완료 (관계 그래프·conflict card·empty state)
- [ ] dual-surface separation strict — NPC 어휘·engine 톤 cue 0건
- [ ] 디자이너 prototype = English master (KO/JA/ZH 등 22 locale 은 코드 통합 후 별 i18n 라운드, en/ko/ja/zh-hans/zh-hant 우선 5개 + 영어 fallback 17 locale)
- [ ] Mobile responsive (full mobile rebuild 아닌 desktop fallback OK)
- [ ] Persistence env (`AUTHOR_UI_STORE=supabase`) 그대로 작동
- [ ] Vercel auto-deploy production 정상
- [ ] `tsc --noEmit` exit 0
- [ ] eslint clean
- [ ] 기존 tests 100% pass (회귀 X)
- [ ] founding member 1명 dogfood "처음 화면이 작가 워크스페이스로 느껴진다" confirm

## 14. 디자이너 답 — final (Q1-Q12 + free-text 보강)

claude.ai Designer 의 pre-handoff 질문지 답. Persona radar (B P0 · E P1 · A/C/D 보정) 기반으로 결정. 갈리는 항목은 P0 답 + tier-aware fallback 명시.

| # | 질문 | 답 | rationale |
|---|---|---|---|
| 1 | 산출물 우선순위 | **전부 균형 — hero shell + 3 tab detail + polish** | scope = full (sidebar IA / workspace shell / 1차 산출물 polish). brief Q1 답 = C |
| 2 | Hero variation 개수 | **3개** | 2개 부족 / 4개 reviewer fatigue. engine 패턴 동일 |
| 3 | Sidebar default 상태 | **expanded default · side-by-side canvas (expanded vs collapsed)** | 두 state 비교 필요. final default 는 expanded + toggle 제공 (Linear/Notion 표준) |
| 4 | Workspace switcher (Studio) | **Sidebar 상단 (project name + ▼)** | Linear/Notion 패턴. 작가가 IP context 항상 인지. top bar = global utility |
| 5 | Empty state 톤 | **mix — friendly EN copy + small illust** | "It's quiet here. Add your first character." 같은 warm copy + small illustration (책상 메타포). large demo card X (`feedback_workspace_ux`) |
| 6 | Conflict severity 색 | **3-tier — terracotta (P1) / dawn (P2) / muted ink (P3)** | 작가에게 critical 갈등 즉시 식별 필수. V1 token 안 자연. A persona 위해 severity-off toggle 옵션 |
| 7 | Terracotta 강도 | **medium — CTA + active nav + key labels** | minimal 너무 차분 / generous 는 dev console 톤. medium 이 brand × writer 친화 균형 |
| 8 | Loading state | **skeleton (실제 layout shape)** | 작가가 데이터 위치 미리 인지 → 인지 부담 ↓. spinner/blur 정보 0 |
| 9 | Onboarding | **inline guidance default · Studio tier 만 optional welcome modal 1장 (skip)** | Indie persona (B/A/C) tour 거부감 / Studio (E) 팀 onboarding 표준. tier 분기 |
| 10 | Prototype 인터랙션 깊이 | **tab 전환 + Inbox/Characters/Graph 안 클릭 인터랙션** | visual-only 면 micro-interaction 검증 X / 최대 mock 까지는 over-spend. middle ground |
| 11 | 언어 | **English master only** (디자이너 산출물). KO/JA/ZH/그 외 19 locale 은 코드 통합 후 별 i18n 라운드 | Litheon LLC = global · USD flat · 22 locale i18n. founding member outreach 첫 타겟 = global EN-first market |
| 12 | Tweaks 패널 axis | **(a) Sidebar expanded/collapsed · (b) Density compact/comfortable/spacious · (c) Accent intensity minimal/medium/generous · (d) Empty state 톤** | density 우선순위 ↑ — 5 personas 모두 density 갈림. severity color · paper-tone 은 단일 결정 (toggle 가치 작음) |

### Free-text 보강 (Q13)

1. **1차 cycle 산출물 (관계 그래프 / conflict card / empty state) 은 이미 production**. visual polish 만 — 컴포넌트 구조·data shape·props·state interface 호환 유지. 새 컴포넌트 추가 자유는 있음.
2. **30+ legacy routes disposition 은 Appendix A 참조**. review 4개 (canon / replay / story-health / privacy) 만 디자이너가 final disposition 결정 (Author 호환 / 정리 후 새로 / `_legacy/` 격리 셋 중).
3. **English master tone**: writer vocabulary (Characters / Conflicts / Review / Timeline / Acts). 게임 dev 어휘 (NPC, branching, dialog) 회피 — 단 game narrative persona 용 borrowed vocab 은 본문 영역 안에서 OK.
4. **Desktop-first**, mobile responsive fallback OK. mobile rebuild 별 cycle.
5. **Strict separation from engine.seizn.com**: cosmic dark / violet / cyan / JetBrains Mono / orbiting graph / season tier (Spring/Summer/Fall/Winter) / "NPC" 어휘 / "memory infrastructure" 어휘 — 모두 0건.
6. **Anti-pattern**: Slack / Datadog / Sentry / LangSmith dev-console 톤 회피. Bear / Reflect / Linear / Things 3 / 책 톤이 reference.
7. **CTA hierarchy**: primary = 본문 작업 (write / review / resolve) · secondary = 데이터 추가 (add character / add timeline entry) · tertiary = settings/account. 색 강도 이 hierarchy 따라.
8. **Persona-specific 자리 reserve** (구현은 별 cycle, 디자인은 자리만):
   - Body width guard — workspace 본문 영역 max ~880px (literary fiction persona)
   - Character chip strip — 30+ characters 시 lazy load · search · filter · virtual scroll (genre series persona P0)
   - Comment / suggestion threading affordance — Studio tier (E persona)
   - Dialog branching tree view sub-view — game narrative persona

## 15. 자료 링크

- **메모리 인덱스**: `~/.claude/projects/c--Users-admin--codex/memory/MEMORY.md`
  - [seizn-author-launch-blockers-2026-05](memory/seizn-author-launch-blockers-2026-05.md)
  - [seizn-pivot-creative-writing-2026-05](memory/seizn-pivot-creative-writing-2026-05.md)
  - [seizn-dual-surface-decision-2026-05](memory/seizn-dual-surface-decision-2026-05.md)
- **1차 cycle handoff**: `docs/architecture/seizn-author-ui-rebrand-task-pack.md` (739 lines)
- **Persistence handoff**: `docs/architecture/seizn-author-memory-v3-persistence-handoff.md`
- **Author Memory v3 spec**: `docs/architecture/seizn-author-memory-v3.md`
- **Engine landing brief (참고 패턴)**: `docs/marketing/engine_landing_brief.md`
- **dual-surface positioning**: `docs/marketing/dual_surface_positioning.md`
- **dogfood report (private, identifier-isolated)**: `~/.codex/private/seizn-dogfood-report-2026-05-03.md`
- **production**: https://www.seizn.com/dashboard
- **engine surface**: https://engine.seizn.com (디자인 cue 절대 회피)

---

## Appendix A — Current `/dashboard/*` route audit

총 30 + 13 sub-routes = 43 paths. 디자이너 검토 후 disposition 확정.

| Route | Current state | Proposed disposition | Notes |
|---|---|---|---|
| `/dashboard` | Generic landing | **redirect → /author** | Author plan default |
| `/dashboard/author` | Author 8-tab workspace (1차 cycle) | **keep · primary** | Visual polish only |
| `/dashboard/author/settings` | Author settings sub | **keep** | Move to `/dashboard/account` 검토 |
| `/dashboard/memories/*` | Author memory inspector | **keep · simplify** | beliefs / branches / budget / candidates / decay / mindmap / provenance — 7 sub. 디자이너 검토. |
| `/dashboard/memory-editor` | Author memory editor | **keep** | Sidebar group "Memory" |
| `/dashboard/import` | Author import | **keep** | Used in onboarding flow |
| `/dashboard/billing` | Stripe billing | **keep · move to /account** | |
| `/dashboard/usage` | Usage dashboard | **keep · move to /account** | NPC 시절 그대로면 polish 필요 |
| `/dashboard/keys` | API keys | **keep · move to /account/byok** | BYOK flow |
| `/dashboard/settings` | Generic settings | **keep · move to /account/settings** | |
| `/dashboard/replay` | Replay viewer | **review · 통합 후보** | NPC 버전인지 Author 호환인지 확인 |
| `/dashboard/canon` | Canon viewer | **review** | Author canon 과 NPC canon 다른 개념 가능성 |
| `/dashboard/story-health` | Story health | **review · 통합 후보** | 이름은 Author스럽지만 구현 origin 확인 |
| `/dashboard/post-mortem` | Post-mortem | **_legacy** | NPC SDK 사후분석 도구 |
| `/dashboard/autopilot` | NPC autopilot | **_legacy** | |
| `/dashboard/budget` | Budget management | **_legacy** | (Author 는 단순 usage page 로 충분) |
| `/dashboard/calculator` | Cost calculator | **_legacy** | |
| `/dashboard/chaos` | Chaos engineering | **_legacy** | |
| `/dashboard/compliance` | Compliance dashboard | **_legacy** | |
| `/dashboard/devtools` | Dev tools | **_legacy** | |
| `/dashboard/enterprise` | Enterprise tier | **_legacy** | (Studio plan 은 Author tab 안에서) |
| `/dashboard/evals` | Eval pipeline | **_legacy** | |
| `/dashboard/federated` | Federated learning | **_legacy** | |
| `/dashboard/governance` | Governance | **_legacy** | |
| `/dashboard/integrations` | Integrations | **_legacy** | (Author 는 import / docs 만) |
| `/dashboard/moderation` | Moderation | **_legacy** | |
| `/dashboard/npcs` | NPC list | **_legacy** | (Author character 와 별 개념) |
| `/dashboard/organizations` | Org management | **_legacy** | (Studio plan org switcher 별도 처리) |
| `/dashboard/playground` | API playground | **_legacy** | |
| `/dashboard/policy-marketplace` | Policy marketplace | **_legacy** | |
| `/dashboard/reports` | Reports | **_legacy** | |
| `/dashboard/reranker` | Reranker config | **_legacy** | |
| `/dashboard/security` | Security dashboard | **_legacy** | |
| `/dashboard/traces` | Trace viewer | **_legacy** | |
| `/dashboard/webhooks` | Webhooks | **_legacy** | |
| `/dashboard/privacy` | Privacy dashboard | **review** | 사용자 RTBF flow — Author 도 필요 |

**요약**: keep 8 / move-to-account 5 / review 4 / _legacy 22 = 39 (sub-routes 별도)

## Appendix B — Engine vs Author surface 9-axis 비교 (디자이너 reference)

| axis | Engine (`engine.seizn.com`) | Author (`seizn.com/dashboard`) |
|---|---|---|
| audience | game studio dev (global) | indie genre writer / IP builder (global, EN-first) |
| persona | engineer | writer / editor |
| primary action | install SDK · book demo | write · review · resolve conflicts |
| tone | technical · precise · BS-detector-pass | warm · friendly · book-like |
| color | cosmic dark · violet · cyan | warm cream · ink · terracotta |
| font | JetBrains Mono dominant | Pretendard + author-serif |
| chrome | dev console | writer's desk |
| metaphor | orbiting memory graph (Spring/Summer/Fall/Winter tiers) | book · canon · character graph |
| anti-reference | book / paper / serif | Slack / Datadog / Sentry |
| master copy language | English | English (KO/JA/ZH/그 외 19 locale = 후속 i18n 라운드) |

**Visual cue overlap**: 0 (strict separation)
