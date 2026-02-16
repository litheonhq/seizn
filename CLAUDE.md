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

## 마이그레이션 워크플로우

```bash
# 마이그레이션 적용 (verify:e2e-encryption-db 자동 실행)
node run-migration-file.mjs <sql파일>

# 검증만 단독 실행 (대시보드에서 직접 SQL 적용한 경우)
npm run verify:e2e-encryption-db

# 검증 우회 (예외적 상황만)
SKIP_E2E_VERIFY=1 node run-migration-file.mjs <sql파일>
```

- `run-migration-file.mjs` 실행 시 `verify:e2e-encryption-db`가 자동 실행됨
- 오버로드/RPC 누락 회귀 감지 시 exit code 1 → 마이그레이션도 실패
- Supabase 대시보드에서 직접 SQL 적용한 경우: `npm run verify:e2e-encryption-db` 수동 1회 필수
- DB 변경 이후마다 검증 1회 습관화 권장

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

## 기술 스택 문서

- **위치**: `.github/TECH_STACK.md`
- **기술 구현/변경 작업 후 반드시 업데이트** (전역 CLAUDE.md §10 준수)
- 새 라이브러리 추가, API 라우트 생성, 아키텍처 변경 시 해당 섹션 수정
- `claude-audit.yml` 워크플로우로 전체 재생성 가능

## CI/CD 워크플로우 (GitHub Actions, Self-hosted Runner)

중앙 레포 `iruhana/claude-workflows@v1` 기반. 모든 워크플로우는 **수동 트리거(workflow_dispatch)** 전용.
프로바이더: `claude` (기본) 또는 `codex` (`-f provider="codex"` 추가).

### 코드 개선 (claude-improve.yml)
seizn 전용 프리셋 우선. 기본값: `mcp-protocol`.

| 프리셋 | 설명 | 모델 |
|--------|------|------|
| `mcp-protocol` | MCP SDK 스펙 준수, tool/resource 핸들러, JSON-RPC | **opus** |
| `memory-graph` | 메모리 CRUD, 지식 그래프 무결성, 검색 관련성 | **opus** |
| `ai-context` | session_init 프로젝트 감지, 8개 AI 도구 설정 동기화 | sonnet |
| `security` | XSS, CSRF, 인젝션, 시크릿 노출 감사 | **opus** |
| `code-quality` | DRY, 네이밍, 타입, 패턴 일관성 | sonnet |
| `performance` | N+1 쿼리, memo, 동적 임포트, 캐싱 | **opus** |
| `dead-code` / `tech-debt` / `deps-update` / `accessibility` / `seo` | 범용 | 자동 |

```bash
# 기본 (MCP 프로토콜 감사)
gh workflow run claude-improve.yml

# 특정 프리셋 + Codex
gh workflow run claude-improve.yml -f task_type="memory-graph" -f provider="codex"

# 커스텀 작업 + 범위 제한
gh workflow run claude-improve.yml -f task_type="custom" -f task="Refactor webhook delivery retry logic" -f scope="src/app/api/webhooks"

# 모델 강제 + 웹 검색
gh workflow run claude-improve.yml -f task_type="security" -f model="opus" -f use_web_search="true"
```

### 기타 워크플로우

```bash
# PR 코드 리뷰
gh workflow run claude-review.yml -f pr_number="5"

# 빌드 에러 자동 수정 (3라운드 에스컬레이션)
gh workflow run auto-fix.yml -f pr_number="5"

# Issue → 구현 → PR
gh workflow run issue-to-code.yml -f issue_number="3"

# 기술 스택 문서 생성
gh workflow run claude-audit.yml -f depth="strategic"

# 연속 개선 (기본: mcp-protocol,memory-graph,ai-context,security,...)
gh workflow run claude-continuous.yml
gh workflow run claude-continuous.yml -f tasks="mcp-protocol,security" -f max_cycles=3

# 연속 실행 중지
gh run cancel $(gh run list -w claude-continuous.yml -L 1 --json databaseId -q '.[0].databaseId')
```

### 자동 머지
저위험 프리셋(`dead-code`, `seo`, `accessibility`, `code-quality`, `ai-context`, `deps-update`)은 빌드 통과 시 자동 squash merge.

## 참고 문서

- 기획/조사: `C:\Users\admin\Dendron\notes\사업\기타-프로젝트\AI-Memory-Server-Research.md`
- 전역 규칙: `C:\Users\admin\Dendron\notes\CLAUDE.md`
