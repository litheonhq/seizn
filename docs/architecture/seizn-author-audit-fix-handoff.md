---
doc_type: codex-handoff
version: v1
generated_at: 2026-05-03
status: ready-for-dispatch
applies_to: H+A+C+D chain self-audit + Claude Phase D 리뷰 합산 결함 fix (Codex CLI)
audience: Codex CLI implementation agent (single chained dispatch)
pair_with:
  - seizn-author-launch-codex-tasks.md
  - seizn-author-launch-runbook.md
  - author-memory-v3-llm-phaseH-signoff.md
  - author-memory-v3-llm-phaseA-signoff.md
  - author-memory-v3-llm-phaseC-signoff.md
  - author-memory-v3-llm-phaseD-signoff.md
  - author-memory-v3-llm-phaseB-prime-signoff.md
  - author-memory-v3-llm-phaseB-prime-prime-signoff.md
dispatch_rule: Sequential chain·halt-on-failure·verify gate per phase·signoff doc per phase
exclusions:
  - P2 polish 항목 N~U (subtitle trim·graph edges·demo redundancy·hero mobile·CTA flow·workflow 시각 차별화·brand mark)·Claude Designer cycle 별
  - Vercel SSO (V) — 사용자 권한
  - engine.seizn.com DNS 활성화 — 사용자 권한 (Codex는 env 게이트 + 안전 fallback만)
---

# Codex Handoff — H/A/C/D Audit Fix Chain

## 0. 컨텍스트

**Pre-state**:
- Branch: `feat/npc-memory-pivot`·HEAD `c1ddb149`
- H+A+C+D chain 완료 (commits `0aa0a3ff·af8c6999·56cf2993·f1a8c483·c1ddb149`)
- Phase B′·B″ 완료 (`1b673cf7·0ae112c5`)
- Test baseline 직전: 137 files / 1145 passed / 16 skipped
- `npm run verify:knot-separation`: 0 matches
- Vercel preview branch alias: `seizn-git-feat-npc-memory-pivot-litheon.vercel.app` (SSO gated)

**감사 출처**:
- Codex self-audit: 4 P1 + 5 P2 (commit `c1ddb149` 기준)
- Claude Phase D 리뷰: 1 P0 + 4 P1 + 8 P2 (코드 + 4 lang 스크린샷 검토)

**합산 결함**: 18+ items. 본 핸드오프는 **fix 가능한 13 items** (Codex territory) 처리. P2 디자인 polish 8 items + 사용자 권한 2 items은 별 cycle.

---

## 1. 절대 룰 (모든 phase 공통)

1. **Sequential dispatch only** — `feedback_codex_sequential_execution.md` 정합. phase별 verify·signoff·commit·push 완료 후 다음 phase
2. **KNOT 자료 0 건드림** — `feedback_seizn_knot_separation.md`. `Projects/knot/` read·copy·reference 금지. landing/demo/marketing 산출물에 KNOT 캐릭·세계관·고유명사 노출 0
3. **Raw secret value 메모리·UI 표시 X** — `feedback_no_secrets_in_memory.md`. env 파일에서만 read
4. **공개 카피 큰따옴표 X** — `feedback_no_double_quotes.md`
5. **Brand visual cue 분리** — `feedback_brand_separation_seizn.md`. Celovin·Notrivo·TheLabForge·Usan과 공유 X
6. **Codex dispatch prompt 표준 양식** — `feedback_codex_dispatch_template.md`

---

## 2. Chain 진행 룰

1. Phase 순서: **Phase 0 → Phase D′ → Phase B‴ → Phase A′**
2. 각 phase: 변경 → typecheck → test → lint → build → signoff doc 작성 → commit → push → 다음 phase 시작
3. 한 phase에서 typecheck·test·lint·build 1개라도 실패 → **즉 halt·다음 phase 진행 X·보고**
4. 한 phase의 acceptance criteria 1개라도 미충족 → halt·보고
5. commit prefix: `fix(launch): phase <0/D'/B'''/A'> — <summary>` (Phase 0는 `docs(launch): ...`)
6. signoff path:
   - Phase 0: 본 핸드오프 문서 §6에 완료 표시 (별 signoff doc X)
   - Phase D′: `docs/author-memory-v3-llm-phaseD-prime-signoff.md`
   - Phase B‴: `docs/author-memory-v3-llm-phaseB-triple-prime-signoff.md`
   - Phase A′: `docs/author-memory-v3-llm-phaseA-prime-signoff.md`
7. 각 phase commit 후 즉 push (origin 반영)·Vercel auto-build status 확인은 사용자 검토

---

## 3. Phase 0 — Doc cleanup (1 item·M)

**범위**: launch-codex-tasks.md acceptance 문구 5-tier → 4-tier 정정.

### M. 4 tier × 2 cadence = 8 flows 정합

- `docs/architecture/seizn-author-launch-codex-tasks.md` 다음 line 정정:
  - `:108·139·417·427` (Codex 감사에서 명시)
  - 모든 "5 tier × 2 cadence = 10 flows" 또는 동등 문구 → "4 tier × 2 cadence = 8 flows" (Indie·Pro·Studio·Enterprise · monthly·yearly)
  - Phase D signoff 정정 노트 (이미 박힘) 정합
- v7 SKU 4 tier 정합·metered overage는 별 meter (5번째 tier X)

**Acceptance**:
- [x] `grep -n "5 tier\|10 flows" docs/architecture/seizn-author-launch-codex-tasks.md` = 0 매치
- [x] `4 tier × 2 cadence = 8 flows` 양식 정합·Phase B·D·H acceptance 모두 8 flows로 통일
- [x] commit + push (별 signoff doc X·본 §6에 완료 표시)

**Phase 0 completion note (2026-05-03)**:
- Updated `docs/architecture/seizn-author-launch-codex-tasks.md` Phase B and Phase D acceptance from 5-tier/10-flow wording to the v7 4-tier/8-flow model.
- Verification passed: residual `5 tier|10 flows|10 흐름` grep returned zero matches, `npm run typecheck`, `npm run test:run` (137 files, 1145 passed, 16 skipped), `npm run lint`, and `npm run build`.

**예상 시간**: ~5분

---

## 4. Phase D′ — Landing fixes (6 items: A·E·F·G·H·I)

**범위**: H+A+C+D chain 완료 후 발견된 landing 결함 fix.

### A (P0). yearlyNote 미스로케이션

- `src/components/landing/author-flagship-landing.tsx:738`
- 현: Inputs 섹션 subhead로 `copy.pricing.yearlyNote` 렌더 ("Yearly saves about 15 percent")
- 정정: Inputs 섹션 전용 subhead 카피 신규 추가 (`copy.inputs.subtitle` 또는 동등) — 4 lang 모두
- Inputs 섹션 의도: "실제 작가 습관에 맞춘 입력 방식" 도입부·yearly billing 무관

### E (P1). engine.seizn.com DNS dead·landing 링크 broken

- `src/components/landing/author-flagship-landing.tsx:655` (nav)·`:848` (footer)
- DNS 활성화는 사용자 권한 (W7+ NPC surface 활성화 시점)
- Codex 처리: env gate 추가 — `NEXT_PUBLIC_ENGINE_SURFACE_LIVE=1` 시만 cross-link 표시·default off
- env off 상태에서 nav·footer engine 링크 hidden (또는 'Coming soon' 비활성 chip)
- env 등록 위치 추가: `~/.codex/private/consolidated/litheon.env` 명시 (사용자 등록은 별·Vercel Preview·Production scope 등록 필요)

### F (P1). nav engine 링크 rel/target 누락

- 같은 파일 `:655` `<a href="https://engine.seizn.com">` 만
- footer (`:1080`) 양식 정합으로 `target="_blank" rel="noopener noreferrer"` 추가
- env gate 적용 후에도 동일 정합 유지

### G (P1). Footer copyright 형식 + entity Litheon LLC

- 같은 파일 `:858` `© 2026 Seizn. {copy.localeLabel}`
- 정정: `© 2026 Litheon LLC` (단독·localeLabel 제거·entity 정합)
- 또는 `© 2026 Seizn by Litheon LLC` (브랜드 + 법인)
- 권장: 후자 (브랜드 표시 + 법인 명시 = 양쪽 만족·SEO·신뢰)
- entity 근거: `corp-structure-litheon.md`·Litheon LLC = Seizn 법적 owner

### H (P1). KO hero 줄바꿈 어색

- 같은 파일 `:257` KO hero title `작품의 기억을, 흩어지지 않게.`
- 현 렌더: 1440px 기준 `작품의 기억을, 흩어지지\n않게.` ("않게" 단독 줄)
- 정정: hero `max-w-3xl`·KO에서만 응집되도록 비분리 공백 (` `) 또는 `<br/>` 명시 줄바꿈 — `작품의 기억을,` / `흩어지지 않게.` 2줄 균형
- 또는 KO hero title 카피 재작성 — `작품의 기억을, 작가의 손으로.` 식 균형 잡힌 2-block 양식
- 4 lang 동일 검증 (en·ja·zh-hans·1440px·768px·360px 줄바꿈 균형)

### I (P2). Saebyeok loader parse/fallback 부재

- `src/lib/sample-ip-demo.ts:39-56·112-114`
- `src/app/[locale]/page.tsx:30-34`·`src/app/[locale]/demo/page.tsx:20-24`
- 현: 7 파일 중 1개 누락·JSON 파싱 실패 시 landing/demo 500
- 정정:
  - 파일별 fs read + JSON.parse try/catch
  - 실패 시 `{ ok: false, file, error }` 결과 반환·loader가 partial fallback (가능한 데이터만 렌더)
  - landing hero·demo widget이 missing field에 robust (optional chaining + 기본값)
  - error UI: 'Sample data temporarily unavailable' placeholder card (4 lang)
- unit test ≥ 4 cases (정상·1파일 누락·JSON 파싱 실패·전체 누락)

**Acceptance (Phase D′)**:
- [ ] Inputs 섹션이 `copy.inputs.subtitle` (신규 카피) 표시·4 lang
- [ ] engine cross-link env gate 작동·default off·env on 시 nav+footer 둘 다 작동
- [ ] nav engine 링크 `target="_blank" rel="noopener noreferrer"`
- [ ] Footer copyright `© 2026 Seizn by Litheon LLC` 단독 표시 (localeLabel 제거)
- [ ] KO hero 줄바꿈 균형·4 lang × 3 viewport (1440·768·360) 모두 자연
- [ ] Saebyeok loader fallback·error UI·unit test ≥ 4 cases
- [ ] `npm run typecheck·test·lint·build` 통과
- [ ] Test baseline 1145 + Phase D′ 신규 ≥ 8 cases
- [ ] `docs/author-memory-v3-llm-phaseD-prime-signoff.md` 작성

**예상 시간**: 0.5~1 working day

---

## 5. Phase B‴ — Billing/budget/BYOK fixes (4 items: B·C·D·J)

**범위**: 결제 흐름 hidden bugs (Phase B′·B″ 후 잔존).

### B (P1). 중복 sub 차단·Stripe live check

- `src/app/api/billing/checkout/route.ts:86-97·154-174·222-236`
- 현: 로컬 `profiles.stripe_subscription_id`만 조회·webhook 지연·DB stale 시 우회 가능
- 정정:
  - `stripe_customer_id` 존재 시 Checkout 생성 전 `stripe.subscriptions.list({ customer, status: 'all', limit: 10 })` live 조회
  - 활성 status (`active`·`trialing`·`past_due`) 발견 시:
    - 로컬 `profiles.stripe_subscription_id` sync (recover from stale DB)
    - portal redirect (`/api/account/billing-portal`)
    - 새 Checkout 생성 X
  - `canceled`·`incomplete`·`incomplete_expired` 만 새 Checkout 허용
- unit test ≥ 5 cases (DB stale·webhook 지연·정상 active·canceled·multiple subscriptions)

### C (P1). Token cap unit 불일치

- `src/lib/author/llm/anthropic-client.ts:83-116`
- `src/lib/author/billing/token-budget.ts:107-132·156-181`
- `src/lib/author/llm/usage-store.ts:100-105`
- 현 단위 mismatch:
  - cap/display = `total_tokens` (input + output)
  - pre-call budget = `maxTokens` (output cap만)
  - post-call meter = `output_tokens` only
- 큰 input prompt → cap 초과인데 invoice overage = 0 또는 과소
- 정정:
  - **단일 'billable managed token' field 정의** — 권장: `total_tokens` (Anthropic SDK `usage.input_tokens + usage.output_tokens`·cache write/read는 별 metric)
  - cap·display·meter 모두 동일 field 참조
  - pre-call budget = `estimated total` (input length + maxTokens)·input pre-counter 사용
  - post-call meter = 실 `total_tokens` (Anthropic 응답에서)
  - cache 토큰 처리: design spec 정의 (cache write ×1.25·read ×0.1 weighted) — `seizn-author-pricing-2026-05.md` v7 정합
- unit test ≥ 6 cases (큰 input·작은 output·cache hit·정상·BYOK·budget 초과)

### D (P1). BYOK DELETE service 상태 미clear

- `src/app/api/account/byok/route.ts:20-35·49-66`
- `src/app/api/account/usage/route.ts:12-42`
- 현: POST → `service.saveByok()` active 설정·DELETE → service 미clear·이후 GET이 DB missing 시 `service.getByok()` fallback → UI/usage가 stale active 표시
- 정정 (둘 중 1):
  - **권장**: DELETE에서 `service.clearByok(userId)` 호출 추가
  - 또는: Supabase service-role 구성된 환경에서 GET fallback 제거·DB 단일 source of truth
- unit test ≥ 3 cases (POST→GET·DELETE→GET·POST→DELETE→GET stale 차단)

### J (P2). Settings subscription yearly cadence 무시

- `src/components/settings/subscription-section.tsx:16-32·68-73`
- 현: API가 `stripe_price_id` 반환하지만 UI는 항상 월가 ($39/mo 식)
- 정정:
  - `stripe_price_id` → cadence 매핑 (env price ID → monthly|yearly 분류·`stripe-config.ts` lookup)
  - yearly cadence 시 yearly 가격 + 'per year' 표시·연간 절약 (~15%) 명시
  - trial 종료일·갱신일 yearly 정합
- unit test ≥ 4 cases (Indie monthly·Indie yearly·Pro monthly·Pro yearly)

**Acceptance (Phase B‴)**:
- [ ] Checkout route Stripe live check·active sub 발견 시 portal redirect·DB sync
- [ ] Token unit 'total_tokens' single source·cap·display·meter 모두 정합
- [ ] BYOK DELETE 후 GET = missing·UI·usage 정합
- [ ] Settings yearly cadence 정확 표시
- [ ] Migration 필요 여부 확인 (cap/meter unit 변경 시 historical data 재계산 또는 baseline reset)
- [ ] `npm run typecheck·test·lint·build` 통과
- [ ] Test baseline + Phase B‴ 신규 ≥ 18 cases (5+6+3+4)
- [ ] `docs/author-memory-v3-llm-phaseB-triple-prime-signoff.md` 작성

**예상 시간**: 1~1.5 working day

---

## 6. Phase A′ — Legal i18n + beta banner sync (2 items: K·L)

**범위**: Phase A 산출물 hidden bugs (i18n + 시간 기반 banner).

### K (P2). Beta banner ↔ frontmatter beta_until sync

- `src/components/legal/beta-disclosure-banner.tsx:8-15·39-66`
- `legal/{en,ko,ja,zh}/beta-disclaimer.md:9-10` frontmatter `beta_until: 2026-08-31`
- 현: banner 표시·dismiss 흐름이 frontmatter와 분리·날짜 변경 시 UI 드리프트
- 정정:
  - banner가 build time에 frontmatter `beta_until` read·`<time dateTime="...">` 또는 props로 표시
  - 현재 시점 > beta_until 시 banner 자동 숨김 (또는 'Beta period ended' 카피로 전환)
  - 단일 source 양식 — frontmatter가 SSOT·banner는 read-only consumer
- unit test ≥ 3 cases (현재 < beta_until·현재 > beta_until·dismiss 후 cookie 정합)

### L (P2). Legal nav label 영어 고정

- `src/lib/legal-routes.ts:13-17` `LEGAL_DOCUMENT_LABELS`
- `src/components/legal/legal-document-page.tsx:39-44·105-126`
- 현: 본문은 4 lang 정합·legal nav (Privacy·Terms·Beta Disclosure) 탭 label만 영어 고정
- 정정:
  - `LEGAL_DOCUMENT_LABELS`을 `Record<Locale, Record<DocumentType, string>>` 양식으로 확장
  - 4 lang label:
    - en: Privacy / Terms / Beta Disclosure
    - ko: 개인정보·이용약관·베타 고지
    - ja: プライバシー·利用規約·ベータ開示
    - zh-hans: 隐私·条款·Beta 披露
  - Footer + nav 모두 정합
- unit test ≥ 4 cases (4 lang × nav label 검증)

**Acceptance (Phase A′)**:
- [ ] Beta banner frontmatter SSOT·날짜 기반 표시/숨김
- [ ] Legal nav label 4 lang 정합
- [ ] `npm run typecheck·test·lint·build` 통과
- [ ] Test baseline + Phase A′ 신규 ≥ 7 cases
- [ ] `docs/author-memory-v3-llm-phaseA-prime-signoff.md` 작성

**예상 시간**: 0.25~0.5 working day

---

## 7. 범위 외 (사용자·별 cycle)

### P2 디자인 polish (Claude Designer cycle)

- N. Hero subtitle 3 문장 과밀
- O. Canon graph mock edge 0 (시각 차별화)
- P. Demo 섹션 좌우 redundancy
- Q. Engine cross-link tease 강화
- R. Mobile/tablet hero 빈약 (HeroGraphBackdrop lg+ 한정)
- S. CTA flow friction (hero primary CTA → /pricing → checkout 2 step)
- T. Workflow 섹션 시각 차별화 0
- U. 'S' monogram brand mark 플레이스홀더

→ Claude Designer cycle (~1~2 day·V1 launch 전)

### 사용자 권한

- E DNS 활성화: `engine.seizn.com` Cloudflare/DNS provider 등록·NPC surface stub 페이지 또는 Author redirect 결정
- V Vercel SSO: preview public 공유 결정·protection bypass token 발급 또는 Production deploy로 promotion
- v7 yearly cadence migration: Phase B‴ C item이 token unit 변경 시 historical user usage 재계산 또는 baseline reset 필요·사용자 정책 결정

---

## 8. Chain 완료 보고 양식

chain 끝나면 1회 통합 보고:
- 4 phase commit hash list (Phase 0·D′·B‴·A′)
- 누적 test count·1145 baseline 대비 증가량
- 변경 파일 list per phase
- signoff doc 3개 (Phase 0는 본 핸드오프 §6 완료 표시)
- Vercel preview build status (가능 시·SSO 401이라 사용자 검토)
- chain 시작-끝 시간

실패 시 부분 보고:
- 완료 phase list + commit hash
- 실패 phase + 에러 로그
- 진행 상태 (commit·signoff 어디까지)

---

## 9. Codex dispatch prompt

```text
작업 디렉토리: C:/Users/admin/Projects/seizn
실행 대상: H+A+C+D chain audit fix·Phase 0 → D′ → B‴ → A′ 순차 chain·각 phase verify (typecheck·test·lint·build) + signoff + commit + push 후 다음·실패 시 즉 halt + 보고
지침 분리 문서: docs/architecture/seizn-author-audit-fix-handoff.md
```

본 핸드오프 단일 문서 self-contained·다른 문서 추가 read 없이 진행 가능. 의문 시 §0 컨텍스트·§1 절대 룰·§2 chain 진행 룰·§3~6 phase 명세 순서로 참조.
