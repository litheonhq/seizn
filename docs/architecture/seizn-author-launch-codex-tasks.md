---
doc_type: codex-task-pack
version: v1
generated_at: 2026-05-02
status: ready-for-dispatch
applies_to: Seizn Author 베타 launch — Codex 코딩 작업 분리 (P0~P1)
audience: Codex CLI implementation agents
pair_with:
  - seizn-author-launch-runbook.md (모 runbook·결정·비코딩 작업)
  - seizn-author-memory-v3-llm-integration.md (LLM design spec)
  - seizn-author-memory-v3-llm-integration-tasks.md (Phase 1~6 기존 task pack)
  - ../author-ui/author_ui_data_contracts.json
  - ../author-ui/author_ui_query_bindings.json
  - ../author-ui/author_ui_mutation_invalidation_matrix.md
  - ../marketing/seizn_author_landing_brief.md
  - ../marketing/dual_surface_positioning.md
dispatch_rule: Sequential only (feedback_codex_sequential_execution.md). 한 phase 완료 + verify 통과 후 다음 phase 시작. 병렬 X.
exclusions:
  - P0-1 Privacy/ToS legal 본문 카피 작성 (Claude territory)
  - P0-3 sample IP Saebyeok 콘텐츠 설계 (Claude territory)
  - KNOT 5명 backlog generation (사용자 Author UI 직접 사용)
  - Claude Designer 풀 landing 비주얼 디자인 (P2·별 cycle)
---

# Seizn Author Launch — Codex Task Pack

> Codex가 진행할 **코딩 위주 작업만** 분리. 디자인·카피·콘텐츠 설계·legal 본문은 Claude가 별 cycle 진행. 본 문서 + launch-runbook §3~5 + 페어 문서만 read하면 컨텍스트 0에서 진입 가능.

## 0. 절대 룰 (모든 Phase 공통)

1. **Sequential dispatch only** — `feedback_codex_sequential_execution.md` 정합. 한 Phase 완료 + verify 통과 후 다음 Phase. 병렬 dispatch 시 cross-task 오염 실측됨.
2. **KNOT 자료 0 건드림** — `feedback_seizn_knot_separation.md` 정합. Seizn 외부 산출물 (landing·marketing·demo·docs·case study)에 KNOT 캐릭·세계관·고유명사 노출 0. 본 task pack 어떤 phase도 `Projects/knot/` 디렉토리 read·copy·reference 금지.
3. **Raw secret value 메모리 저장 X** — `feedback_no_secrets_in_memory.md`. 모든 자격증명은 `~/.codex/private/consolidated/*.env` 에서만 read.
4. **공개 카피에 큰따옴표 X** — `feedback_no_double_quotes.md`. 작은따옴표('') 또는 따옴표 없이.
5. **Codex dispatch prompt 표준 양식** — `feedback_codex_dispatch_template.md` 정합:

```text
작업 디렉토리: C:/Users/admin/Projects/seizn
실행 대상: <phase 별 한 줄 명세>
지침 분리 문서: docs/architecture/seizn-author-launch-codex-tasks.md §<Phase> + docs/architecture/seizn-author-launch-runbook.md §<P0-N>
```

## 1. 사전 준비 상태

| 항목 | 상태 | Phase 진입 차단 여부 |
|---|---|---|
| `~/.codex/private/consolidated/litheon.env` (R2_AUTHOR_*·Stripe price IDs·webhook secret 등) | ✓ 등록됨 | X |
| `STRIPE_PRICE_LOCK_VERSION=v7` env | ✓ | X |
| `STRIPE_PRICE_ID_INDIE_*·PRO_*·STUDIO_*·ENTERPRISE_*` (월·연 8개) | ✓ | X |
| `STRIPE_METERED_PRICE_ID_MEMORIES·OPS` | ✓ | X |
| `R2_AUTHOR_*` 9 키 (account·access·secret·bucket·region·owner·migrate_by·endpoint) | ✓ | X |
| Anthropic BYOK 키 (Celovin 명의) `~/.codex/private/consolidated/celovin.env` `ANTHROPIC_API_KEY_CELOVIN_BYOK` | ✗ | **KNOT 트랙만 차단** (Codex Phase A~D 진행 가능) |
| Phase 1~5 LLM 통합 빌드 | ✓ commits `fc1da94f·d3c74975·d4a70511·c0add945·85f1d8e5·e75a9d1e·9cb1fbcb` | X |
| Phase 6 R2 Litheon migration tooling (preflight) | ✓ commit `0c17c231` | Phase E 실행 차단 (Mercury initial deposit 미충당) |
| `legal/privacy-policy.md`·`terms-of-service.md`·`beta-disclaimer.md` en master | ✗ Claude territory | **Phase A 차단** |
| `docs/marketing/sample_ip/saebyeok_*.json` 7 산출물 | ✗ Claude territory | **Phase C 차단** |
| `seizn_author_landing_brief.md` v3 lock | ✓ commit `eb1d84bd·456ff9f0` | X |

---

## Phase A — P0-1 tail: legal 페이지 라우트 + i18n templating

**사전 조건**: Claude가 `legal/privacy-policy.md`·`terms-of-service.md`·`beta-disclaimer.md` en master 작성 + ja·zh·ko 번역 완료.

**디스패치 prompt**:

```text
작업 디렉토리: C:/Users/admin/Projects/seizn
실행 대상: legal 4언어 라우트 빌드 + footer/Checkout 링크 노출 + ToS·Privacy 동의 흐름
지침 분리 문서: docs/architecture/seizn-author-launch-codex-tasks.md §Phase A + docs/architecture/seizn-author-launch-runbook.md §P0-1
```

**범위**:
- `src/app/[locale]/legal/privacy/page.tsx`·`legal/terms/page.tsx`·`legal/beta-disclosure/page.tsx` 라우트 신규
- `legal/*.md` content를 MDX 또는 marked 렌더로 노출
- 4 언어 (en master·ja·zh·ko) i18n string 등록 — 기존 i18n 패턴 정합 (`messages/<locale>/legal.json` 또는 동등)
- Footer 컴포넌트 (이미 있으면 갱신·없으면 신규) — Privacy·Terms·Beta Disclosure 3 링크
- Stripe Checkout 페이지 또는 가입 흐름에서 ToS·Privacy 동의 체크박스·링크 노출
- 베타 disclaimer banner (대시보드 진입 시 1회·dismiss 후 cookie 저장)

**Acceptance criteria**:
- [ ] 4 언어 × 3 페이지 = 12 라우트 모두 200 OK·UTF-8 정합
- [ ] `npm run typecheck` 통과
- [ ] `npm test` 1035 baseline + legal 페이지 unit test 추가 (≥ 6 케이스: 라우트 렌더·i18n key 누락 0·footer 링크 클릭 가능 등)
- [ ] Stripe Checkout 흐름에서 ToS·Privacy 링크 클릭 → 새 탭으로 정상 노출
- [ ] WCAG AA contrast·키보드 navigation 통과
- [ ] `docs/author-memory-v3-llm-phaseA-signoff.md` 작성 (변경 파일·테스트 결과·스크린샷)

**예상 시간**: 0.5~1 working day

---

## Phase B — P0-2: Stripe in-app UI 검증 + BYOK coupon + v7 wiring

**사전 조건**: 없음 (Stripe activate·payout·v7 price ID 모두 env 등록됨).

**디스패치 prompt**:

```text
작업 디렉토리: C:/Users/admin/Projects/seizn
실행 대상: Stripe v7 가격 in-app UI 정합 검증 + subscription state API + billing 페이지 + BYOK coupon mechanism
지침 분리 문서: docs/architecture/seizn-author-launch-codex-tasks.md §Phase B + docs/architecture/seizn-author-launch-runbook.md §P0-2 §11 §15
```

**범위**:

### B-1. v7 가격 wiring 정합 검증
- `src/app/[locale]/pricing/pricing-client.tsx` 점검 — v7 4 tier ($39·$149·$499·$2,500) 노출·yearly toggle·~15% off 표시
- 옛 v5·v6 잔존 ($129·$999·$299·$399) 또는 옛 NPC tier ($9·$29·$99) 검출 시 정정
- `STRIPE_PRICE_LOCK_VERSION=v7` env read·UI에 v7 표시 (개발자 디버그용·hidden span 또는 footer 마지막 줄)

### B-2. Subscription state API + webhook
- `src/app/api/account/subscription/route.ts` 점검·필요 시 신규 빌드
- Stripe webhook handler (`src/app/api/webhooks/stripe/route.ts` 또는 동등) — `checkout.session.completed`·`customer.subscription.updated`·`customer.subscription.deleted`·`invoice.payment_failed` 4 이벤트 처리
- subscription state DB sync (Supabase·테이블 `user_subscriptions` 또는 동등)
- query bindings에 `getCurrentSubscription`·`getUsageThisPeriod` 등 추가 (`docs/author-ui/author_ui_query_bindings.json` 정합)

### B-3. Billing 페이지
- `src/app/[locale]/(dashboard)/dashboard/billing/page.tsx` — plan 확인·cancel·upgrade
- 또는 Stripe Customer Portal embed (`/api/account/billing-portal` 으로 redirect)
- trial 종료 D-3 in-app banner (`useToast` 또는 dashboard top banner)

### B-4. BYOK coupon mechanism
- 룰: BYOK 등록 (Settings → API Keys) 시 Stripe customer에 coupon 자동 적용 → tier 가격 50% off
- 구현 패턴 1: Stripe coupon 단일 발급 (`SEIZN_BYOK_50`·duration `forever`·percent_off 50)·BYOK 활성 시 `customer.update({ coupon: ... })` 호출
- 구현 패턴 2: 별 price ID 분기 (BYOK Indie·BYOK Pro 등 4 product 신규)·BYOK 활성 시 subscription `items.0.price` 변경
- **권장**: 패턴 1 (단순·기존 v7 product 그대로)
- BYOK 비활성화 시 coupon 제거 → 정상 가격 복귀
- 검증: BYOK on → off → on 전환 시 invoice 정합·proration 정상

### B-5. 토큰 한도 enforcement
- tier별 `tokens/mo` 한도 (Indie 1M·Pro 5M·Studio 20M·Enterprise unlimited) 미들웨어 체크
- 한도 도달 시 metered overage Stripe 이벤트 emit (`STRIPE_METER_ID_MEMORIES·OPS`)
- BYOK 활성 사용자는 한도 무시·token 무제한
- in-app usage dashboard widget (현 token / 한도 progress bar)

**Acceptance criteria**:
- [ ] `pricing-client.tsx` v7 가격 정합·옛 가격 잔존 0 (grep `999`·`299`·`129` 으로 검증)
- [ ] Stripe Checkout 흐름 작동 — Indie monthly·yearly·Pro·Studio·Enterprise 5 tier × 2 cadence (총 10 흐름) 모두 trial 30 day 진입
- [ ] webhook 4 이벤트 처리·DB sync 정합·테스트 mock 모두 통과
- [ ] billing 페이지에서 plan 확인·cancel·upgrade 가능
- [ ] BYOK on/off 전환 시 coupon apply/remove + 정상 invoice 발행
- [ ] 토큰 한도 enforcement·metered overage emit·BYOK 사용자 unlimited 검증
- [ ] `npm run typecheck`·`npm test` (1035 baseline + Phase B 신규 ≥ 25 cases) 모두 통과
- [ ] `docs/author-memory-v3-llm-phaseB-signoff.md` 작성

**Phase B Codex execution note (2026-05-02)**:
- Implemented Stripe v7 pricing, checkout, subscription API, webhook sync, billing dashboard, BYOK coupon apply/remove, token-budget metering, query/data contracts, migration, and signoff doc.
- Verification passed: `npm run typecheck`, `npm run test:run` (126 files, 1068 passed, 16 skipped), `npm run lint`, `npm run build`, Author UI JSON parse checks, and legacy price grep in touched pricing surfaces.
- Live Stripe checkout/portal/webhook and live Supabase migration application were not executed in this local session; see `docs/author-memory-v3-llm-phaseB-signoff.md`.
- **Codex self-audit (2026-05-03)** — 6 findings (P0×1·P1×3·P2×2)·dogfood 차단 X·Phase B′·B″ 분리 진행. 자세히 §Phase B′·§Phase B″.

**예상 시간**: 2~3 working day

---

## Phase B′ — Phase B 결제 흐름 결함 fix (P0 + P1×3)

**사전 조건**: Phase B 커밋 `840dcbae`·Codex self-audit 결과 정합.

**Why**: Phase B 빌드는 typecheck·test·lint·build 통과했지만 정적 검증으로 잡히지 않는 4개 결함 잔존:
- 관리형 토큰 플랜 (Indie/Pro/Studio) 결제 후 LLM 호출 X (BYOK 미등록 시 즉시 `BYOK_REQUIRED` throw·v7 pricing 의도 위배)
- BYOK 한 번 쓴 달은 cap 우회 가능 (revenue leak)
- overage meter event가 LLM 호출 전 emit·실패·검증 실패에도 과대 과금
- 활성 subscriber → /pricing 재진입 시 중복 구독 생성

**Block-paid**: launch 전 fix 강제. dogfood (BYOK·결제 X)는 영향 X.

**디스패치 prompt**:

```text
작업 디렉토리: C:/Users/admin/Projects/seizn
실행 대상: P0 + P1×3 fix (관리형 토큰·BYOK 우회 차단·meter post-call·중복 구독 차단)
지침 분리 문서: docs/architecture/seizn-author-launch-codex-tasks.md §Phase B′ + Codex self-audit 메시지
```

**범위**:

### B′-1 (P0). 관리형 토큰 플랜 작동 — `BYOK_REQUIRED` fallback 흐름
- `src/lib/author/llm/byok-resolver.ts:104` `resolveAuthorAnthropicKey()`: BYOK 미등록 사용자 → 시스템 `ANTHROPIC_API_KEY`로 fallback (managed key 흐름)·`BYOK_REQUIRED` throw 제거
- `src/lib/author/llm/anthropic-client.ts:73` 호출부: managed key 흐름 시 tier 토큰 한도 enforcement 진입·v7 pricing copy ('managed tokens' 판매) 의도 정합
- `src/app/[locale]/pricing/pricing-client.tsx:21` 카피 정합 검증 — managed tokens·BYOK optional 두 흐름 모두 명시
- BYOK 사용자만 토큰 무제한·v7 50% coupon 적용은 그대로 유지

### B′-2 (P1). BYOK 우회 차단 — usage summary 의미 재정의
- `src/lib/author/llm/usage-store.ts:97` monthly summary `byok_active`을 'currently active'로 재정의 (또는 신규 필드 분리: `byok_currently_active`·`byok_had_this_month`)
- `src/lib/author/billing/token-budget.ts:71·100` cap bypass 조건은 'currently active'만 참조
- BYOK on→off 전환 시 즉시 cap 복귀·과거 이력 무관

### B′-3 (P1). overage meter post-call emission
- `enforceBudget()` = pre-call check 전용·meter event emit 제거
- Anthropic 응답 성공·JSON 검증 통과 후 `response.usage.output_tokens` (실 사용량) 기준 emit
- 호출 실패·검증 실패·timeout = emit 0
- `src/lib/author/llm/anthropic-client.ts:77`·`src/lib/author/billing/token-budget.ts:96·123` 흐름 재배치

### B′-4 (P1). 중복 구독 차단
- `src/app/api/billing/checkout/route.ts:67·138` 활성 `stripe_subscription_id` 체크 추가
- `status` ∈ `{active, trialing, past_due}` → 새 checkout 차단·portal redirect (`/api/account/billing-portal`)
- `{canceled, incomplete, incomplete_expired}` → 새 checkout 허용
- 업그레이드/다운그레이드 = portal subscription update 활용

**Acceptance**:
- [ ] 비-BYOK 사용자 LLM 호출 작동·tier cap 도달 시 metered overage·실 사용량 기준 invoice
- [ ] BYOK on→off 전환 즉시 cap 복귀 (단위 테스트로 validation)
- [ ] 호출 실패·JSON 검증 실패 시 meter event 0건
- [ ] 활성 subscriber → /pricing → checkout 클릭 시 portal redirect
- [ ] 1035 + Phase B 25 baseline + Phase B′ 신규 ≥ 12 케이스 통과
- [ ] `npm run typecheck·test·lint·build` 모두 통과
- [ ] `docs/author-memory-v3-llm-phaseB-prime-signoff.md` 작성·각 fix별 before/after diff·테스트 케이스 list

**예상 시간**: 0.5~1 working day (file 명·line 명세 명확)

---

## Phase B″ — Phase B polish (P2×2)

**사전 조건**: Phase B′ 완료 + dogfood 검증 후.

**Why**: P2×2 — 결제 흐름 결함은 아니지만 UX·gate 일관성 폴리시·founding member 결제 시점 전 정리 권장.

**디스패치 prompt**:

```text
작업 디렉토리: C:/Users/admin/Projects/seizn
실행 대상: P2 fix (BYOK discount 표시 정합·subscription route gate 정합)
지침 분리 문서: docs/architecture/seizn-author-launch-codex-tasks.md §Phase B″
```

**범위**:

### B″-1 (P2). BYOK discount 표시 정합
- `src/lib/stripe/byok-discount.ts:38·82` Stripe coupon 실 적용 성공 시만 `byok_discount_active=true`
- 실패·secret 누락·customer 누락 시 `pending` 또는 `error` 상태 분리
- `src/app/(dashboard)/dashboard/billing/billing-client.tsx:237` UI에 3 상태 (`Applied`·`Pending`·`Error`) 표시

### B″-2 (P2). subscription route gate 일관성
- `src/app/api/account/subscription/route.ts:36·108` `withAuthorUiService()` wrap 적용
- AUTHOR_UI_ENABLED·allowlist·CSRF·ID normalization 일관 적용
- 인접 Author API (BYOK·usage 등)와 정합

**Acceptance**:
- [ ] BYOK discount 미적용 케이스 (secret 누락·customer 누락·coupon API 실패) UI에 'Pending'/'Error' 표시
- [ ] AUTHOR_UI_ENABLED=false 또는 allowlist 미정합 user → subscription route도 401/403
- [ ] `npm run typecheck·test·lint·build` 통과
- [ ] `docs/author-memory-v3-llm-phaseB-prime-prime-signoff.md` 작성

**예상 시간**: 0.25~0.5 working day

---

## Phase C — P0-3 tail: sample IP demo widget 통합

**사전 조건**: Claude가 `docs/marketing/sample_ip/saebyeok_*.json` 7 산출물 작성 완료 + KNOT 단어 grep 검증 통과.

**디스패치 prompt**:

```text
작업 디렉토리: C:/Users/admin/Projects/seizn
실행 대상: /demo 라우트에 Saebyeok sample IP demo widget 통합 + KNOT separation grep 가드
지침 분리 문서: docs/architecture/seizn-author-launch-codex-tasks.md §Phase C + docs/architecture/seizn-author-launch-runbook.md §P0-3
```

**범위**:
- `src/app/[locale]/demo/page.tsx` 라우트 신규
- saebyeok JSON 7 산출물 fetch + render
- mini-screens 7개 (Inbox·Review·Characters·Graph·Timeline·Simulate + readme intro)
- 라벨 노출: `Sample IP — Synthetic Demo Data` (en master·각 locale 번역)
- 사용자가 read-only로 둘러보기 가능·실 author UI 흐름 1:1 매핑
- CI fail-fast 가드: `scripts/verify-knot-separation.ts` — `docs/marketing/`·`src/app/[locale]/demo/`·`public/`·landing build output에 KNOT 단어 (`소리`·`레이카`·`나나`·`룰루`·`유이`·`KNOT`·`결`·`청학여고`·`도깨비` 등) grep → match 시 exit 1
- `package.json` `predeploy` 또는 GitHub Actions step에 가드 추가

**Acceptance criteria**:
- [ ] `/demo` 7 mini-screens 모두 렌더·saebyeok 데이터 정상 표시
- [ ] 4 언어 i18n 정합
- [ ] KNOT separation grep 가드 CI에서 작동·match 0 통과
- [ ] `npm run typecheck`·`npm test` 통과
- [ ] `docs/author-memory-v3-llm-phaseC-signoff.md` 작성

**예상 시간**: 1~2 working day

---

## Phase D — P0-4: seizn.com landing minimum viable build

**사전 조건**: Phase A·B·C 완료 + `seizn_author_landing_brief.md` v3 lock (이미 ✓).

**디스패치 prompt**:

```text
작업 디렉토리: C:/Users/admin/Projects/seizn
실행 대상: seizn.com Author flagship landing minimum viable build (hero·pricing·demo·legal·cross-link)
지침 분리 문서: docs/architecture/seizn-author-launch-codex-tasks.md §Phase D + docs/architecture/seizn-author-launch-runbook.md §P0-4 + docs/marketing/seizn_author_landing_brief.md
```

**범위**:
- `/` (Author flagship hero·en master) — brief §3.1~§3.4 정합
- `/pricing` — Phase B에서 만든 `pricing-client.tsx` 활용·v7 4 tier·yearly toggle·Stripe Checkout link
- `/demo` — Phase C output
- `/legal/privacy`·`/legal/terms`·`/legal/beta-disclosure` — Phase A output
- footer cross-link to `engine.seizn.com` (NPC SDK surface·현 NPC 콘텐츠 우선 그대로 유지·W6+ migration)
- 4 언어 routes (en 1순위·ja·zh·ko sub-routes)
- 약식 디자인 (default Tailwind·Pretendard·dawn·ivory tokens·풀 디자인은 W3~W4 별 cycle)
- WCAG AA·키보드 navigation·screen reader compat

**Acceptance criteria** (runbook §P0-4 정합):
- [ ] hero + sample IP demo widget 작동
- [ ] 가격 카드 4 tier·Stripe Checkout 흐름 5 tier × 2 cadence = 10 흐름 동작
- [ ] legal docs 링크 footer
- [ ] cross-link to engine.seizn.com 작동
- [ ] WCAG AA Lighthouse score ≥ 90
- [ ] 4 언어 i18n 모두 200 OK·번역 누락 0
- [ ] `npm run build` 성공·deploy preview URL 확인
- [ ] `docs/author-memory-v3-llm-phaseD-signoff.md` 작성·스크린샷 4 언어

**예상 시간**: 3~5 working day (Phase A·B·C output 활용으로 단축)

---

## Phase E — P1-2: R2 Litheon migration 실행 (gated)

**사전 조건**: Mercury initial deposit 충당 + Litheon Cloudflare R2 bucket 신규 생성 + `R2_AUTHOR_NEW_*` env 등록 (사용자 직접·Codex 권한 외).

**참조**: 본 task pack에서 별도 빌드 X. 기존 task pack [`seizn-author-memory-v3-llm-integration-tasks.md`](./seizn-author-memory-v3-llm-integration-tasks.md) **§Phase 6** 그대로 실행. tooling 이미 commit `0c17c231`로 완료됨 (`scripts/migrate-r2-to-litheon.sh`·`scripts/verify-r2-integrity.ts`·`docs/migrations/20260502-r2-litheon-migration.md`).

**디스패치 prompt** (자금 unblock 후):

```text
작업 디렉토리: C:/Users/admin/Projects/seizn
실행 대상: R2 개인 임시 → Litheon LLC bucket 마이그레이션 실행 + verify + 코드 갱신 + 임시 bucket 폐기
지침 분리 문서: docs/architecture/seizn-author-memory-v3-llm-integration-tasks.md §Phase 6 + docs/migrations/20260502-r2-litheon-migration.md
```

**Acceptance criteria** (기존 task pack §Phase 6 정합):
- [ ] 신규 bucket `seizn-author-uploads` (Litheon 명의) 작동·이전된 객체 GET·새 업로드 OK
- [ ] SHA256 integrity 100%
- [ ] 코드·env에 `temp`·`personal_temp`·`MIGRATE_BY` 흔적 0
- [ ] 임시 bucket 객체 0·bucket 폐기
- [ ] design spec §11 'Migration 완료 (YYYY-MM-DD)' 표기
- [ ] `docs/migrations/2026MMDD-r2-litheon-migration-completed.md` 회계 문서

**예상 시간**: 0.5 working day (bucket 준비 후)

---

## 2. Phase 진행 게이트

| Phase | 차단 조건 | unblock 조건 |
|---|---|---|
| A | legal en master 미작성 | Claude P0-1 cycle 완료 |
| B | 없음 | 즉시 진입 가능 |
| C | saebyeok 7 산출물 미작성 | Claude P0-3 cycle 완료 |
| D | A·B·C 미완 | A·B·C 모두 ✓ |
| E | Mercury initial deposit 미충당 | P1-1 founding member 매출 누적 → Mercury 활성화 |

**병행 가능**: Phase B는 A·C와 무관하므로 Claude가 A·C cycle 진행 중에도 Phase B 즉시 dispatch 가능.

## 3. Verify·Signoff 표준

각 Phase 완료 시 다음 산출물 작성 (기존 Phase 1~5 signoff 패턴 정합):

- `docs/author-memory-v3-llm-phase<X>-signoff.md` — 변경 파일 list·테스트 결과·스크린샷·acceptance criteria 체크
- git commit 메시지: `feat(launch): phase <X> — <summary>` 또는 `fix·docs·test·chore` prefix
- push to `feat/npc-memory-pivot` 브랜치 (또는 사용자 지정 브랜치)
- `docs/architecture/seizn-author-launch-codex-tasks.md` 본 문서 §1 사전 준비 상태 표 갱신

## 4. KNOT separation 가드 (모든 Phase 강제)

Phase C에서 `scripts/verify-knot-separation.ts` 빌드 후 모든 Phase에서 CI 게이트로 작동:

```bash
# CI step (GitHub Actions 또는 npm script)
node scripts/verify-knot-separation.ts \
  --paths docs/marketing,src/app/[locale]/demo,public,build \
  --keywords 소리,레이카,나나,룰루,유이,KNOT,결,청학여고,도깨비
# match > 0 시 exit 1
```

본 가드는 [`feedback_seizn_knot_separation.md`](C:/Users/admin/.claude/projects/c--Users-admin--codex/memory/feedback_seizn_knot_separation.md) 정합. 누설 발견 즉시 commit 차단.

## 5. 절대 경로 reference

```text
페어 문서:
  C:/Users/admin/Projects/seizn/docs/architecture/seizn-author-launch-runbook.md
  C:/Users/admin/Projects/seizn/docs/architecture/seizn-author-memory-v3-llm-integration.md
  C:/Users/admin/Projects/seizn/docs/architecture/seizn-author-memory-v3-llm-integration-tasks.md

UI 데이터 계약:
  C:/Users/admin/Projects/seizn/docs/author-ui/author_ui_data_contracts.json
  C:/Users/admin/Projects/seizn/docs/author-ui/author_ui_query_bindings.json
  C:/Users/admin/Projects/seizn/docs/author-ui/author_ui_mutation_invalidation_matrix.md
  C:/Users/admin/Projects/seizn/docs/author-ui/author_ui_screen_specs.md
  C:/Users/admin/Projects/seizn/docs/author-ui/author_ui_user_flows.md

Marketing brief (v3 lock):
  C:/Users/admin/Projects/seizn/docs/marketing/seizn_author_landing_brief.md
  C:/Users/admin/Projects/seizn/docs/marketing/dual_surface_positioning.md

Migration tooling:
  C:/Users/admin/Projects/seizn/scripts/migrate-r2-to-litheon.sh
  C:/Users/admin/Projects/seizn/scripts/verify-r2-integrity.ts
  C:/Users/admin/Projects/seizn/docs/migrations/20260502-r2-litheon-migration.md

자격증명 (raw value 메모리 X·env 파일에만):
  ~/.codex/private/consolidated/litheon.env
```

## 6. 메모리 룰 (Codex 진행 시 강제)

- `feedback_codex_sequential_execution.md` — 병렬 X·순차 강제
- `feedback_codex_dispatch_template.md` — prompt 3 줄 표준 양식
- `feedback_seizn_knot_separation.md` — Seizn 외부 산출물에 KNOT 노출 0
- `feedback_no_secrets_in_memory.md` — env 파일에서만 read
- `feedback_no_double_quotes.md` — 공개 카피에 큰따옴표 X
- `feedback_brand_separation_seizn.md` — Seizn visual cue Celovin·Notrivo·TheLabForge·Usan과 공유 X
- `feedback_delegate_implementation_to_codex.md` — 디자인·카피·스펙은 Claude·구현은 Codex 분업

---

**본 task pack은 Codex 코딩 작업 분리 self-contained**. Claude territory (legal 본문·sample IP 콘텐츠·디자인·spec) 작업은 [`seizn-author-launch-runbook.md`](./seizn-author-launch-runbook.md) §3에 그대로 유지되며 본 문서는 그 중 **코딩 부분만 추출**한 dispatch-ready 양식.
