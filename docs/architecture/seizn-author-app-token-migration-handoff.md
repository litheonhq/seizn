---
phase: App-wide V1 token migration (152~202 files outside landing/auth)
status: pending-agent-dispatch
last_updated: 2026-05-03
parent_phase: Phase D'' landing token migration (`1d3a3c49`) + auth token migration (`9aaaaea6`)
discovered_by: dogfood 진입 시 사용자 관찰 — "UI 디자인 너무 예전·구식 부분 여러 곳"
---

# App-wide V1 token migration handoff

## Context

Phase D″에서 landing 9 sections + Designer Round 1/2/2.1로 V1 token system을 lock·이어 auth 3 페이지 (login/signup/device)·Mark A 자산·SeiznMark inline 코드 전환 완료. 그러나 Author flagship surface의 나머지 영역 — Settings UI·Dashboard 30+ pages·Pricing·Legal·Docs·Status·내부 client/component — 은 옛 brand stack (`szn-*` token·violet/purple/cyan 그라데이션·`gradient-hero`·`bg-red-*`·`text-purple-*` 등) 그대로 유지. 사용자가 dogfood 시점에 직접 발견.

본 작업은 그 영역을 V1 monochrome ink + 3 signal token으로 마이그레이션. **dual-surface 정합 유지** (Author = Mark A monochrome / NPC SDK는 surface 분리·미터치).

**대상 영역 grep 통계** (현 commit `5886b55b` 기준):
- `from-violet-/from-purple-/via-purple-/to-cyan-/bg-cyan-/bg-violet-/bg-purple-/szn-text-/szn-card/szn-border/szn-surface/gradient-hero/btn-premium/text-purple-/bg-red-/border-red-/bg-gray-900` 매칭 = ~152 files
- `szn-accent/szn-bg` 매칭 = ~128 files (위와 일부 중복)
- 합산 unique = ~200 files

## V1 token SSOT

`src/styles/tokens.css` (Phase D″ lock·변경 X):

```css
:root {
  /* monochrome slate */
  --ink-0..--ink-950 (12 단계)

  /* 3 semantic signals */
  --signal-canon: oklch(0.62 0.16 148);     /* green - canon */
  --signal-canon-soft / --signal-canon-ink
  --signal-conflict: oklch(0.60 0.21 27);   /* red - conflict */
  --signal-conflict-soft / --signal-conflict-ink
  --signal-pending: oklch(0.72 0.13 85);    /* yellow - pending */
  --signal-pending-soft / --signal-pending-ink

  /* fonts */
  --font-sans: Pretendard, ...
  --font-serif: Source Serif 4, ...
  --font-mono: JetBrains Mono, ...

  /* radius/shadow/typography */
  --radius-md: 8px
  --shadow-md / --shadow-lg
}
```

`src/components/landing/brand-marks.tsx` — `SeiznMark`·`SeiznLockup` (Author surface mark 컴포넌트·재사용).

## Token mapping table (legacy → V1)

### Color tokens

| Legacy | V1 |
|---|---|
| `szn-text-1` (가장 진한) | `var(--ink-900)` |
| `szn-text-2` | `var(--ink-600)` 또는 `var(--ink-700)` |
| `szn-text-3` (가장 옅은) | `var(--ink-500)` |
| `szn-card` (카드 배경) | `var(--ink-0)` |
| `szn-bg` (페이지 배경) | `var(--ink-50)` 또는 `var(--ink-0)` |
| `szn-surface` (subtle bg) | `var(--ink-50)` |
| `szn-border` (테두리) | `var(--ink-200)` |
| `szn-accent` (강조) | `var(--ink-900)` (primary action) 또는 `var(--signal-canon)` (긍정 신호) |
| `szn-accent/N` (alpha) | `var(--ink-900)` + opacity 또는 `var(--signal-canon-soft)` |
| `gradient-hero` (배경) | `var(--ink-50)` solid |
| `from-violet-500 via-purple-500 to-cyan-500` (그라데이션) | `var(--ink-900)` solid |
| `bg-violet-200/N`·`bg-cyan-200/N`·`bg-purple-200/N` (decorative blob) | **DOM 통째 제거** (V1 = 절제·blob X) |
| `text-purple-600 / hover:text-purple-500` (링크) | `var(--ink-900)` + `text-decoration: underline` |
| `bg-red-50 / border-red-200 / text-red-600` (error) | `var(--signal-conflict-soft)` / `var(--signal-conflict)` / `var(--signal-conflict-ink)` |
| `bg-emerald-50 / border-emerald-200 / text-emerald-700` (success) | `var(--signal-canon-soft)` / `var(--signal-canon)` / `var(--signal-canon-ink)` |
| `bg-amber-50 / border-amber-200 / text-amber-700` (warning) | `var(--signal-pending-soft)` / `var(--signal-pending)` / `var(--signal-pending-ink)` |
| `bg-gray-900 / hover:bg-gray-800` (dark btn) | `var(--ink-900)` / hover `var(--ink-800)` (이미 정합·token 사용 권장) |
| `btn-premium` (그라데이션 buttons) | `var(--ink-900)` solid + `var(--ink-700)` hover |
| `pink-*` 잔존 (이미 e105b0db에서 일부 제거) | 0 hits 검증 |

### Border radius / shadows

| Legacy | V1 |
|---|---|
| `rounded-3xl` (어색하게 큰) | `rounded-2xl` (16px·landing 톤) |
| `shadow-xl` 등 dramatic | `var(--shadow-md)` 또는 `var(--shadow-lg)` |

### Fonts

| Legacy | V1 |
|---|---|
| Geist / Geist_Mono | Pretendard / JetBrains Mono / Source Serif 4 (제목용) |

`next/font` import 문제 잔존 — `src/app/[locale]/layout.tsx:147` `@next/next/no-page-custom-font` warning 있음. **본 cycle 별 — 우선 token 마이그레이션만**.

## Scope phasing (work-order)

각 Phase 종료 시 단일 commit·typecheck/lint/test/build/knot-separation 통과·push. agent가 phase 단위 progress report.

### Phase 1 — Settings UI (5~6 files)

대상:
- `src/components/settings/byok-section.tsx` (방금 helper 추가됨·token 교체)
- `src/components/settings/subscription-section.tsx`
- `src/components/settings/usage-section.tsx`
- `src/components/settings/sync-placeholder.tsx`
- `src/components/settings/author-settings-client.tsx`
- 그 외 `src/components/settings/*.tsx` (DataExportModal·DeleteMemoriesModal·IngestionSettingsCard·RTBFModal 등)

### Phase 2 — Dashboard shell + chrome (5~10 files)

대상:
- `src/components/dashboard/DashboardShell.tsx` (이미 SeiznMark inline·token 정합 검증 + 잔여 교체)
- `src/components/dashboard/MobileSidebar.tsx`
- `src/components/dashboard/TopBar.tsx`
- `src/components/dashboard/CommandPalette.tsx`
- `src/components/dashboard/AlertCenter.tsx`
- `src/components/dashboard/region-selector.tsx`
- `src/components/dashboard/NorthStarMetrics.tsx`
- `src/components/dashboard/OnboardingWizard.tsx`
- `src/components/dashboard/GuidedTour.tsx`
- 기타

### Phase 3 — Dashboard pages (~30 files)

대상 directory:
- `src/app/(dashboard)/dashboard/**/client.tsx`
- `src/app/(dashboard)/dashboard/**/{billing,memories,analytics,traces,governance,budget,security,enterprise,evals,federated,reports,reranker,playground,organizations,keys,integrations,webhooks,fall,autopilot,calculator,docs,settings,usage,privacy}/...`
- mindmap subroute (`memories/mindmap/*`)

권장 순서: 자주 쓰는 routes 먼저 (overview·memories·usage·billing·settings·organizations·keys), 그 외는 나중. 각 파일 변경 후 단위 test 영향 0.

### Phase 4 — Locale routes (~20 files)

대상:
- `src/app/[locale]/{home-client,service-selector-client,summer/summer-client,docs/...,help/help-client,comparison/comparison-client,pricing/pricing-client (이미 lock 일부),dashboard/control-tower/...}.tsx`
- `src/app/[locale]/docs/**/{tutorial,api-reference,faq,limits,security,errors,components,byok,auth,integrations}-client.tsx`

`src/app/[locale]/pricing/pricing-client.tsx` = Phase D″ Designer 일부 lock 영역. token 교체 시 Designer 시각 일관성 유지 (변경 후 시각 비교).

### Phase 5 — Misc components (~50 files)

대상:
- `src/components/extreme-homepage/*`
- `src/components/explain/*`
- `src/components/devtools/*`
- `src/components/relay/*`
- `src/components/retops/*`
- `src/components/hybrid-orchestrator/*`
- `src/components/feature-flags/*`
- `src/components/feedback/*`
- `src/components/budget-planner/*`
- `src/components/adaptive-planner/*`
- `src/components/compression/*`
- `src/components/ui/*` (ResponsiveTable·ThemeToggle 등)
- `src/components/docs/*`
- `src/components/memories/*`
- `src/components/traces/*`
- `src/components/landing/DemoQuery.tsx` (landing scope 이미 lock·여기 잔여 검증)
- `src/components/receipt/*`
- 기타

### Phase 6 — Static / misc (~10 files)

대상:
- `src/app/{not-found,offline,privacy,refund,terms,global-error,status,legal,pricing}/*.tsx`
- `src/contexts/ToastContext.tsx`
- `src/proxy.ts` (이미 자산 정합·token grep 검증)
- `src/components/language-switcher.tsx`

### Phase 7 — Cleanup (optional)

`src/app/globals.css`에서 옛 token alias·utility class 정의 제거 (이미 의존 0 검증 후만):
- `gradient-hero`·`btn-premium`·`input-elegant`·`szn-*` 옛 alias

**위 alias는 lib에 의존 가능성 있음 — grep 0 hits 검증 후만 제거**. 의존이 남아 있으면 alias 보존·향후 cycle.

## 보존 영역 (절대 손대지 말 것)

1. **Landing 9 sections** — Phase D″ lock (`src/components/landing/*`). 이미 V1 정합·재마이그레이션 X
2. **Auth 3 페이지** — `src/app/(auth)/login,signup,device,layout.tsx` — 이미 V1 정합 (`9aaaaea6`)
3. **NPC SDK 시각 자산** — `docs/brand/assets/raster/seizn-logo-*` 폴더는 dual-surface 분리 정합 (S wave·colorful)·미터치
4. **`src/components/landing/brand-marks.tsx`** — SeiznMark·SeiznLockup SVG SSOT·재사용
5. **Mark A 자산** — `public/seizn-icon.svg`·`public/icon.svg`·`public/favicon.svg`·`public/apple-touch-icon.png`·`public/og-image.png`·미터치
6. **`docs/knot-input/*`** — KNOT 격리 위반 issue (별 cycle에서 처리)·본 작업 outside scope

## 검증 (각 Phase 종료 시·일괄)

```
cd /c/Users/admin/Projects/seizn
npm run typecheck
npm run lint
npm run test:run
npm run build
npm run verify:knot-separation
```

**합격 기준**:
- typecheck pass
- lint pass (1 known `@next/next/no-page-custom-font` warning만 — 별 cycle)
- test 1179 pass·16 skip 유지 (또는 +α)
- build pass
- knot-separation 0 matches

**Token grep 검증** (Phase별 scope 한정):

```bash
# Phase 1 후
grep -rln "szn-text-\|szn-card\|szn-border\|szn-surface\|szn-bg\|szn-accent\|gradient-hero\|btn-premium\|text-purple-\|from-violet-\|from-purple-\|via-purple-\|to-cyan-\|bg-cyan-\|bg-violet-\|bg-purple-" src/components/settings/

# Phase 2 후 (dashboard shell)
grep -rln "...same..." src/components/dashboard/DashboardShell.tsx src/components/dashboard/MobileSidebar.tsx ...

# 일괄 후 (Phase 1~6 완료)
grep -rln "...same..." src/
# → 0 hits (Phase 7 cleanup 진행 가능 신호)
```

## 커밋 메시지 양식

각 Phase별 단일 commit:

```
refactor(<phase>): migrate <area> to V1 monochrome ink tokens

- szn-text-1/2/3 → var(--ink-900)/600/500
- szn-card/border/surface/bg/accent → var(--ink-0)/200/50/50/900
- gradient-hero / from-violet-/via-purple-/to-cyan- → var(--ink-50) / var(--ink-900)
- decorative blob (bg-violet-200/cyan-200/purple-200) removed
- text-purple-* → var(--ink-900) + underline
- bg-red-/border-red-/text-red- → signal-conflict-soft/signal-conflict/signal-conflict-ink
- bg-emerald-* → signal-canon-* (success states)
- bg-amber-* → signal-pending-* (pending states)
- rounded-3xl → rounded-2xl
- shadow-xl → var(--shadow-md|lg)

Phase D'' V1 token system extension to <area>; brand consistency for
Author surface dogfood and founding member outreach.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## 비-scope (절대 손대지 말 것)

- `next/font` 마이그레이션 (별 cycle·`@next/next/no-page-custom-font` warning)
- KNOT input 격리 위반 fix (별 cycle)
- Designer Round 3 (i18n)
- 로직 변경 (token / className 교체만·기능 영향 0)
- API endpoint 변경
- 메모리/DB 스키마 변경
- engine.seizn.com NPC SDK assets·landing (dual-surface 정합)
- `next.config.*`·`vercel.json`·`tsconfig*`·`package.json` (build infra)

## Branch / push

Working branch: `feat/npc-memory-pivot` (현 active branch).

각 Phase 완료 시:
```
git add <changed files>
git commit -m "<phase commit message>"
git push origin feat/npc-memory-pivot
```

push 시 Vercel CI 자동 build·preview 갱신·dogfood 진행 중 사용자 화면 변동 가능.

## 보고

Phase별 완료 시 짧은 요약 (under 150 words):
- 변경 file count
- 옛 token grep 결과 (해당 phase scope 안 0 hits 검증)
- 검증 (typecheck/lint/test/build/knot-separation) 결과
- commit SHA
- 다음 phase 진입 또는 대기 상태

문제 발생 시 즉시 보고·강행 X. 특히:
- Designer Round 1/2/2.1·landing/auth lock 영역에 cascading 변경 발생 시 stop
- 사용자 dogfood 진행 중인 Settings UI에 큰 시각 변경 발생 시 일시 정지·사용자 확인

## 환경 메모

- 현 commit: `5886b55b feat(byok): add Anthropic Console quick-issue helper`
- 직전 시각 마이그: Phase D″ landing (`1d3a3c49`) + auth (`9aaaaea6`) + Mark A 자산 (`a4dccc03`)
- 본 작업 size: 6 phases·~200 files·~1179 tests 유지·~수 시간 추정
- 사용자 dogfood Settings UI 진행 중 — Phase 1 (Settings) 작업 시 사용자에게 알림 권장 (또는 Phase 1만 가장 마지막 phase로 미루기)
