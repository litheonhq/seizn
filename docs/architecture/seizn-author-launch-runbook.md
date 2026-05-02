---
doc_type: launch-runbook
version: v1
generated_at: 2026-05-02
status: handoff-ready (revenue-bootstrap path locked)
applies_to: Seizn Author 베타 launch — P0~P2 task list·새 세션 self-contained pickup
audience: 새 Claude Code 세션·Codex CLI·사용자 본인
pair_with:
  - seizn-author-memory-v3.md
  - seizn-author-memory-v3-llm-integration.md
  - seizn-author-memory-v3-llm-integration-tasks.md
  - ../marketing/dual_surface_positioning.md
  - ../marketing/seizn_author_landing_brief.md
  - ../migrations/20260502-r2-litheon-migration.md
---

# Seizn Author Launch Runbook — Revenue-Bootstrap Path

> 새 Claude Code 세션이 컨텍스트 0에서 인계받을 수 있도록 *self-contained* 작성. 결정 history·현 상태·P0~P2 task list·acceptance criteria·기존 산출물 참조 모두 포함.

## 1. 결정 lock (2026-05-02)

**Path**: revenue-bootstrap (Stripe 결제 받기 → 매출 → Mercury deposit → Phase 6 R2 Litheon migration → 풀 launch)

**기각된 대안**:
- 자본 출자 ~$300 (옵션 C·자금 의향 X로 기각)
- W6 풀 launch 정상 흐름 (시간 6주·자금 부재 carry로 기각)
- Mercury 직 SWIFT 송금 (한국 은행에서 막힘)
- Wise 매개 자본 출자 (revenue-bootstrap 우선으로 보류·차후 fallback)

## 2. 현 상태 스냅샷

### 완료된 것

| 영역 | 상태 | 증거 |
|---|---|---|
| **Stripe activate + payout 등록 + 가격 v7 lock** | ✓ Indie $39·Pro $149·Studio $499·Enterprise $2,500 (월)·yearly ~15% off·Memories $0.05/unit/월·Ops $0.01/unit/월 metered·BYOK 50%·webhook·token·구 NPC tier (Starter·Plus·Pro NPC·Enterprise NPC) deactivated | 사용자 확인 (b) |
| **Phase 1~5 LLM integration backend + UI** | ✓ 1035 tests pass·typecheck·0 vulnerabilities | commits `fc1da94f·d3c74975·d4a70511·c0add945·85f1d8e5·e75a9d1e·9cb1fbcb`·signoff docs `phase1~5` |
| **R2 bucket (개인 임시)** | ✓ `seizn-author-uploads-temp` (APAC·default jurisdiction·empty) | account `892951c988b7c6bf05c45a8916df205e` |
| **R2 자격증명 등록** | ✓ `R2_AUTHOR_*` 9 키 (`~/.codex/private/consolidated/litheon.env`) | env 등록 완료 |
| **Phase 6 preflight (migration tooling)** | ✓ `scripts/migrate-r2-to-litheon.sh`·`scripts/verify-r2-integrity.ts`·runbook | commit `0c17c231` |
| **KNOT 입력 파이프라인 자료** | ✓ `docs/knot-input/` 8 산출물 (character·world·timeline·eval seed v3 100 cases 등) | 이전 cycle |
| **Seizn UI spec 9 산출물** | ✓ `docs/author-ui/` (IA·screens·user flows·components·empty/error·data contracts·query bindings·mutation matrix) | 이전 cycle |
| **Marketing brief v3 (EN-first GTM·Seizn↔KNOT 분리)** | ✓ `docs/marketing/dual_surface_positioning.md`·`seizn_author_landing_brief.md` | commit `eb1d84bd·456ff9f0` |

### 미완 (launch 진입 차단)

| 영역 | 상태 | 차단 |
|---|---|---|
| seizn.com landing (Author flagship) | ✗ 빌드 X·marketing brief lock만 | P0 |
| 합성 sample IP `Saebyeok` (live demo data) | ✗ 미제작 (캐릭 8·룰 22·사건 30·검수 case 50) | P0 |
| Privacy Policy + Terms of Service (베타 disclaimer 포함) | ✗ | P0 |
| Stripe 결제 흐름 in-app UI 연결 | △ Stripe wired·UI subscription state 검증 미확인 | P0 |
| Mercury initial deposit (Phase 6 R2 Litheon migration trigger) | ✗ 결제 매출 누적 후 unlock | P1 |
| Phase 6 실행 (R2 Litheon migration) | ✗ Mercury 활성화 후 | P1 |
| 영어권 마케팅 트랙 (Reddit·HN·Wattpad·KDP·Substack) | ✗ | P2 |
| 한국·일본·중국 secondary GTM | ✗ | P2 (W7+) |
| Claude Designer 풀 landing 디자인 | ✗ | P2 (W3~W4 별 cycle) |
| Anthropic BYOK 키 (Celovin) 등록·KNOT track | ✗ | KNOT 트랙 (병행·자금 무관) |

### 영구 차단 룰 ([feedback_seizn_knot_separation.md](C:/Users/admin/.claude/projects/c--Users-admin--codex/memory/feedback_seizn_knot_separation.md))

- Seizn 외부 산출물 (마케팅·landing·docs·blog·case study)에 KNOT 자료·캐릭·세계관 노출 0건
- Seizn live demo 데이터 = 합성 sample IP (`Saebyeok`)·공개 도메인·외부 베타 작가 동의 자료
- KNOT 내부 dogfood 사용은 허용 (외부 노출 X)

## 3. P0 — 1주차 빌드 (launch 진입 차단 해제)

### P0-1. Privacy Policy + Terms of Service draft

**범위**: Stripe 결제 받기·외부 작가 가입에 필수. 베타 단계 disclaimer 포함.

**산출물 (신규)**:
- `legal/privacy-policy.md` — 개인정보처리방침·KISA·GDPR 정합 minimum
- `legal/terms-of-service.md` — 이용약관
- `legal/beta-disclaimer.md` — *베타 단계 infrastructure 임시 개인 ownership* 투명 disclosure

**베타 disclaimer 핵심 문구 (영문 master)**:

```text
This service operates under a beta period until [2026-MM-DD]. During this
period, certain infrastructure components (file storage, payment processing
intermediation) operate under temporary personal ownership of
[iruhana25@gmail.com], pending migration to Litheon LLC, the legal data
controller. Throughout the beta and post-beta period, Litheon LLC remains
the sole data controller; your data is processed solely for providing
Seizn Author services. You may export or delete your data at any time.
```

**Acceptance criteria**:
- [ ] Privacy Policy·Terms·Beta Disclaimer 3 문서 작성 (en·ko·ja·zh — i18n 4언어 launch 준비)
- [ ] Stripe Checkout 페이지에서 ToS·Privacy 링크 노출 검증
- [ ] 변호사 검토 (가능 시·또는 W6 풀 launch 전)
- [ ] decisions.md에 "베타 disclaimer lock 결정" 블록

**예상 시간**: 1~2 working day (en master·다국어는 자동 번역 후 검수)

### P0-2. Stripe 결제 흐름 in-app UI 검증·연결

**범위**: Stripe wired·prices lock·하지만 in-app *Subscription·Trial·결제 페이지 navigation* 작동 검증.

**검증·연결 대상 파일**:
- `src/app/api/account/byok/route.ts` (이미 빌드)
- 신규 또는 검증: `src/app/api/account/subscription/route.ts` (Stripe webhook·subscription state)
- 신규: `src/app/(dashboard)/dashboard/billing/` (결제 페이지·subscription state·canecel·upgrade)
- 또는: Stripe Customer Portal embed
- `src/lib/stripe/` (있으면) — Stripe client·webhook handler·subscription sync

**Acceptance criteria**:
- [ ] Stripe Checkout 흐름 작동 (Author $39 → trial 30일 → paid)
- [ ] webhook으로 subscription state 동기 (created·updated·canceled)
- [ ] in-app에서 사용자가 plan 확인·cancel·upgrade 가능
- [ ] trial 종료 D-3 알림 (이메일 또는 in-app banner)

**예상 시간**: Stripe SDK 이미 설치돼 있으면 1~2 day·아니면 2~3 day. Codex 분업 가능.

### P0-3. 합성 sample IP `Saebyeok` 풀 설계

**범위**: seizn.com landing live demo 데이터 source. KNOT 분리 룰 정합·외부 노출 안전.

**산출물 (신규)**:

```
docs/marketing/sample_ip/
├── saebyeok_canon_v1.json           — 캐릭 8명·핵심 데이터
├── saebyeok_world_rules_v1.json     — 세계관 룰 22개
├── saebyeok_timeline_v1.json        — 사건 ledger 30 Day
├── saebyeok_relationships_v1.json   — 관계 매트릭스
├── saebyeok_review_cases_v1.json    — 검수 case 50개 (작가 only / 캐릭 인지 / scope 분리 / 시점 모순 등)
├── saebyeok_simulation_cases_v1.json — Scene Simulation 데모 5~10 case
└── saebyeok-readme.md               — 사용 룰·라벨링·KNOT 분리 정합 검증
```

**컨셉 가이드** (외부 launch에 안전한 합성 IP):
- 가상 학원 SF 단편 (한국·일본·영어권 어디에도 친숙)
- 캐릭 이름·세계관 단어가 KNOT과 명확 분리 (소리·레이카·룰루 등 KNOT 캐릭명 0건)
- 데모 라벨 명시: `Sample IP — Synthetic Demo Data`·실제 작가 작품과 무관

**Acceptance criteria**:
- [ ] 7 산출물 작성·JSON schema 정합·`docs/knot-input/` schema와 1:1 매핑 가능
- [ ] KNOT 캐릭명·세계관 단어 0건 grep 검증
- [ ] Author UI Inbox·Review·Characters·Graph·Timeline·Simulate 7 screens에서 시연 가능
- [ ] live demo widget hero에 작동 (Author landing brief §2 정합)

**예상 시간**: 2~3 working day·일관된 IP 설계·검수 case 50개 작성

### P0-4. seizn.com landing 단순 버전

**범위**: Claude Designer 풀 디자인은 W3~W4 별 cycle. 본 P0는 *minimum viable*: hero + sample IP demo + 가격 + Stripe Checkout link.

**산출물**:
- `seizn.com` (또는 dev `localhost:3000`) 라우트 빌드:
  - `/` (Author flagship hero)
  - `/pricing` (Indie $39 / Pro $149 / Studio $499 / Enterprise $2,500 + Stripe Checkout link·v7)
  - `/demo` (sample IP `Saebyeok` live demo)
  - `/legal/privacy`·`/legal/terms`·`/legal/beta-disclosure`
- `seizn_author_landing_brief.md` v3 정합 (en master·ja·zh·ko sub-routes)
- 약식 디자인 (default Tailwind·Pretendard·dawn·ivory tokens)

**Acceptance criteria**:
- [ ] hero (`작품의 기억을, 흩어지지 않게` 또는 en master) + sample IP demo widget 작동
- [ ] 가격 카드 4 tier·Stripe Checkout 흐름 연결
- [ ] legal docs 링크 footer
- [ ] cross-link to engine.seizn.com (현 seizn.com NPC 콘텐츠 우선 그대로 유지·W6+ migration)
- [ ] WCAG AA 통과·기본 i18n 4언어 (en 1순위·ja·zh·ko sub-routes)

**예상 시간**: 3~5 working day·Codex 분업 활용·디자인 풀 디테일은 W3~W4 별 cycle에 양도

## 4. P1 — 2주차 (soft launch + Phase 6 unblock)

### P1-1. Founding Member soft launch

**범위**: 직접 컨택·5~10명 작가에게 founding member 결제·early discount

**대상 작가군**:
- Twitter author community (en·#WritingCommunity·#amwriting)
- KDP author forums (en)
- Wattpad·Royal Road power users
- HN author/writer subscribers
- 작가 본인 네트워크 (단 KNOT 외부 노출 X 분리 룰 정합·KNOT IP 사례 활용 X)
- 한국 작가 (네이버 카페·Twitter)·secondary track 시작 시점 (W3+)

**Founding Member offer (v7 가격표 정합·§15 참조)**:
- *Indie yearly* $397.80 (이미 ~15% off·founding 별도 할인 X)
- 또는 *Indie monthly $39·founding 코드로 첫 3개월 50% off* ($19.50/mo·Stripe coupon 신규 발급 필요)
- 또는 *Pro yearly $1,519.80*에 founding 코드 30% off ~$1,063.86 (high-touch·1:1 onboarding 포함)
- 단순화 옵션: 첫 1~3개월 무료 (Stripe trial 연장)·신용카드 등록 X 그대로
- BYOK 작가 우선: BYOK 50% 할인 + founding 30% off 중첩 가능 검토 (Stripe coupon stack)

**Acceptance criteria**:
- [ ] 5명 이상 founding member 결제 — Stripe 매출 ≥ $500
- [ ] case study 후보 1~3명 (privacy·동의 후·`docs/marketing/case-studies/` 작성)
- [ ] feedback 수집 (in-app feedback widget·또는 Slack·email)

**예상 시간**: 1~2 주 acquisition·outreach 직접 컨택

### P1-2. Phase 6 R2 Litheon Migration 실행

**범위**: Mercury 활성화 후 즉시 Phase 6 SOP 실행. design spec §11·task pack §Phase 6 정합.

**전제 조건** (P1-1 매출 누적 후):
- Mercury initial deposit 충당 (~$100~500·요구 금액 정확 확인)
- Mercury card 발급
- Litheon Cloudflare 계정에 R2 활성화·`seizn-author-uploads` bucket (정식·Litheon 명의) 신규 생성
- API 토큰 발급·`R2_AUTHOR_NEW_*` env 등록

**실행 SOP**:

```bash
# 1. 사용자 작업: Litheon Cloudflare 계정 + R2 bucket + API token
# 2. dry run
bash scripts/migrate-r2-to-litheon.sh

# 3. 실 copy
R2_MIGRATION_EXECUTE=1 bash scripts/migrate-r2-to-litheon.sh

# 4. SHA256 verify
npx ts-node --project tsconfig.node.json scripts/verify-r2-integrity.ts \
  --json docs/migrations/r2-integrity-report.json

# 5. 코드 갱신·R2_BUCKET 변수 갱신·재배포
# 6. smoke test (upload·signed read)
# 7. 임시 bucket 삭제 (사용자)
# 8. 회계 문서 (`docs/migrations/2026MMDD-r2-litheon-migration-completed.md`)
```

**Acceptance criteria** (Phase 6 task pack §Phase 6 정합):
- [ ] 신규 bucket `seizn-author-uploads` (Litheon 명의) 작동·이전된 객체 GET·새 업로드 OK
- [ ] SHA256 integrity 100%
- [ ] 코드·env에 `temp`·`personal_temp`·`MIGRATE_BY` 흔적 0
- [ ] 임시 bucket 객체 0·bucket 폐기
- [ ] design spec §11 "Migration 완료 (YYYY-MM-DD)" 표기

**예상 시간**: 0.5 working day (자금·bucket 준비 후)

### P1-3. Stripe payout 목적지 Mercury로 전환

**범위**: Stripe payout이 현재 어느 은행인지 확인·Mercury 활성화 후 그쪽으로 전환·payout 안정화.

**Acceptance criteria**:
- [ ] Stripe payout 1회 Mercury 도착·정상 입금
- [ ] Stripe Wyoming LLC tax filing 정합 검증

**예상 시간**: 1~2 day (Mercury 인증·Stripe payout 변경)

## 5. P2 — 3주차+ (정식 public launch + 마케팅)

### P2-1. Claude Designer 풀 landing 디자인

- `seizn_author_landing_brief.md` v3 풀 사양 → Claude Designer 핸드오프
- ivory·ink·dawn 토큰·Pretendard·세리프·종이 펼침 모션
- 4 언어 (en·ja·zh·ko) 풀 카피·디자인 정합

### P2-2. 영어권 콘텐츠 마케팅 트랙

- Reddit (r/writing·r/worldbuilding·r/fantasywriters·r/selfpublish)
- Wattpad·KDP author forums
- Twitter·Substack·HN Show HN
- Indie author podcasts (The Creative Penn·Self Publishing Show)
- Product Hunt launch

### P2-3. 한국·일본·중국 secondary GTM (W7+)

- 일본: 카쿠요무·나로우·Note·Twitter 일본 작가 커뮤니티
- 중국: 微博·小红书·知乎·起点·晋江
- 한국: 네이버 카페·블로그·웹소설 작가 커뮤니티

### P2-4. engine.seizn.com NPC SDK surface 분리·부활 평가

- W7~W12 NPC surface 부활 트리거 평가 (`dual_surface_positioning.md` §4)
- Author trial 가입 ≥ 200/월·외부 작가 베타 5+ 등 충족 시 풀 launch

## 6. KNOT 트랙 (병행·자금 흐름과 무관)

**Phase 4 (Character Backlog Generation)** = 코드 작동·KNOT 5명 (소리·레이카·나나·룰루·유이) backlog 자동 generation 가능. 자금·외부 launch와 *영향 0·즉시 진행 가능*.

### KNOT 트랙 사전 조건

- Anthropic BYOK 키 (Celovin 명의) 등록 — `~/.codex/private/consolidated/celovin.env`에 `ANTHROPIC_API_KEY_CELOVIN_BYOK=sk-ant-...`
- `.env.local`에 `AUTHOR_UI_ENABLED=1`·`AUTHOR_UI_ALLOWED_EMAILS=iruhana25@gmail.com`
- 로컬 dev `npm run dev` → `/dashboard/author` 진입

### KNOT 5명 backlog generation E2E

1. Characters screen → 5명 (소리·레이카·나나·룰루·유이) 각각 *Generate Backlog* 버튼
2. LLM (Anthropic Opus 4.7·BYOK) 호출 → 각자 5~7 후보 (좋아하는 것·싫어하는 것·작은 보상·작은 짜증)
3. 작가 검수 (단축키 A·R·T·P·M·S·K·O·C·X)
4. canon promote → audit_log에 chain 기록
5. detail-guide §X.6에 sync (수동 export 또는 옵션)

### Acceptance criteria

- [ ] 5명 모두 generation 완료·각 5~7 후보 확보
- [ ] 운용 원칙 위반 0 (manual review)
- [ ] 캐릭 간 중복 후보 0 (validator emit `conflict.detected`)
- [ ] detail-guide §X.6 갱신
- [ ] decisions.md에 결정 블록 추가
- [ ] canon_version bump (v3.7.9azay 또는 다음)

### KNOT 외부 노출 0 검증

- generation 결과·trace·audit_log이 *내부 dogfood*만으로 사용
- Seizn 외부 산출물 (마케팅·landing·blog·case study)에 KNOT 자료 누설 0 — `docs/marketing/`·landing·blog grep 검증

## 7. 절대 경로 reference (새 세션 cite용)

```text
설계·아키텍처:
  C:\Users\admin\Projects\seizn\docs\architecture\seizn-author-memory-v3.md
  C:\Users\admin\Projects\seizn\docs\architecture\seizn-author-memory-v3-kickoff-plan.md
  C:\Users\admin\Projects\seizn\docs\architecture\seizn-author-memory-v3-llm-integration.md
  C:\Users\admin\Projects\seizn\docs\architecture\seizn-author-memory-v3-llm-integration-tasks.md
  C:\Users\admin\Projects\seizn\docs\architecture\seizn-author-launch-runbook.md (본 문서)

마이그레이션·migration:
  C:\Users\admin\Projects\seizn\docs\migrations\20260502-r2-litheon-migration.md
  C:\Users\admin\Projects\seizn\scripts\migrate-r2-to-litheon.sh
  C:\Users\admin\Projects\seizn\scripts\verify-r2-integrity.ts

UI 사양 9 산출물:
  C:\Users\admin\Projects\seizn\docs\author-ui\author_ui_information_architecture.md
  C:\Users\admin\Projects\seizn\docs\author-ui\author_ui_screen_specs.md
  C:\Users\admin\Projects\seizn\docs\author-ui\author_ui_user_flows.md
  C:\Users\admin\Projects\seizn\docs\author-ui\author_ui_component_inventory.md
  C:\Users\admin\Projects\seizn\docs\author-ui\author_ui_empty_error_states.md
  C:\Users\admin\Projects\seizn\docs\author-ui\author_ui_data_contracts.json
  C:\Users\admin\Projects\seizn\docs\author-ui\author_ui_query_bindings.json
  C:\Users\admin\Projects\seizn\docs\author-ui\author_ui_mutation_invalidation_matrix.md
  C:\Users\admin\Projects\seizn\docs\author-ui\author_scene_simulation_output_contract.json

KNOT 입력 8 산출물 (Seizn 외부 노출 X·내부 only):
  C:\Users\admin\Projects\seizn\docs\knot-input\source_manifest.json
  C:\Users\admin\Projects\seizn\docs\knot-input\canon_authority_rules.md
  C:\Users\admin\Projects\seizn\docs\knot-input\review_taxonomy.md
  C:\Users\admin\Projects\seizn\docs\knot-input\character_registry.json
  C:\Users\admin\Projects\seizn\docs\knot-input\world_rule_registry.json
  C:\Users\admin\Projects\seizn\docs\knot-input\relationship_matrix.json
  C:\Users\admin\Projects\seizn\docs\knot-input\timeline_event_ledger.json
  C:\Users\admin\Projects\seizn\docs\knot-input\knot_author_eval_seed_v3.json

마케팅 brief v3 (EN-first GTM·KNOT 분리):
  C:\Users\admin\Projects\seizn\docs\marketing\dual_surface_positioning.md
  C:\Users\admin\Projects\seizn\docs\marketing\seizn_author_landing_brief.md

Phase signoff (Codex 작업 증거):
  C:\Users\admin\Projects\seizn\docs\author-memory-v3-llm-phase1-signoff.md
  C:\Users\admin\Projects\seizn\docs\author-memory-v3-llm-phase2-signoff.md
  C:\Users\admin\Projects\seizn\docs\author-memory-v3-llm-phase3-signoff.md
  C:\Users\admin\Projects\seizn\docs\author-memory-v3-llm-phase4-signoff.md
  C:\Users\admin\Projects\seizn\docs\author-memory-v3-llm-phase5-signoff.md

KNOT SSOT (canon-verify 룰·Seizn 외부 노출 X):
  C:\Users\admin\Projects\knot\canon.md
  C:\Users\admin\Projects\knot\INDEX.md
  C:\Users\admin\Projects\knot\worldbuilding\short1-characters.md
  C:\Users\admin\Projects\knot\worldbuilding\short1-character-detail-guide.md

자격증명·env (raw value 메모리 X·env 파일에만):
  ~/.codex/private/consolidated/litheon.env (R2_AUTHOR_*·Stripe·Cloudflare 등)
  ~/.codex/private/consolidated/celovin.env (Anthropic BYOK·Celovin 명의 — KNOT 트랙 한정)
```

## 8. 관련 메모리 룰

새 세션이 본 runbook 이용 시 다음 메모리 룰 정합 필수 ([feedback_*.md](C:/Users/admin/.claude/projects/c--Users-admin--codex/memory)):

- `feedback_seizn_knot_separation.md` — Seizn 외부 산출물에 KNOT 자료 노출 0
- `feedback_entity_separation_ip.md` — Celovin·Litheon 자금·IP·코드 분리
- `feedback_no_secrets_in_memory.md` — 메모리에 raw secret 저장 X·env 파일에만
- `feedback_no_double_quotes.md` — 공개 카피에 큰따옴표 X
- `feedback_brand_separation_seizn.md` — Seizn visual cue Celovin·Notrivo·TheLabForge·Usan과 공유 X
- `feedback_codex_sequential_execution.md` — Codex 배치 sequential·병렬 X
- `feedback_codex_dispatch_template.md` — Codex prompt 표준 양식 (작업 디렉토리·실행 대상·지침 분리 문서)
- `feedback_delegate_implementation_to_codex.md` — 디자인·카피·스펙은 Claude·구현은 Codex
- `seizn-pivot-creative-writing-2026-05.md` — 2nd pivot 후보 (작가 도구)
- `seizn-author-pricing-2026-05.md` — 가격 v7 lock ($39/$149/$499/$2,500·yearly·metered·BYOK 50%)
- `seizn-dual-surface-decision-2026-05.md` — Dual surface split 결정
- `litheon-r2-personal-temp-2026-05.md` — R2 개인 임시·W6 이전 Litheon 강제

## 9. Decision history (새 세션 컨텍스트)

- 2026-05-02 — Seizn Author Memory v3 LLM 통합 5 phase 풀 빌드 완료 (Codex)
- 2026-05-02 — R2 bucket `seizn-author-uploads-temp` 개인 명의 임시 시작·APAC region·default jurisdiction
- 2026-05-02 — R2 ENAM 변경 시도 (DELETE + POST) — 한국 IP에서 자동 APAC 강제·`locationHint` 무시·APAC 유지 결정
- 2026-05-02 — Litheon LLC 카드 발급 불가·Mercury initial deposit 강제 확인
- 2026-05-02 — 한국 은행 → Mercury 직 SWIFT 막힘
- 2026-05-02 — Stripe (b) activate + payout 등록 + 가격 lock 확인
- 2026-05-02 — **revenue-bootstrap path lock** (본 결정·자본 출자 우회·Stripe 매출 → Mercury deposit → Phase 6 R2 Litheon migration)
- 2026-05-02 — Stripe 옛 NPC tier 4 product (Apr 8 Starter·Plus·Pro NPC·Enterprise NPC) deactivate·옛 prices 일괄 deactivate
- 2026-05-02 — Stripe 가격 v6 ($999 Pro·$299 Studio) 역전 발견 → **v7 lock** ($149 Pro·$499 Studio·Opus 4.7 cost-aligned)·새 price 발급·옛 deactivate·env STRIPE_PRICE_LOCK_VERSION=v7
- 2026-05-02 — Codex Phase B (Stripe billing) 풀 구현 commit `840dcbae`·typecheck·test·lint·build 통과 (1068 tests)
- 2026-05-03 — Paddle 잔존 코드 dead 확인·삭제 commit `c0195898` (paddle-init·webhook handler·paddle-config 3 파일·721 lines deleted)
- 2026-05-03 — Vercel preview env 7개 추가 (`AUTHOR_UI_ENABLED`·`AUTHOR_UI_ALLOWED_EMAILS`·`ANTHROPIC_API_KEY`·`R2_AUTHOR_*` 4)·branch alias `seizn-git-feat-npc-memory-pivot-litheon.vercel.app` ready·KNOT 5명 backlog generation dogfood 진입 가능
- 2026-05-03 — **Codex self-audit (Phase B)** 6 findings (P0×1·P1×3·P2×2)·정적 검증으로 잡히지 않는 결제·메터·중복구독·관리형 토큰 미작동·BYOK 우회·discount 표시·gate 일관성 결함 발견·**Phase B′** (P0+P1×3·블로커) + **Phase B″** (P2×2·후순위) 분리 dispatch 결정·dogfood (BYOK 전용·결제 X) 차단 X·preview 진행 그대로

## 10. 새 세션 시작 권장 순서

1. **본 runbook 풀 read** (최우선)
2. **canon-verify 룰 인지** — KNOT 관련 작업 시 `Projects/knot/canon.md` + `INDEX.md` Read 선행
3. **현 git 상태 확인** — `git log --oneline | head -20`·`git status --short`
4. **메모리 인덱스 확인** — `MEMORY.md` 풀 read
5. **P0~P2 task list에서 시작 지점 결정**:
   - P0-1 Privacy/ToS 시작?
   - P0-2 Stripe 흐름 검증 시작?
   - P0-3 sample IP 설계 시작?
   - P0-4 landing 빌드 시작?
   - 또는 KNOT 트랙 (Anthropic BYOK 등록 후 5명 backlog generation) 병행 시작?
6. 사용자 결정 받고 진행

## 11. Stripe 추가 점검 (새 세션 시작 시)

**가격·Product (v7 lock — `~/.codex/private/consolidated/litheon.env` STRIPE_PRICE_LOCK_VERSION=v7)**:

- 활성 Product 5개:
  - `Seizn Indie` $39/mo·$397.80/yr (`prod_UNGacXMozktNgE`)
  - `Seizn Pro` $149/mo·$1,519.80/yr (`prod_UNGajiXXpdiSYR`)
  - `Seizn Studio` $499/mo·$5,089.80/yr (`prod_UNGa1KL7DhxWGw`)
  - `Seizn Enterprise` $2,500/mo·$30,000/yr (`prod_UNGaW9bFkuycVQ`)
  - `Seizn Metered Overage` Memories $0.05/unit·Ops $0.01/unit (`prod_UNRnTbBPgIPLrR`)
- Deactivated (history): 옛 NPC tier 4 product (Apr 8 Starter·Plus·Pro·Enterprise)·옛 v6 가격 (Pro $999·Studio $299)
- Trial 30 day·신용카드 등록 X (`seizn-author-pricing-2026-05.md` v7)
- BYOK 50% 할인 — *Stripe coupon 또는 별 price 분기 빌드 필요* (Phase 1~5에 wired 안 됨·P0-2에서 검증·연결)

**webhook**:
- `checkout.session.completed`·`customer.subscription.updated`·`invoice.payment_failed` 이벤트 listening
- in-app subscription state sync 검증

**payout**:
- Stripe Dashboard → Settings → Payouts → 등록된 bank 확인
- Mercury 미활성화 (initial deposit 미충당) 상태에서 어느 bank으로 wired됐는지 — Phase 6 시점 Mercury로 전환 대상

## 12. Phase 6 unblock 흐름

```text
Stripe 매출 누적 (P1-1 founding member)
   ↓
Mercury initial deposit 도달 (~$100~500)
   ↓
Mercury card 발급·full activation
   ↓
Litheon Cloudflare R2 bucket 신규 생성 (Litheon 명의)
   ↓
R2_AUTHOR_NEW_* env 등록
   ↓
scripts/migrate-r2-to-litheon.sh 실행 (dry run + 실 copy + verify)
   ↓
코드·env 갱신·재배포
   ↓
임시 bucket 폐기·회계 문서
   ↓
Phase 6 완료·외부 launch 정합 100% (W6 정상 흐름)
```

## 13. Risk·Open Questions

| Risk | 완화 |
|---|---|
| Founding member 5명 모집 실패 | 옵션 C 자본 출자 ~$300 fallback·Wise Business 활용 |
| Stripe payout 현재 목적지 미확인 (Mercury 미활성화 상태) | 새 세션 시 Stripe Dashboard → Settings → Payouts 등록된 bank 확인·Wise·다른 미국 은행 가능성 |
| Mercury initial deposit 강제 confirmed·자금 unblock 의존 | P1-1 founding member 매출 누적·또는 옵션 C 자본 출자 |
| 베타 사용자에 personal-name R2 개인정보 처리 disclaimer 법적 정합 | 변호사 검토·또는 W6 정상 흐름으로 회귀 |
| KNOT 5명 backlog 결과를 Seizn 외부 marketing에 노출 | grep 검증·Seizn↔KNOT 분리 룰 자동 검증 추가 |
| Phase 6 실행 시 코드·migration 충돌 | dry run + SHA256 verify·rollback path |
| W6 launch 못 하면 베타 disclaimer 만료·연장 결정 | design spec §11 launch 연기 룰 그대로 |
| v7 가격이 in-app pricing UI (`pricing-client.tsx`)에 wired 안 됐을 가능성 | P0-2 Stripe 흐름 검증 시 함께 점검·옛 v5·v6 가격 잔존 시 정정 |
| BYOK 50% coupon 또는 별 price 분기 미빌드 (Phase 1~5에 미포함) | P0-2 또는 별 cycle에서 Stripe coupon 발급·in-app BYOK 등록 후 자동 적용 |

## 14. Open decisions (새 세션이 사용자에게 받을 답)

1. **P0~P2 시작 지점** — P0-1 Privacy/ToS·P0-2 Stripe 흐름·P0-3 sample IP·P0-4 landing 중 어디부터?
2. **Codex 분업 활용 비율** — P0 4 항목 중 어디를 Codex로·어디를 Claude·어디를 사용자 본인이?
3. **KNOT 트랙 병행 여부** — P0 빌드와 동시에 KNOT 5명 backlog 시작? 또는 P0 완료 후?
4. **베타 disclaimer 변호사 검토** — 본 cycle에 포함? 또는 W6 풀 launch 전?
5. **Stripe payout 현재 목적지** — 어느 bank? (Mercury·Wise·다른 곳·확인 필요)
6. **v7 가격 in-app UI wiring 검증** — `src/app/[locale]/pricing/pricing-client.tsx`·기타 가격 노출 곳에 v7 반영됐나·옛 v5·v6 가격 잔존 시 정정
7. **BYOK 50% 할인 메커니즘 빌드** — Stripe coupon 발급 + in-app BYOK 등록 시 자동 coupon apply·또는 별 price 분기·어느 패턴?
8. **v5 lifetime deal 폐기 결정** — v5 lock에 "Pro $499 평생 (첫 100명)·Studio $1,499 평생 (첫 30명)" 있었는데 v7에선 미정·founding member offer로 통합하거나 명시적 폐기

답 받으면 P0-N task pack 또는 Codex dispatch prompt 즉시 작성.

## 15. Stripe 가격표 v7 lock (2026-05-02 confirmed·Opus 4.7 cost-aligned)

**v7 (실 Stripe 등록값·v5·v6 lock 폐기)**:

| Tier | Stripe Product ID | 월 | 연 (~15% off) | env price ID prefix |
|---|---|---|---|---|
| **Indie** | `prod_UNGacXMozktNgE` | **$39** | $397.80 | `STRIPE_PRICE_ID_INDIE_*` |
| **Pro** | `prod_UNGajiXXpdiSYR` | **$149** | $1,519.80 | `STRIPE_PRICE_ID_PRO_*` |
| **Studio** | `prod_UNGa1KL7DhxWGw` | **$499** | $5,089.80 | `STRIPE_PRICE_ID_STUDIO_*` |
| **Enterprise** | `prod_UNGaW9bFkuycVQ` | **$2,500** | $30,000 | `STRIPE_PRICE_ID_ENTERPRISE_*` |

**Metered overage (tier 한도 초과분만)**:

| Meter | 단가 | env |
|---|---|---|
| Memories | $0.05 / unit / 월 | `STRIPE_METER_ID_MEMORIES`·`STRIPE_METERED_PRICE_ID_MEMORIES` |
| Ops | $0.01 / unit / 월 | `STRIPE_METER_ID_OPS`·`STRIPE_METERED_PRICE_ID_OPS` |

**Tier 토큰 한도 (Opus 4.7 cost-aligned·overage 강제 메커니즘)**:

| Tier | tokens/mo | Opus 4.7 cost @ tier 한도 | margin |
|---|---|---|---|
| Indie | ~1M | ~$15 | 60%+ |
| Pro | ~5M | ~$75 | 50%+ |
| Studio | ~20M | ~$300 | 40%+ |
| Enterprise | 무제한 (BYOK 강제) | — | platform fee + SLA |

**BYOK 50% 할인** — 자기 Anthropic 키 등록 시 토큰 무제한·tier 가격 50% off:
- Indie BYOK: $19.50/mo
- Pro BYOK: $74.50/mo
- Studio BYOK: $249.50/mo
- Enterprise: BYOK 강제·platform fee 별 협의

**Stripe 정합 (2026-05-02 lock)**:
- 옛 v6 가격 (Pro $999·Studio $299) deactivated
- 옛 NPC tier (Apr 8: Starter·Plus·Pro NPC·Enterprise NPC) deactivated
- 활성 product 5개: Indie·Pro·Studio·Enterprise·Metered Overage
- env STRIPE_PRICE_LOCK_VERSION=v7

**Trial·BYOK·Coupon (v7 lock 정합)**:

| 항목 | 정책 |
|---|---|
| Trial | 30일·신용카드 등록 X (`seizn-author-pricing-2026-05.md` v7) |
| BYOK 50% 할인 | v7 lock — 실 Stripe coupon 또는 별 price ID *wired 미확인*·P0-2 검증 대상 |
| Founding Member | 본 runbook §P1-1·실 Stripe coupon 발급 필요 |
| Yearly | 모든 tier yearly 옵션 ~15% off (이미 wired·Stripe price 4 tier × 2 cadence active) |

**v7 lock 메모리 갱신 완료 (2026-05-02)**:
- `seizn-author-pricing-2026-05.md` → v7 lock 갱신 완료
- 옛 v5·v6 lock 표는 history 섹션에 보존
- Seizn project decisions.md (있다면) v7 결정 블록 추가 — 별 cycle (현재 Seizn에 decisions.md 표준 패턴 미확립)

## 16. v5 → v7 가격 변천 (2026-05-02 lock)

| Tier | v5 lock (memory) | v6 실 Stripe (history) | **v7 (현 lock·Opus 4.7 cost-aligned)** | 결정 |
|---|---|---|---|---|
| Indie (구 Author) | $39 | $39 | **$39** | 그대로 |
| Pro | $129 | $999 ⚠️ | **$149** | v5 위 약간·Opus cost margin 50%+·시장 정합 |
| Studio | $399 | $299 | **$499** | Opus cost margin·5명 share 정합 |
| Enterprise | from $1,500 | $2,500 | **$2,500** | fixed·BYOK 강제 |

**v6 → v7 변경 (2026-05-02)**:
- Pro $999 → $149 (시장·Opus cost·tier ladder 정합)
- Studio $299 → $499 (cost margin 정합)
- Indie·Enterprise·yearly·metered 그대로
- 옛 NPC tier (Apr 8 Starter·Plus·Pro·Enterprise) deactivated

**Marketing brief 갱신 완료 (2026-05-02)**:

`docs/marketing/seizn_author_landing_brief.md` §3.7 §08 Pricing — v7 정합 갱신 완료:
- 가격 카드 4 tier (Indie $39·Pro $149·Studio $499·Enterprise $2,500)
- Yearly toggle·~15% off
- Tier 토큰 한도 명시
- Metered overage footnote (tier 초과분만)
- BYOK 50% 할인 (Settings → API Keys)

**FAQ §3.8 갱신 완료**:
- "내가 토큰 한도 초과하면?" → Memories·Ops unit overage·tier 초과분만·자세히 docs
- "yearly 결제하면?" → ~15% off (2달 무료)
- "BYOK 어떻게?" → 자기 Anthropic 키·tier 가격 50% off + 토큰 무제한
- "Pro vs Studio?" → Pro = 개인 power user (multi-IP·heavy LLM)·Studio = small team (5명·collaborative)

---

**본 runbook은 새 세션 self-contained pickup 정합으로 작성**. 본 문서 + 절대 경로 reference §7·메모리 룰 §8만 참조하면 컨텍스트 0에서 launch 흐름 즉시 진입 가능.
