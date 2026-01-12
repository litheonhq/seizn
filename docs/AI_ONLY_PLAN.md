# Seizn Summer - AI-only 개발 운영 계획

이 문서는 **개발자가 0명(=AI만 작업)** 이어도 프로젝트가 지속될 수 있도록, 작업을 쪼개는 방법/검증 기준/파일 구조를 정리한다.

> 전제: 전역 규칙은 루트 `CLAUDE.md` 를 그대로 따른다(3회 실패 규칙, evidence first, secrets 금지 등).

---

## 1) 운영 원칙 (AI-only 생존 조건)

1. **세로 슬라이스 우선**: 항상 "API → DB → 로그/과금 → SDK" 한 줄이 통과하도록 만든다.
2. **작업 단위는 PR 1개=기능 1개**: 파일 변경 범위를 10개 이하로 제한한다.
3. **Spec-first**: 구현 전에 `docs/specs/...md` 에 요청/응답 예시와 acceptance criteria를 먼저 쓴다.
4. **테스트 없이 머지 금지**: 최소 `scripts/smoke-test.sh` 가 통과해야 한다.
5. **관찰 가능한 시스템**: 모든 요청에 `request_id`를 붙이고 retrieval trace를 남긴다.

---

## 2) GitHub 작업 방식 (AI들 간 충돌 최소화)

### 2.1 이슈 템플릿 (필수 필드)
- 목표(Why)
- 범위(In/Out)
- API 스펙(요청/응답 예시)
- DB 변경(마이그레이션)
- 로그/과금(어떤 usage metric을 추가하는지)
- 테스트/검증 절차

### 2.2 브랜치 네이밍
- `feat/summer-<issueNumber>-<slug>`
- `fix/summer-...`

### 2.3 PR 템플릿
- 변경 요약
- API 호출 예시(curl)
- DB 마이그레이션 파일
- 스크린샷/로그(가능 시)
- 롤백 방법

---

## 3) Summer 단계별 백로그 (순서 고정)

### Milestone A: Summer MVP (managed pgvector)
**A1. DB 스키마 추가**
- `supabase/migrations/021_summer_schema.sql`
- collections/documents/chunks + search RPC 3개

**A2. Collections API**
- `POST /api/summer/collections`
- `GET /api/summer/collections`

**A3. Index API (문서→청크→임베딩→저장)**
- `POST /api/summer/index`
- 최소 동작: 문서 1개 입력 시 청크 N개가 저장되고 embedding vector가 채워진다.

**A4. Retrieve API (query→검색→선택적 rerank)**
- `POST /api/summer/retrieve`
- 응답에 `config`와 `results[]`가 포함된다.

Acceptance criteria (MVP):
- `index` → `retrieve` 의 왕복이 성공
- free/plus/pro/enterprise 기본 설정이 다르게 적용됨

### Milestone B: Retrieval Autopilot v1
**B1. Autopilot 결정 엔진**
- 룰 기반(짧은 쿼리=hybrid, 긴 쿼리=vector 등)
- `trace.autopilot.reason`에 이유를 항상 기록

**B2. 비용 최적화**
- free는 rerank 기본 OFF
- plus 이상은 rerank ON (provider 설정 시)

### Milestone C: Domain-adaptive Reranker (가벼운 방식)
**C1. Feedback 수집 API**
- `POST /api/summer/feedback`
  - query, shown_chunk_ids, clicked_chunk_id, optional label

**C2. Score Calibrator**
- heavy finetune 대신, `vector_score/bm25_score/recency/...`를 합성하는 가중치(로지스틱 회귀/선형)부터 시작

### Milestone D: Federated Retrieval
**D1. Agent 프로토콜 정의**
- HTTP JSON 표준 (search / health)
- Seizn이 agent들을 병렬 호출 → merge → optional rerank

**D2. Agent reference 구현(오픈소스)**
- 고객 DB/VectorDB에 붙는 "seizn-agent"

---

## 4) 최소 Smoke Test (권장)

`scripts/smoke-test.sh` 예시:
1) collection 생성
2) index 문서 1개
3) retrieve 질의 1개

---

## 5) AI에게 주는 "한 줄 프롬프트" 템플릿

### (1) 구현 AI용 (Claude Code)
- "아래 스펙대로 Next.js Route Handler 구현. 변경 파일은 최대 8개. 실패 시 원인 로그/재현 절차를 먼저 정리. secrets는 건드리지 말 것."

### (2) 리뷰 AI용 (ChatGPT Pro)
- "PR diff를 보고 보안(인증/권한), 비용(쿼터/캐시), 성능(배치/쿼리) 관점으로 체크리스트 리뷰 작성."

### (3) 테스트 AI용 (Codex)
- "curl 기반 smoke-test 스크립트 작성. 실패 시 로그를 사람 없이 이해 가능하게 정리." 
