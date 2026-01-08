# Seizn - AI Memory Infrastructure

> mem0 스타일의 AI 메모리 SaaS 서비스

## 프로젝트 정보

- **도메인:** seizn.com (Cloudflare)
- **GitHub:** https://github.com/iruhana/seizn
- **호스팅:** Vercel
- **데이터베이스:** Supabase (mefsiztbcwknpoqglwmw.supabase.co)

---

## 완료된 작업

### 1. 인프라 설정
- [x] Next.js 15 + TypeScript + Tailwind 프로젝트 생성
- [x] Vercel 배포 연동
- [x] Supabase 프로젝트 생성 및 연결
- [x] 환경변수 설정 (.env.local)

### 2. 랜딩 페이지
- [x] Coming Soon 페이지 (핀테크 스타일)
- [x] 이메일 대기자 명단 (Waitlist) 기능
- [x] 요금제 섹션 (Free/Plus/Pro/Enterprise)

### 3. 데이터베이스 스키마
- [x] `profiles` - 사용자 프로필 (플랜, 사용량)
- [x] `api_keys` - API 키 관리 (해시 저장)
- [x] `memories` - 메모리 저장 (pgvector 임베딩)
- [x] `usage_logs` - API 사용량 로그
- [x] `waitlist` - 대기자 명단
- [x] RLS (Row Level Security) 정책
- [x] `search_memories` RPC 함수
- [x] `002_add_namespace.sql` 마이그레이션

### 4. 인증 시스템
- [x] NextAuth v5 (beta) 설정
- [x] JWT 전략 구성
- [x] OAuth 프로바이더 준비 (GitHub, Google)
- [x] Credentials 프로바이더 (이메일/비밀번호)
- [x] 로그인 페이지 UI
- [x] SessionProvider 래퍼

### 5. 핵심 API 엔드포인트

| 엔드포인트 | 메서드 | 설명 | 상태 |
|-----------|--------|------|------|
| `/api/memories` | POST | 메모리 추가 (임베딩 자동 생성) | ✅ |
| `/api/memories` | GET | 시맨틱 검색 (벡터 유사도) | ✅ |
| `/api/memories/[id]` | GET | 특정 메모리 조회 | ✅ |
| `/api/memories/[id]` | PATCH | 메모리 수정 | ✅ |
| `/api/memories/[id]` | DELETE | 메모리 삭제 (soft delete) | ✅ |
| `/api/extract` | POST | 대화에서 메모리 자동 추출 | ✅ |
| `/api/query` | POST | RAG 스타일 컨텍스트 응답 | ✅ |
| `/api/keys` | GET/POST/DELETE | API 키 관리 | ✅ |
| `/api/waitlist` | POST | 대기자 등록 | ✅ |

### 6. AI 서비스 통합
- [x] Voyage AI 임베딩 (voyage-3, 1024 dimensions)
- [x] Claude AI 메모리 추출 (Haiku/Sonnet)
- [x] RAG 응답 생성 (`generateWithMemories`)
- [x] 추출 프롬프트 최적화

### 7. 보안
- [x] API 키 SHA256 해시 저장
- [x] API 키 검증 (key_hash 비교)
- [x] RLS 정책으로 데이터 격리

### 8. 대시보드
- [x] 대시보드 페이지 레이아웃
- [x] API 키 생성/관리 UI
- [x] 사용량 통계 표시 (UI만)
- [x] Quick Start 가이드

---

## 남은 작업

### 우선순위 높음 (필수)

#### 1. Supabase 마이그레이션 적용
```bash
# Supabase Dashboard > SQL Editor에서 실행
# 001_initial_schema.sql
# 002_add_namespace.sql
```

#### 2. OAuth 자격증명 설정
```env
# .env.local에 추가 필요
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
```

#### 3. 대시보드 실제 데이터 연동
- [ ] API 키 목록 실제 fetch
- [ ] 메모리 수/API 호출 수 실제 표시
- [ ] API 키 삭제 기능

#### 4. Vercel 환경변수 설정
- [ ] 모든 환경변수 Vercel에 추가
- [ ] 프로덕션 배포 확인

### 우선순위 중간

#### 5. 결제 시스템 (Lemon Squeezy)
- [ ] Lemon Squeezy 상품 생성 (Plus/Pro/Enterprise)
- [ ] 웹훅 엔드포인트 (`/api/webhooks/lemonsqueezy`)
- [ ] 구독 상태 동기화
- [ ] 플랜별 사용량 제한 적용

#### 6. 사용량 제한 & 미터링
- [ ] API 호출 카운트 (usage_logs)
- [ ] 메모리 수 제한 체크
- [ ] 월간 리셋 크론잡 (Supabase Edge Function)
- [ ] 사용량 초과 시 429 응답

#### 7. SDK/클라이언트 라이브러리
- [ ] Python SDK (`pip install seizn`)
- [ ] JavaScript/TypeScript SDK (`npm install seizn`)
- [ ] SDK 문서화

### 우선순위 낮음

#### 8. 추가 기능
- [ ] 메모리 일괄 가져오기/내보내기
- [ ] 웹훅 알림 (메모리 추가 시)
- [ ] 팀/조직 지원
- [ ] 메모리 버전 히스토리

#### 9. 문서화
- [ ] API 문서 페이지 (`/docs`)
- [ ] OpenAPI/Swagger 스펙
- [ ] 사용 예제 및 튜토리얼

#### 10. 모니터링 & 분석
- [ ] Sentry 에러 트래킹
- [ ] 사용량 분석 대시보드
- [ ] 성능 모니터링

---

## 기술 스택

| 분류 | 기술 |
|------|------|
| Frontend | Next.js 16, React, Tailwind CSS |
| Backend | Next.js API Routes, TypeScript |
| Database | Supabase (PostgreSQL + pgvector) |
| Auth | NextAuth v5 (JWT) |
| AI | Claude (Anthropic), Voyage AI |
| Payments | Lemon Squeezy |
| Hosting | Vercel |
| Domain | Cloudflare |

---

## API 사용 예시

### 메모리 추가
```bash
curl -X POST https://seizn.com/api/memories \
  -H "x-api-key: szn_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{"content": "User prefers dark mode"}'
```

### 메모리 검색
```bash
curl "https://seizn.com/api/memories?query=user%20preferences" \
  -H "x-api-key: szn_xxxxx"
```

### 대화에서 메모리 추출
```bash
curl -X POST https://seizn.com/api/extract \
  -H "x-api-key: szn_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "conversation": "User: I work at Google as a software engineer...",
    "model": "haiku",
    "auto_store": true
  }'
```

### RAG 쿼리
```bash
curl -X POST https://seizn.com/api/query \
  -H "x-api-key: szn_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What do you know about my job?",
    "model": "haiku"
  }'
```

---

## 참고 링크

- [mem0 (참고 서비스)](https://mem0.ai)
- [Supabase pgvector](https://supabase.com/docs/guides/ai/vector-columns)
- [Voyage AI Embeddings](https://docs.voyageai.com/)
- [Lemon Squeezy Docs](https://docs.lemonsqueezy.com/)
