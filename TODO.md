# Seizn TODO

> 최종 업데이트: 2026-02-02
> 참조: Seizn_Additional_Work_Playbook.md

---

## P0 (즉시~4주): 규제/조달에 직접 걸리는 것

### 규제/투명성
- [ ] **EU AI Act Article 50 Transparency 기능화**
  - Transparency Event 모델 추가 (ai_interaction_disclosure, synthetic_content_marking)
  - Guard/SDK에서 표시 의무 플래그 전달
  - Evidence Pack v2에 Article 50 섹션 추가
  - 마감: 2026-08-02 (EU AI Act Article 50 적용 시작)

### AI 보안
- [ ] **OWASP LLM Top 10 보안 테스트 스위트 + CI 게이트**
  - `security/llm-top10` 레드팀 테스트 스위트
  - Prompt Injection, Excessive Agency, Insecure Output, Unbounded Consumption
  - Guard tool-gating 테스트 통과
  - CI 필수 게이트로 설정

### 관측/호환성
- [ ] **OpenTelemetry GenAI semconv 완전 준수**
  - Trace 모델 ↔ OTEL GenAI semconv 속성/이벤트/스팬 1:1 매핑
  - prompt/output: hash-only 또는 off 기본, full capture는 opt-in
  - OTLP exporter 설정 템플릿

### 조달 준비
- [ ] **SOC 2 Procurement Pack v1** (고객 보안팀 제출용)
  - Security whitepaper (아키텍처/데이터 흐름/위협 모델)
  - Subprocessors list + DPA 템플릿
  - Incident response 정책 + 온콜 런북
  - 접근통제 정책 (RBAC/least privilege)
  - 로그/레드액션/보존 정책

### 기존 미구현 (DB 스키마만 존재)
- [ ] **Tool Gating API/Service 구현** (2주)
  - DB: `agent_tools`, `agent_tool_tokens`, `agent_tool_approvals`, `agent_tool_executions`
  - 필요: API routes, Service layer, Middleware
  - 참조: `supabase/migrations/20260202_013_tool_gating.sql`

- [ ] **Policy Pack Registry API/Service 구현** (2주)
  - DB: `policy_packs`, `policy_pack_versions`, `policy_pack_installations`, `policy_pack_reviews`
  - 필요: Marketplace API, 서명 검증, Install/Uninstall 로직
  - 참조: `supabase/migrations/20260202_014_policy_pack_registry.sql`

---

## P1 (1~3개월): Governance v2 - 증명 가능한 거버넌스

- [ ] **Policy-as-code v2** (서명/버전/감사)
  - 정책 번들 서명 (변조 방지)
  - namespace/env 단위 policy version pinning
  - `POST /policies/simulate` - 결정 과정 트레이스

- [ ] **RTBF 삭제 검증 가능성** (Deletion Verification)
  - 삭제 job report 표준화
  - `GET /rtbf/:jobId/verify` endpoint
  - 백엔드 완료: `src/lib/winter/rtbf/verification.ts`

- [ ] **RTBF Dashboard UI 활성화** (1주)
  - Settings 페이지 "Coming Soon" 버튼 활성화
  - 삭제 인증서 뷰어

- [ ] **Controls Matrix** (NIST/ISO 매핑 문서)
  - NIST AI 600-1 (GenAI Profile) → Seizn 기능 매핑
  - ISO/IEC 42001 → Seizn 운영 체계 매핑

- [ ] **Secure SDLC (SSDF) for GenAI 적용**
  - Secret scanning, dependency policy, code review, release signing
  - 정책/모델 변경 시 eval 자동 실행

---

## P2 (3~12개월): 스케일과 딜클로징

### 공급망 보안
- [ ] **SLSA L2 + SPDX SBOM** for Guard
  - Provenance attestation
  - 보호된 브랜치/서명된 태그
  - Guard 패키지별 SBOM 생성

### 인프라/배포
- [ ] **데이터 레지던시/배포 SKU**
  - US/EU 리전 선택 설계
  - 단일테넌트 hosted SKU (초기 엔터프라이즈)
  - VPC/on-prem (장기)

- [ ] **SSO/SAML/SCIM + RBAC hardening**
  - Org RBAC 세분화 (owner/admin/member + custom)
  - Key scopes가 RBAC와 일치

### SDK/통합
- [ ] **Framework Adapters** (4주)
  - LangChain Memory/Retriever
  - LlamaIndex Adapter
  - Vercel AI SDK Template

- [ ] **Summer RAG MVP** (4-6주)
  - Collections API
  - Index API (임베딩)
  - Retrieve API

### 케이스 스터디
- [ ] **TheLabForge dogfooding → 케이스 스터디 3종**
  - PII 차단/레드액션
  - RTBF 삭제 증빙
  - Trace replay로 회귀 버그 잡은 사례

---

## 완료된 작업

- [x] Migration 012: Deletion Verification (RTBF 증명)
- [x] Migration 013: Tool Gating (DB 스키마)
- [x] Migration 014: Policy Pack Registry (DB 스키마)
- [x] Migration 015: Security Lint Fixes (RLS + View)
- [x] Helm Charts (85-90% 완성)
- [x] OPA/Rego 정책 엔진
- [x] Policy Versioning (publish/rollback/compare)
- [x] Data Retention Schedules
- [x] Legal Holds
- [x] BYOK (AWS/Azure/GCP KMS)
- [x] SSO/SAML 2.0
- [x] SCIM 2.0 Provisioning

---

## 참고 자료

- [EU AI Act Timeline](https://ai-act-service-desk.ec.europa.eu/en/ai-act/timeline/timeline-implementation-eu-ai-act)
- [OWASP Top 10 for LLM](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- [OTEL GenAI semconv](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [NIST AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)
- [SLSA v1.2](https://slsa.dev/spec/v1.2/)

---

## 참고사항

- `organization_members.user_id`는 TEXT 타입 → RLS에서 `auth.uid()::text` 캐스팅 필요
- `projects`, `spring_conversations` 테이블은 존재하지 않음 → FK 참조 제거함
