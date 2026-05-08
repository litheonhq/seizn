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

## 가격 정책 (Author Memory v3 — Locked 2026-05-07, v9 catalog)

### Free 티어 (W2 — 2026-05-08 완화)
- BYOK 강제 (Anthropic 또는 OpenAI 키 등록 필수)
- 50 calls/day, 사용자 모델 자유 선택 (default Opus 4.7)
- 기능 제한: Check 15/월, Dialog 15/월, 첫 20 챕터 / 100K words 분석 한도
- 차단: Backlog generation, Knowledge partitioning, Timeline/Relationship 추출
- 우리 비용: $0 (인프라 $0.04/인/월만) — Free는 BYOK라 LLM 비용 0
- W2 근거: 우리 비용 변화 없음 + advanced features 9개가 conversion driver 충분 + signup 마찰 감소

### Track 1 (웹) 가격표 — 2-column (Managed/BYOK) × 2-cadence (Monthly/Annual)
| Tier | Managed 정착 / Charter Monthly / Charter Annual | BYOK 정착 / Charter Monthly / Charter Annual |
|---|---|---|
| Indie | $39 / $29 / $324yr ($27/mo) | $19 / $11 / $114yr ($9.50/mo) |
| Pro | $149 / $112 / $1,250yr ($104/mo) | $79 / $47 / $474yr ($39.50/mo) |
| Studio | $499 / $374 / $4,190yr ($349/mo) | $249 / $149 / $1,494yr ($124.50/mo) |
| Enterprise | $2,500 / $1,875 (BYOK 강제) | — |

### Track 2 (API/MCP)
| Tier | 정착 / Charter Monthly / Charter Annual |
|---|---|
| Free | $0 (50/일 BYOK 강제) |
| Indie (BYOK) | $19 / $11 / $108yr ($9/mo) |
| Pro (BYOK) | $39 / $23 / $228yr ($19/mo) |
| Studio (BYOK) | $199 / $119 / $1,188yr ($99/mo) |
| Studio Managed | $999 / $599 / $5,988yr ($499/mo) — medium effort, $0.50/콜 overage |
| Enterprise | Contact |

### Charter 정책 (단순 시간창)
- **2027-05-01까지** Charter 가격 적용 (lifetime lock 폐기)
- 2027-05-01 이후 결제건은 정상가
- Annual 가입자: 결제 시점이 2027-05-01 이전이면 그 1년치 Charter 가격 보장
- Monthly 가입자: 매월 결제 시점이 기준
- Charter 할인폭: Managed Monthly -25% / Annual -30%, BYOK Monthly -40% / Annual -50%
- Stripe Schedule 객체로 swap 자동화

### Trial 정책
- **별도 Trial 없음** (Free와 통합)
- Free에서 15/15 Check/Dialog 한계 (W2) 또는 advanced features 차단으로 결제 trigger
- Smart sample 추천 + cost preview UI로 마찰 완화

### Charter Managed 혜택
**모든 Managed 공통**: Priority Queue / 48h Priority Support / Beta Features Access / Multi-provider Auto-failover / Founding Member 배지
**Pro+ 가산**: Premium quality (xhigh) included / Monthly Continuity Report / 2 Collaborator Seats
**Studio+ 가산**: 5 Seats / Quarterly Strategy Call / Custom Prompt Overrides / White-label Export
**Enterprise**: 무제한 seats / Custom SLA / Dedicated success manager

### Effort 정책
- BYOK 모든 티어: 사용자 자유 선택 (default Opus 4.7 medium)
- Indie Managed: medium 강제 (마진 보호)
- Pro/Studio/Enterprise Managed: xhigh 포함

### LLM 단가 (lock 2026-05-08, `src/lib/author/llm/pricing-rates.ts` 단일 소스)
- Claude Opus 4.7: $5/$25 per MTok (input/output), 5min cache write $6.25, cache read $0.50
- Claude Sonnet 4.6: $3/$15 per MTok
- GPT-5.5: $5/$30 per MTok, cached input $1.25
- Gemini 2.5 Pro: $1.25/$10 per MTok ≤200K input, $2.50/$15 per MTok >200K (R25)
- Gemini 2.5 Flash: $0.30/$2.50 per MTok
- 가격 변경 시 `pricing-rates.ts` 단일 파일만 수정

## 마케팅 / 광고 정책 (Lock 2026-05-07)
- **광고비 cap: 월 $500**, dynamic ($200-500 channel 효율 기반)
- Month 1-3 점진 ($300/$400/$500), 3개월 KPI 검증
- 채널: Reddit Ads + Newsletter sponsorship + Google Ads + Micro-influencer
- KPI 임계치: CAC < $20/signup, trial 전환 > 20%, 월 churn < 7%
- 미달 시 광고 중단 + 채널 재검토

## 핵심 측정 지표 (Admin Dashboard `/admin/metrics`)
- CAC per signup (channel별) — alert >$25
- 전환율 30/90일 (signup → paid) — target 12% blended, 18% optimistic
- MRR (월간 snapshot) — growth target +10%/mo
- Monthly churn — target <5%, alert >10%
- Free 사용자 인프라 비용 — $0.04/인/월 baseline

## 12개월 재무 예상 (lock)
- 광고 $500/월, 12% blended conversion, $13 평균 MRR, 5% churn
- 12개월차: 53 active paid, ARR $8K, 누적 손익 **-$530**
- 23개월차: break-even
- 36개월차: ARR $15K, 누적 +$7K
- Steady state: 120 paid, ARR $19K

## 성장 가속 plan (organic > paid)
**원칙**: 광고만 늘리는 건 단기 자살. Organic + conversion 개선이 진짜 lever.
- M1-3 (학습): 광고 채널 검증
- M4-6 (검증): SEO 콘텐츠 시작 (월 2-4편 블로그)
- M7-12 (확장): 작가 커뮤니티 침투, Founding Member 추천 프로그램, case study
- M12-24: AI 작가 도구 비교 사이트 등재, 작가 인플루언서 연계

**Best case (organic 2x + conversion 18% 달성)**: M12 +$3-5K 흑자, M24 ARR $35K, M36 누적 +$30K

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

### Author LLM Managed keys (Charter Managed perk)
3-provider failover 활성화하려면 모든 키 등록 필요. 1-2개만 있으면 부분 failover.

| 변수 | 우선순위 chain | 비고 |
|---|---|---|
| `AUTHOR_ANTHROPIC_DEV_API_KEY` → `AUTHOR_LLM_ANTHROPIC_API_KEY` → `LITHEON_ANTHROPIC_API_KEY` → `ANTHROPIC_API_KEY` | Anthropic Claude | catch-all 허용 |
| `AUTHOR_OPENAI_DEV_API_KEY` → `AUTHOR_LLM_OPENAI_API_KEY` → `LITHEON_OPENAI_API_KEY` → `OPENAI_API_KEY` | OpenAI GPT | catch-all 허용 |
| `AUTHOR_GOOGLE_DEV_API_KEY` → `AUTHOR_LLM_GOOGLE_API_KEY` → `LITHEON_GOOGLE_API_KEY` | Google Gemini | **catch-all 없음** — Author 전용 namespace만 |

R24에서 Google chain은 `GOOGLE_API_KEY` / `GEMINI_API_KEY` catch-all을 의도적으로 제외 (Maps / 다른 Google 서비스와 budget 혼선 방지).
미설정 provider로 failover 시도 시 `LLM_NOT_CONFIGURED` → 다음 provider로 walk (R25 M1).

### Author LLM provider preference (사용자별)
- 기본 default: `AUTHOR_LLM_PROVIDER` env (`anthropic` | `google` | `openai`)
- 사용자 override: `profiles.author_llm_provider` column (migration 20260507001 필요 — prod 미적용 상태)
- Override 적용 시 BYOK 키 등록 필수 (해당 provider만)

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
   SEIZN_API_KEY=szn_... SEIZN_MCP_HTTP_TOKEN=<random-token> npx seizn-mcp --http  # 127.0.0.1:3100
   curl http://127.0.0.1:3100/health
   curl -H "Authorization: Bearer <random-token>" http://127.0.0.1:3100/mcp
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

## CI/CD 워크플로우 (GitHub Actions)

`claude-audit.yml`은 repo-local, Litheon-only 워크플로우이며 결정적 npm 감사 게이트를 실행한다. `provider` 입력은 기존 CLI 호환용으로만 남아 있고 외부 AI 워크플로우를 호출하지 않는다.
다른 `claude-*`, `auto-fix`, `issue-to-code` 워크플로우 파일은 같은 repo-local audit을 호출하는 호환 래퍼다. 자체적으로 코드 변경, 댓글, 이슈, 커밋을 만들지 않는다.

### 결정적 감사 래퍼

예전 CLI entrypoint는 보존하되 실행은 `litheonhq/seizn` 내부에 고정한다.

```bash
# 기본 결정적 게이트
gh workflow run claude-improve.yml

# security 프리셋은 strategic checks 실행
gh workflow run claude-improve.yml -f task_type="security" -f provider="codex"

# 커스텀 작업/범위는 operator context로만 기록
gh workflow run claude-improve.yml -f task_type="custom" -f task="Refactor webhook delivery retry logic" -f scope="src/app/api/webhooks"

# provider/model/web-search 입력은 호환용
gh workflow run claude-improve.yml -f task_type="security" -f model="opus" -f use_web_search="true"
```

### 기타 워크플로우

```bash
# PR review readiness gate
gh workflow run claude-review.yml -f pr_number="5"

# auto-fix 호환 게이트; 코드 변경 없음
gh workflow run auto-fix.yml -f pr_number="5"

# issue implementation readiness gate; 코드 변경 없음
gh workflow run issue-to-code.yml -f issue_number="3"

# 기술 스택 문서 생성
gh workflow run claude-audit.yml -f depth="strategic"

# continuous 호환 게이트; 결정적 1회 pass
gh workflow run claude-continuous.yml
gh workflow run claude-continuous.yml -f tasks="mcp-protocol,security" -f max_cycles=3

# 실행 중인 호환 게이트 중지
gh run cancel $(gh run list -w claude-continuous.yml -L 1 --json databaseId -q '.[0].databaseId')
```

### 머지 정책
호환 래퍼는 자동 머지하지 않는다. green gate 이후 일반 Litheon review/commit 경로로만 반영한다.

## 참고 문서

- 기획/조사: `C:\Users\admin\Dendron\notes\사업\기타-프로젝트\AI-Memory-Server-Research.md`
- 전역 규칙: `C:\Users\admin\Dendron\notes\CLAUDE.md`
