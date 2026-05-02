---
doc_type: codex-handoff
version: v1
generated_at: 2026-05-03
status: ready-for-dispatch
applies_to: Phase D″ — Designer Round 2.1 implement (Codex CLI single dispatch)
audience: Codex CLI implementation agent
pair_with:
  - designer-round-2-1/README.md (designer 핸드오프 가이드)
  - designer-round-2-1/project/Seizn Author Landing.html (메인 design canvas)
  - designer-round-2-1/project/tokens.css (V1 디자인 토큰)
  - designer-round-2-1/project/*.jsx (9 컴포넌트 + 6 sections)
  - seizn-author-launch-runbook.md
  - seizn-author-launch-codex-tasks.md
dispatch_rule: Single phase·verify gate·signoff·commit·push
---

# Phase D″ — Designer Round 2.1 Implement (Codex Handoff)

## 0. 컨텍스트

**Pre-state**:
- Branch: `feat/npc-memory-pivot`·HEAD `67aabb15`
- 1171 tests pass·KNOT separation 0 matches·Lighthouse 100·Vercel preview Ready
- Audit fix chain (Phase 0+D′+B‴+A′) 완료

**Designer 산출물 위치**:
- `docs/architecture/designer-round-2-1/` 풀 bundle
- 주요 file: `project/Seizn Author Landing.html`·`project/tokens.css`·`project/*.jsx` (9 components)

**Designer 결정 (Round 1+2+2.1 누적 lock)**:
- Hero B (split·dark left + light right detector) + Mark A (canon-graph node)
- Pricing: Indie + Pro full cards (Pro highlighted dark + 'most picked' green badge) + Studio + Enterprise slim rows
- Footer: discreet '© 2026 Seizn by Litheon LLC · Wyoming' + 'v1.0 · saebyeok demo is synthetic data' mono
- Engine tease: env-gated strip·`NEXT_PUBLIC_ENGINE_SURFACE_LIVE=1` 시만 표시
- Detector seed: 'Han Iseul transfers to Class 2 on day 9.' → conflict against `character.han_iseul.class = 1`
- Tokens: monochrome slate (oklch ink-0~ink-950) + 3 signals (canon-green·pending-yellow·conflict-red)
- Type: Pretendard (body) + Source Serif 4 (headings·GT Sectra 무료 대체) + JetBrains Mono (code/canon)
- Trust 섹션: 'Workspace-isolated' (NOT 'KNOT-isolated'·Round 2.1 fix)
- FAQ #4: 'KNOT separation is enforced by CI grep' 문장 제거 (Round 2.1 fix)

**기존 빌드 상태 (교체 대상)**:
- `src/components/landing/author-flagship-landing.tsx` (1095 lines·Phase D + D′·cyan stack)
- `src/app/[locale]/page.tsx` (locale home route)
- `src/app/[locale]/pricing/pricing-client.tsx` (4 tier × 2 cadence·v7)

---

## 1. 절대 룰 (재확인)

1. **KNOT 자료 0 노출** — `feedback_seizn_knot_separation.md`. designer 산출물 카피·SVG·이미지 metadata 모두 검증·`scripts/verify-knot-separation.ts` PASS 강제
2. **Brand 분리** — `feedback_brand_separation_seizn.md`. Celovin·Notrivo·TheLabForge·Usan과 visual cue 공유 X
3. **공개 카피 큰따옴표 X** — `feedback_no_double_quotes.md`. 작은따옴표(') 또는 따옴표 없이
4. **Raw secret value UI 표시 X** — `feedback_no_secrets_in_memory.md`
5. **Codex sequential·병렬 X** — `feedback_codex_sequential_execution.md`
6. **Dispatch 양식 정합** — `feedback_codex_dispatch_template.md`

---

## 2. 범위

### 2.1. Token system migration

**산출물**:
- `src/styles/tokens.css` (또는 동등) 신규 — `docs/architecture/designer-round-2-1/project/tokens.css` 그대로 또는 포팅
- 기존 cyan-300/500/600/700/900 stack 풀 제거
- Monochrome slate scale (`--ink-0` ~ `--ink-950`) + 3 signals (`--signal-canon`·`--signal-pending`·`--signal-conflict`) 적용
- Type stack: Pretendard + Source Serif 4 + JetBrains Mono — Google Fonts CDN preconnect·또는 next/font 양식 사용
- Tailwind config 갱신·또는 CSS variables를 직접 import

### 2.2. 9 sections React 컴포넌트 포팅

기존 `src/components/landing/author-flagship-landing.tsx` 단일 파일 → 다음 분리 컴포넌트로 재구성:

| Designer file | 포팅 대상 |
|---|---|
| `hero.jsx` (HeroSplitDetector) | `src/components/landing/hero-split-detector.tsx` |
| `section-workflow.jsx` | `src/components/landing/section-workflow.tsx` |
| `section-inputs.jsx` | `src/components/landing/section-inputs.tsx` |
| `section-conflicts.jsx` | `src/components/landing/section-conflicts.tsx` |
| `section-simulation.jsx` | `src/components/landing/section-simulation.tsx` |
| `section-rest.jsx` (Trust·Pricing·FAQ·Footer·EngineTease) | 각각 분리 컴포넌트로 |
| `canon-graph.jsx` | `src/components/landing/canon-graph.tsx` |
| `conflict-detector.jsx` | `src/components/landing/conflict-detector.tsx` (client component·`'use client'`) |
| `brand-marks.jsx` (Lockup·BrandMark) | `src/components/landing/brand-marks.tsx` |

`src/app/[locale]/page.tsx` Author flagship landing route 갱신: 컴포넌트 조립·Phase C `SaebyeokDemoData` 데이터 wire.

### 2.3. Mobile + Tablet viewport 정합

`section-mobile.jsx` (MobileHero + TabletHero)는 별 컴포넌트 X·responsive utility로 통합. 360px·768px·1440px 모두 정합:
- 360: 단일 column·plan picker vertical·character chip strip
- 768: 단일 column·detector 축소·plan picker vertical
- 1440: split hero·plan picker horizontal·full canon graph

### 2.4. 기존 file 처리

- `src/app/[locale]/pricing/pricing-client.tsx`·디자이너 pricing 양식 정합 갱신 (Indie/Pro full·Studio/Enterprise slim row)
- `src/lib/checkout-copy.ts`·designer copy 정합 검증
- `src/components/landing/author-flagship-landing.tsx`·**deprecate** — 새 9 컴포넌트로 분리 후 삭제 (또는 thin wrapper로 유지)
- 옛 cyan stack·footer copyright 'Seizn. {locale}' 양식·yearlyNote 미스로케이션 등 Phase D′이 이미 fix·재회귀 X

### 2.5. Tweaks·env gate

- `NEXT_PUBLIC_ENGINE_SURFACE_LIVE` env 등록 (Vercel Production·Preview·Development scope·Phase D′ E item과 정합)·default off·on 시만 EngineTease strip 노출
- Mark variant: 본 round는 Mark A primary lock·Mark D fallback은 코드에 prop으로만 보존·UI tweak 노출 X (founding member 후 디자인 swap 필요 시 대비)

### 2.6. Brand mark + favicon

`brand-marks.jsx`의 Mark A SVG → Next.js asset:
- `public/icons/seizn-mark.svg` (32×32 viewBox·4 nodes + 4 edges)
- `public/icons/seizn-mark-16.svg` (16×16 simplified·3 nodes)
- `app/icon.svg` 또는 `app/favicon.ico` 생성·Next.js metadata API 정합
- nav lockup·footer lockup이 동일 SVG 참조

### 2.7. Detector seed

`conflict-detector.jsx`의 default seed = `'Han Iseul transfers to Class 2 on day 9.'`. Saebyeok sample IP `character.han_iseul.class = 1` 와 conflict reconciliation 흐름 정합. Try-chip에 'eye-color' 등 secondary scenario 보존.

### 2.8. KNOT separation 회귀 가드

- `scripts/verify-knot-separation.ts` 적용 scope 재검증 (`docs/marketing/`·`src/app/[locale]/demo/`·`public/`·landing build output)
- `src/components/landing/` 신규 추가도 scope에 포함 (CI gate)
- designer 산출물 `docs/architecture/designer-round-2-1/`은 **internal handoff doc**·marketing surface X·grep scope 외 (또는 whitelist 패턴)

---

## 3. Acceptance criteria

### 3.1. Visual parity (designer canvas vs Next.js 빌드)

- [ ] Hero B split layout (dark left copy/CTA + light right live detector) 정합
- [ ] Workflow 3-step horizontal flow + disc indicator on connecting line
- [ ] Inputs 4 mode (Native·DOCX·Plain text·Google Docs) + click-swap preview
- [ ] Conflicts severity-graded cards (critical·major·minor) + canon graph anchor
- [ ] Simulation Safe/Risk split + continuity gauge + token-level diff
- [ ] Trust 4 glyphs (lock·key·archive·shield)·'Workspace-isolated' 카피
- [ ] Pricing Indie + Pro full cards (Pro dark + 'most picked' green badge) + Studio/Enterprise slim rows·cadence '$ X / month'·tokens 'XM tokens / mo'
- [ ] FAQ 5 items·details/summary·Sudowrite·NovelCrafter 차별화·BYOK 투명성·KNOT CI 문장 제거
- [ ] Footer '© 2026 Seizn by Litheon LLC · Wyoming' + 'v1.0 · saebyeok demo is synthetic data' discreet mono
- [ ] EngineTease env-gated·default off·env on 시 strip 표시

### 3.2. Mobile + Tablet 정합

- [ ] 360px viewport: nav 햄버거·hero 단일 column·character chip strip·vertical plan picker·detector 작은 모바일 변형
- [ ] 768px viewport: 단일 column·detector 축소·plan picker vertical
- [ ] 1440px viewport: split hero·plan picker horizontal·full canon graph
- [ ] 모든 viewport에서 horizontal overflow 0
- [ ] KO hero (round 3 i18n 후) line break 균형 검증 (현 round는 en master만)

### 3.3. Token migration

- [ ] cyan-300·cyan-500·cyan-600·cyan-700·cyan-900 grep = 0 (`src/components/landing/`·`src/app/[locale]/page.tsx`·`src/app/[locale]/pricing/`·`tailwind.config.*`)
- [ ] monochrome `--ink-*` + 3 signals (`--signal-canon`·`--signal-pending`·`--signal-conflict`) 적용
- [ ] Pretendard + Source Serif 4 + JetBrains Mono font load 정상

### 3.4. Brand mark + favicon

- [ ] Mark A SVG asset (`public/icons/seizn-mark.svg` + `seizn-mark-16.svg`) 등록
- [ ] Next.js metadata API에 favicon registration·tab favicon 16/32 모두 정상 표시
- [ ] nav + footer lockup 동일 SVG 참조

### 3.5. KNOT separation + 카피 룰

- [ ] `scripts/verify-knot-separation.ts` PASS·0 matches
- [ ] designer round 2.1 KNOT leak fix 적용 ('Workspace-isolated'·FAQ #4 CI 문장 제거)
- [ ] 공개 카피 큰따옴표 0건 (`grep -r '"' src/app src/components`)
- [ ] designer-round-2-1 bundle 자체는 internal·grep scope 외

### 3.6. Code quality

- [ ] `npm run typecheck` 통과
- [ ] `npm run test:run` 1171 baseline + Phase D″ 신규 ≥ 8 cases (시각 회귀·env gate·detector seed·footer entity·mobile parity 등)
- [ ] `npm run lint` 통과
- [ ] `npm run build` 통과
- [ ] `npm run verify:knot-separation` PASS

### 3.7. Vercel preview

- [ ] 자동 빌드 Ready (HEAD 갱신 후 Vercel auto-deploy)
- [ ] Lighthouse accessibility 100 유지 (회귀 X)
- [ ] WCAG AA 색상 contrast PASS

### 3.8. Signoff

- [ ] `docs/author-memory-v3-llm-phaseD-double-prime-signoff.md` 작성
  - 변경 파일 list
  - test 결과 (typecheck·test·lint·build·knot-separation)
  - Lighthouse JSON report (`reports/phaseD-double-prime-lighthouse-en-accessibility.json`)
  - 4 viewport 스크린샷 (`reports/phaseD-double-prime-landing-en-{1440,768,360}.png` + favicon scale check)

---

## 4. 범위 외 (Round 3 또는 별 cycle)

- **i18n ko/ja/zh-hans 카피 풀 갱신** — designer Round 3 lock 후 별 phase (D‴)
- **Designer P2 polish 추가** (animation·empty states·dark mode 변형) — founding member 후
- **engine.seizn.com NPC SDK landing** — W7+ 별 cycle
- **Vercel SSO bypass token / Production deploy** — 사용자 권한
- **Lawyer review** — W6 풀 launch 전 별 cycle
- **Phase E R2 Litheon migration** — Mercury initial deposit 후 별 dispatch

---

## 5. Dispatch prompt

```text
작업 디렉토리: C:/Users/admin/Projects/seizn
실행 대상: Phase D″ — Designer Round 2.1 implement·9 sections React + token migration + mobile/tablet parity + favicon + env gate + signoff
지침 분리 문서: docs/architecture/seizn-author-phase-d-double-prime-handoff.md
```

본 핸드오프 단일 문서 + `designer-round-2-1/` bundle만 read하면 컨텍스트 0에서 진입 가능.

## 6. 예상 시간

~1 working day (designer 산출물 풀 ready·기존 컴포넌트 교체 패턴 명확).
