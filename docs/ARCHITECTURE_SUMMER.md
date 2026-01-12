# Seizn Summer - 아키텍처 (초안)

## 1) 핵심 컨셉
Summer는 "Vector DB" 자체가 아니라, **Retrieval을 자동으로 잘 해주는 Control Plane + Retrieval Gateway**에 가깝다.

- Storage(저장): pgvector(Managed) 또는 외부 Vector DB
- Retrieval(검색): Hybrid/Vector/Keyword + Rerank
- Autopilot(자동 최적화): 쿼리/비용/SLA에 따라 파이프라인을 자동 선택
- Federated Retrieval(연합): 여러 소스를 동시에 검색해 합친다

## 2) Control Plane vs Data Plane
- Control Plane (Vercel/Next.js)
  - API Key 인증/쿼터/과금
  - 컬렉션 관리
  - 정책/설정(autopilot on/off)
  - Observability UI(나중)

- Data Plane (처음에는 Control Plane과 합쳐도 됨)
  - Embedding/Rerank 실행
  - Vector search 실행
  - Agent fan-out(연합 검색)

## 3) 모듈 경계
`src/lib/summer/...` 는 아래 4개 인터페이스를 축으로 구성한다.

1. `EmbeddingProvider`
2. `VectorStore`
3. `RerankProvider`
4. `retrieve()` 파이프라인

외부 벤더를 바꿔도 파이프라인이 유지되도록 한다.

## 4) 점진적 확장 로드맵
- v0: managed pgvector + optional external rerank
- v1: retrieval trace + autopilot 룰
- v2: feedback 기반 calibrator
- v3: agent 기반 federated retrieval
