# SEIZN AI 핸드북 (Claude Code / Codex / ChatGPT Pro 공통)

> 목적: **Seizn = 검색/리트리벌 인프라 플랫폼**을 AI만으로도 계속 개발/운영 가능하게 만드는 “작업 지시서(Work Order) + 운영 규칙 + PR 단위 백로그” 문서.
>
> 이 문서는 사람이 0명이어도(=AI only) 진행 가능한 수준으로 **단계/파일/검증 기준**을 명시한다.

---

## 0) 무엇을 어디까지 주면 되나? (AI 컨텍스트 최소/권장 세트)

### 최소 세트 (추천)
1. **실제 Seizn 레포(=작업 대상)**
   - Claude Code/Codex가 GitHub로 레포를 직접 읽을 수 있으면, 별도 텍스트 덤프는 없어도 됨.
2. `CLAUDE.md` (전역 작업 규칙)
3. `docs/AI_PLAYBOOK_SEIZN_INFRA.md` (Seizn Infra 플레이북)
4. `scripts/smoke-test-summer.sh` (MVP 회귀 테스트)

### 오프라인/컨텍스트 제한 환경일 때 (선택)
- 레포 전체 스냅샷(zip) 또는 `seizn-core.txt`, `seizn-api.txt`, `seizn-structure.txt`

### 중요한 결론
- **`seizn-infra-scaffold.zip` 하나가 Summer/Fall/Winter(+Federated/Answer Contract/Training)까지 포함한 “상위 집합”**이다.  
  따라서 예전 `seizn-summer-scaffold.zip`는 *중복*이므로 추가로 주지 않아도 된다.
- 단, **실제 머지/통합 작업**을 하려면 “스캐폴드”만으로는 부족하고, **작업 대상 레포**를 AI가 읽을 수 있어야 한다.

---

## 1) 스캐폴드 머지(적용) 체크리스트

> 목표: `seizn-infra-scaffold.zip` 내용이 Seizn 레포에 안전하게 들어가고, DB 마이그레이션이 적용되고, 최소 Smoke Test가 통과하는 상태.

### 1.1 머지 방식
- 권장: **파일 덮어쓰기 없는 rsync/robocopy 방식**으로 필요한 폴더만 추가
  - 추가될 경로(대표):
    - `src/app/api/summer/*`
    - `src/app/api/fall/*`
    - `src/app/api/winter/*`
    - `src/lib/summer/*`
    - `src/lib/fall/*`
    - `src/lib/winter/*`
    - `supabase/migrations/021_*.sql` ~ `026_*.sql`
    - `services/reranker-training/*` (선택)

### 1.2 DB 마이그레이션
- 적용 순서(고정):
  1) `021_summer_schema.sql`
  2) `022_fall_observability.sql`
  3) `023_fall_eval_experiments.sql`
  4) `024_winter_governance.sql`
  5) `025_summer_versioning.sql`
  6) `026_summer_federated.sql`

### 1.3 타입/스키마 동기화
- Supabase 타입이 `src/types/database.ts`에 고정되어 있으면:
  - Supabase CLI로 타입 재생성 → 커밋
  - 생성 불가 환경이면: 변경분만 수동 반영(임시) 후, 다음 단계에서 CLI로 교체

### 1.4 Smoke Test
- 최소 통과 기준:
  1) collection 생성
  2) index(문서 1개) → chunks 생성 + embedding 저장
  3) retrieve(쿼리 1개) → results 반환 + trace 기록

---

## 2) 절대 규칙(Non‑negotiables)

### 2.1 보안/테넌시
- 모든 API는 기본적으로 `authenticateRequest()`를 거친다.
- **user_id / collection_id 조건이 없는 쿼리는 금지** (RLS 우회 위험)
- Service Role은 서버에서만 사용. 브라우저에 노출 금지.

### 2.2 비용/쿼터
- 모든 유료 자원(임베딩/리랭킹/검색)은 **usage metric** 기록을 남긴다.
- Free 플랜은 기본적으로 rerank OFF + 낮은 topK.
- “Autopilot”이 있어도 **예산/지연시간 가드레일**을 절대 넘기지 않게 설계.

### 2.3 관측 가능성
- retrieval 관련 엔드포인트는 반드시 **trace(request_id)**를 남긴다.
- trace에는 “왜 이 chunk가 선택되었는지”를 설명 가능한 이벤트가 포함되어야 함.

### 2.4 PII
- 사용자 쿼리/문서에 PII 가능성이 있다면:
  - 저장 전 마스킹/해시/암호화 정책을 우선 적용
  - trace에 “원문 chunk 텍스트”를 저장하는 것은 기본 금지(필요 시 샘플링+마스킹)

---

## 3) AI 협업 운영 모델 (사람 없이도 돌아가게)

### 3.1 역할 고정
- **Builder (Claude Code)**: 기능 구현 + 마이그레이션 + API 라우트
- **Tester (Codex)**: smoke-test, regression test, 실패 로그 정리
- **Reviewer (ChatGPT Pro)**: 보안/과금/성능/제품 관점 리뷰 체크리스트

### 3.2 PR 규칙
- PR 1개 = 기능 1개 (파일 변경 10개 이하 목표)
- 모든 PR에는:
  - API 스펙(요청/응답 예시)
  - DB 변경(있다면 마이그레이션)
  - smoke-test 또는 재현 절차
  - 롤백 가이드

### 3.3 충돌 방지
- 동시에 같은 폴더(예: `src/lib/summer/pipeline/*`)를 두 AI가 만지지 않는다.
- 작업 전, Issue에 “I’m working on this” 코멘트로 락을 건다.

---

## 4) 우선순위 로드맵 (AI-only 기준, 실패해도 내부 인프라로 남게)

> 목표: “Seizn Summer(검색) + Fall(관측/평가/자기최적화) + Winter(정책/삭제/PII)”의 MVP를 먼저 만든다.

### Milestone 0 — Summer MVP (검색 파이프라인)
- [ ] Collections API
- [ ] Index API (ingest → chunk → embed → upsert)
- [ ] Retrieve API (vector/hybrid/keyword + optional rerank)
- [ ] Feedback API (클릭/채택 데이터)
- [ ] smoke-test-summer.sh 통과

**완료 정의**: “index → retrieve” 왕복이 되고, trace 한 줄로 디버깅이 가능.

### Milestone 1 — Fall: Retrieval Flight Recorder (트레이싱)
- [ ] trace 스키마 확정(JSONB 유지 vs events table)
- [ ] 샘플링 전략(플랜별/에러율 기반)
- [ ] trace 리스트/상세 조회 API + 최소 UI(선택)

**완료 정의**: “왜 이 결과가 나왔지?”를 trace만 보고 답할 수 있음.

### Milestone 2 — Fall: Eval + Regression
- [ ] offline eval runner 정착(precision/recall/mrr)
- [ ] faithfulness judge(LLM-as-judge) 연결
- [ ] regression 감지 + 알림(Slack/Telegram)

**완료 정의**: 배포 전/후 점수 비교가 자동.

### Milestone 3 — Autopilot v1 + A/B 실험
- [ ] Query Planner(규칙 기반) 고도화
- [ ] A/B + bandit 안전화(가드레일)
- [ ] 플랜/예산/지연시간 기반 분기

**완료 정의**: 비용·지연시간을 자동으로 “안전하게” 최적화.

### Milestone 4 — Winter: Memory OS + 삭제/감사
- [ ] scope(user/project/session/agent)
- [ ] TTL enforcement + recency bias
- [ ] right-to-be-forgotten(완전 삭제 + 감사 로그)

**완료 정의**: 정책 기반 저장/삭제가 제품 수준으로 동작.

### Milestone 5 — Federated Retrieval (BYO-Store)
- [ ] source/binding CRUD API
- [ ] 커넥터 1~2개(Pinecone/Weaviate 등) 먼저
- [ ] 권한/감사/삭제 전파 모델

**완료 정의**: 외부 스토어를 Seizn처럼 조회 가능.

### Milestone 6 — Answer Contract 레이어
- [ ] chunk-id citation 강제
- [ ] groundedness 실패 시 재검색/재생성
- [ ] claim-level mapping(고급)

**완료 정의**: “근거 없는 답변”을 런타임에서 차단.

### Milestone 7 — Domain-adaptive Reranker(난이도 높음)
- [ ] 약지도 데이터셋 빌더
- [ ] reranker 학습 + 모델 버저닝
- [ ] 롤백/실험 플래그

---

## 5) 작업 카드(Work Cards) — AI에게 그대로 던질 수 있는 단위

### Card A — Federated Source CRUD API 추가
- 목표: `summer_federated_sources`, `summer_federated_bindings`를 관리하는 관리자 API
- 파일:
  - `src/app/api/summer/federated/sources/route.ts` (GET/POST)
  - `src/app/api/summer/federated/sources/[id]/route.ts` (GET/PATCH/DELETE)
  - `src/app/api/summer/federated/bindings/route.ts` ...
- 검증:
  - curl로 생성/조회/삭제 가능
  - 삭제 시 관련 binding 정리(ON DELETE CASCADE or app logic)

### Card B — Trace 상세 조회 API + UI(선택)
- 목표: request_id로 trace를 조회하고, rerank delta까지 표시
- 파일:
  - `src/app/api/fall/traces/[id]/route.ts`
  - `src/app/(dashboard)/dashboard/observability/*` (선택)
- 검증:
  - 특정 request_id 입력 → events가 시간순으로 렌더링

### Card C — Eval dataset 생성/관리 API
- 목표: SQL 없이 dataset/case를 만들 수 있게
- 파일:
  - `src/app/api/fall/eval/datasets/*`
  - `src/app/api/fall/eval/cases/*`
- 검증:
  - UI 없이도 curl로 dataset → cases → run 가능

### Card D — Autopilot 가드레일(비용/지연시간)
- 목표: 플랜별 최대 rerankTopN, 최대 topK, 최소 threshold 설정 강제
- 파일:
  - `src/lib/summer/autopilot/planner.ts`
  - `src/lib/summer/autopilot/decide.ts`
- 검증:
  - Free 플랜에서 강제로 rerankTopN=100 요청해도 clamp됨

### Card E — Answer Contract “재시도 정책”
- 목표: contract 실패 시 (re-retrieve → re-generate) 1회 자동 재시도
- 파일:
  - `src/lib/summer/answer-contract/*`
  - (생성 API가 있다면) 해당 route에 연결
- 검증:
  - 의도적으로 근거 없는 답변 유도 → 재검색 로그가 남고 최종 답변에 citation 포함

---

## 6) AI 프롬프트 팩(복붙용)

### 6.1 Builder (Claude Code)
- “레포의 `CLAUDE.md` 규칙 준수. 아래 Work Card 하나만 처리. 변경 파일 10개 이하. API는 반드시 authenticateRequest + logRequest + rateLimitHeaders 유지. 마이그레이션이 필요하면 새 파일로 추가. smoke-test 또는 curl 재현 절차를 PR 본문에 포함.”

### 6.2 Tester (Codex)
- “이번 PR의 엔드포인트를 curl로 호출하는 smoke test를 scripts/에 추가. 실패하면 원인 로그/재현 절차를 Evidence First로 정리. secrets는 로그에 출력하지 말 것.”

### 6.3 Reviewer (ChatGPT Pro)
- “PR diff를 보고: (1) 인증/권한/RLS, (2) 과금/쿼터/오버리지, (3) PII/감사로그, (4) 성능(쿼리/인덱스/배치) 관점으로 체크리스트 리뷰 작성. 위험도 High/Med/Low로 라벨링.”

---

## 7) 마지막 확인 (릴리스 전)
- [ ] DB 마이그레이션 적용됨(Prod/Stage 모두)
- [ ] `.env.local`만 시크릿 포함, `.env.example` 갱신
- [ ] smoke-test-summer 통과
- [ ] 최소 1개 eval run 기록
- [ ] trace sampling이 과도하지 않음(비용 폭주 방지)
