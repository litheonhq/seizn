# Seizn - AI Memory Server

## 프로젝트 개요
- **브랜드명**: Seizn (시즌)
- **슬로건**: "Seize your memories"
- **도메인**: seizn.com
- **설명**: mem0 스타일 AI 메모리 SaaS 서비스

## 기술 스택
- **Frontend**: Next.js 15, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (서버리스)
- **Database**: Neon (PostgreSQL + pgvector)
- **Cache**: Upstash Redis
- **Auth**: NextAuth.js
- **LLM**: Claude Haiku/Sonnet (메모리 추출)
- **Embedding**: Voyage AI

## 타겟 시장
- 한국, 영어권, 일본 (3개국)

## 가격 정책
| 플랜 | 가격 | AI 엔진 | 메모리 | API 호출 | 망각 곡선 |
|-----|------|---------|--------|---------|----------|
| Free | $0 | Haiku | 10,000 | 1,000/월 | 60일 |
| Plus | $9 | Sonnet | 50,000 | 10,000/월 | 120일 |
| Pro | $29 | Sonnet | 200,000 | 50,000/월 | ON/OFF 가능 |
| Enterprise | 문의 | Sonnet+Opus | 무제한 | 무제한 | ON/OFF 가능 |

## 폴더 구조
```
src/
├── app/              # Next.js App Router
│   ├── api/          # API Routes
│   ├── (auth)/       # 인증 관련 페이지
│   ├── (dashboard)/  # 대시보드
│   └── (marketing)/  # 랜딩/마케팅 페이지
├── components/       # React 컴포넌트
│   ├── ui/           # 기본 UI 컴포넌트
│   └── features/     # 기능별 컴포넌트
├── lib/              # 유틸리티 함수
├── hooks/            # Custom React Hooks
├── types/            # TypeScript 타입
└── styles/           # 글로벌 스타일
```

## 환경 변수
- `.env.local` 파일 참조
- 절대 커밋하지 말 것

## 개발 명령어
```bash
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run start    # 프로덕션 서버
npm run lint     # ESLint 검사
```

## MCP 폴백 가이드

Seizn MCP 서버가 로드되지 않았을 때의 대체 방법:

1. **REST API 직접 호출** (최우선):
   ```bash
   # 메모리 저장
   curl -X POST https://www.seizn.com/api/v1/memories \
     -H "Authorization: Bearer $SEIZN_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"content":"...", "tags":["tag1"]}'

   # 메모리 검색
   curl "https://www.seizn.com/api/v1/memories?query=...&mode=hybrid" \
     -H "Authorization: Bearer $SEIZN_API_KEY"
   ```

2. **CLI 원라이너**:
   ```bash
   SEIZN_API_KEY=szn_... npx seizn save "메모리 내용" --tags tag1,tag2
   ```

3. **HTTP Transport** (로컬):
   ```bash
   SEIZN_API_KEY=szn_... npx seizn-mcp --http  # localhost:3100
   curl localhost:3100/health
   ```

## API v1 기능
- **중복 방지**: POST 시 자동 dedup (similarity > 0.95), `dedup: false`로 비활성화
- **자동 중요도**: `auto_score: true` 옵션으로 Haiku 기반 1-10 점수 자동 부여
- **멀티 에이전트**: `agent_id`, `scope` 쿼리 파라미터로 에이전트별 메모리 분리
- **Webhook**: `memory.created`, `memory.updated`, `memory.deleted` 이벤트 → n8n/Zapier 연동
- **메모리 버전 관리**: 내용 변경 시 자동으로 이전 버전 보존 (memory_content_history)
- **실시간 스트림**: SSE `/api/v1/memories/stream` 엔드포인트

## 참고 문서
- 기획/조사: `C:\Users\admin\Dendron\notes\사업\기타-프로젝트\AI-Memory-Server-Research.md`
