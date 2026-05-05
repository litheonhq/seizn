# Seizn Author Track 2 — Platform (API + MCP) 전략 문서

**Date:** 2026-05-05 (작성), 2026-05-06 (트랙 번호 정정 + monorepo 위치 박음)
**Author:** Claude Code (이 세션)
**Status:** Draft for stakeholder review

**3 트랙 매핑 (확정):**

| Track | 정체 | 작업 위치 | 작업 세션 |
|---|---|---|---|
| **Track 1** | Web Dashboard | `seizn/src/app/dashboard/author/*` | 이 세션 (이미 운영) |
| **Track 2** (이 문서) | API + MCP + SDK | `seizn/src/app/api/v1/*` + `seizn/packages/author-mcp-server/*` | 이 세션 |
| **Track 3** | Program (Tauri Vault → Editor) | `seizn-desktop/*` (별 폴더) | 다른 세션 |

**Master:** `seizn-author-master-2026-05-05.md`

**Companion docs (동시 진행, 충돌 회피):**

- `seizn-author-track-1-web-2026-05-05.md` — Track 1 (Web), 다른 세션
- `seizn-author-track-3-program-2026-05-05.md` — Track 3 (Tauri 데스크톱), 다른 세션
- `_archive/seizn-author-studio-design-doc.md` — 원안 (대체됨)
- `_archive/seizn-author-studio-business-review-improved.md` — 사업성 검토 input (대체됨)

**Verdict:** 진행 권장. Track 3 (Program) 와 **별도** 의 distribution 채널 = **Track 2 = AI-native Platform (API + MCP + SDK + IDE extension)**.

같은 Memory v3 backend, 같은 Author identity, 같은 canon DB. **다른 채널, 다른 페르소나, 다른 가격**. 세 트랙 동시 진행 (4 LLM 계정 자원 충분).

**monorepo 인프라 (2026-05-06 확인):**
- pnpm workspace (`pnpm-workspace.yaml`: `packages/* + cli/*`)
- 기존 `packages/spring-sdk/` 와 신설 `packages/author-mcp-server/` 분리 (Engine SDK ↔ Author Platform 분리)
- Build/publish 격리: `pnpm publish --filter @seizn/author-mcp-server` 단독 publish, Next.js build 영향 0

---

## 1. 왜 별도 트랙인가

Track 3 (program) 의 카피 '쓰던 곳에서 계속 쓰세요' 는 **두 가지 다른 페르소나** 에 동시 적용 가능:

| 차원 | Track 3 — Program (Tauri Vault → Editor, 다른 세션) | Track 2 — Platform (API + MCP, 이 문서) |
|---|---|---|
| 작가가 쓰던 도구 | 한글 · 메모장 · 구글독스 · 스크리브너 · 뮤블 · 옵시디언 | Claude Desktop · Claude Code · Cursor · Cline · Continue · 옵시디언 + AI plugin |
| Seizn 통합 방식 | Tauri 데스크톱 앱이 옆에서 watch + recall | npm + MCP marketplace 통해 작가의 AI agent 안으로 plug-in |
| 페르소나 | 한국 mainstream 웹소설 작가 (수만 명) | AI-native 작가 · dev-author · B2B 출판사 (수백~수천 + B2B) |
| 가격 단위 | KRW ₩9,900~₩59,000 | USD $19~$99~Custom |
| 시장 size | 큼 | 작음 (개인) + 큰 ARPU (B2B) |
| Time to revenue | 즉시 (consumer SaaS) | 1~2 분기 (B2B 사이클) |
| Distribution moat | KR 작가 시장 점유 | MCP first-mover + B2B integration lock |
| 실패 시 sunk cost | 큼 (Tauri shell + watcher + UX 전체) | 작음 (backend 공유, 1~2주 wrapper) |

같은 Memory v3 backend, 같은 Author identity / billing 시스템, 같은 canon DB. 다른 채널, 다른 페르소나, 다른 가격.

**왜 동시 진행 가능한가:** GPT Pro × 2 + Claude Max × 2 = 8 parallel sessions 자원. Recall Vault 가 Tauri / file watcher / desktop UX 에 집중하는 동안 Platform 트랙은 backend API 노출 + MCP server wrapper 만 하면 됨 (frontend 없음, 1~2주 cycle).

---

## 2. 시장 신호

### 2.1 옵시디언 + AI 작가 (관찰됨, 2026-05)

KR 웹소설 작가 YouTube 댓글 (공개, 2026-05-04 관찰) 에서 한 작가가 자기 워크플로우를 다음과 같이 묘사:

> '검색 쉬움, 설정 위키화 가능, **가장 큰 게 ai 접근 권한 쉬움 (문장 수정, 요약, 의미기반 검색, 설정 위키화, ai랑 브레인 스토밍 가능, 맞춤법 검사, 설정 오류 찾기, 평가 다 가능)**, 가벼움, 클라우드 기능 (모바일로 메모, 집필, 읽기)'

이 작가는 **이미 시즌의 핵심 가치 (설정 오류 찾기 = canon conflict detection, 의미기반 검색 = recall) 를 옵시디언 + AI plugin 조합으로 reverse-engineering 중**. 시즌 MCP server 가 native 로 같은 가치 supply → **즉시 흡수 가능**.

이런 작가가 KR 안에서만 단일 댓글로 노출 = 글로벌 풀은 더 큼. 정확한 size 측정 어려우나, **첫 dogfood 페르소나 = 이미 시장에 자리 잡고 있음** 이 핵심.

### 2.2 작가 도구 분포 vs 우리 트랙 매핑

같은 댓글 thread 의 50+ 댓글 분석:

| Segment | 빈도 | 어느 트랙? |
|---|---|---|
| 메모장 + AI (오탈자 검사) | 5+ | Recall Vault (file watcher) |
| 한글 / Word + 엑셀 | 4+ | Recall Vault (import + entity card) |
| 스크리브너 | 4+ | Recall Vault (호환 import) |
| 뮤블 | 4+ | (직접 경쟁 — Recall Vault 가 import 만) |
| 구글 독스 | 3+ | Recall Vault (export/import flow) |
| **옵시디언 + AI** | **2+** | **★ Platform Track 핵심 페르소나** |
| Notepad++ / VSCode-like | 2+ | Platform (VSCode extension 장기) |
| Pencake · 업노트 · 삼성노트 | 1 each | (skip) |
| Pensiv 언급 | **0** | first-mover 기회 |
| Novelcrafter 언급 | **0** | first-mover 기회 |

Pensiv · Novelcrafter 한국 mainstream 노출 0건 = **두 트랙 모두 first-mover 가능 시간 창**.

### 2.3 글로벌 AI agent 채널 트렌드 (2024-11 → 2026-05)

- MCP launched Anthropic 2024-11
- Adoption: Claude Desktop · Claude Code · Cursor · Cline · Continue · Zed · JetBrains AI · Microsoft Copilot 모두 표준 채택
- Anthropic MCP 디렉토리 = 신생 app store 부상 중
- KR 작가용 MCP server 등록: **0** (2026-05 기준)
- '2~3년 내 모든 SaaS 가 MCP 등록 안 되면 AI agent 에 invisible' 가설이 표준화 진행 중

---

## 3. 포지셔닝

### 3.1 추천 카피 (한국어)

- **'쓰던 AI 도구 그대로. 캐논은 시즌이 부릅니다.'** (메인)
- 'Cursor · Claude · 옵시디언에서 바로 시즌 캐논을 부르세요.'
- 'API key 한 줄로 시즌 메모리를 작가님 도구 안으로.'

### 3.2 추천 카피 (영어, 글로벌 / B2B 자료)

- **'Plug Seizn canon into Claude · Cursor · Cline · Obsidian · your CLI.'** (메인)
- 'The first MCP-native canon recall for fiction writers.'
- 'Bring your own AI tool. Bring your own keys. Seizn does the memory.'

### 3.3 피해야 할 카피

- Recall Vault 와 동일한 absolute 표현 금지 ('한 단어도 잃지 않습니다' 등)
- 'Recall Vault 대체' 톤 금지 — 두 트랙은 보완. 우리는 'AI agent 안에서 쓰는 작가용', Recall Vault 는 '자기 도구 옆에 붙는 보조 앱용'
- 'AI 가 글을 써준다' 톤 금지 — 시즌 전체 정책 (recall · validation · backup, 생성 X)

### 3.4 차별화 vs Track 3 (Program, Tauri Vault → Editor)

| 차원 | Recall Vault | Platform Track |
|---|---|---|
| 사용자가 다운로드하는 것 | Tauri 데스크톱 앱 | npm package (또는 직접 API call) |
| 첫 onboarding step | 앱 설치 + 원고 파일 지정 | API key 발급 + Cursor/Cline/Claude config 1줄 추가 |
| 사용자가 추가로 부담하는 cost | 0 (앱 자체로 동작) | LLM API key (BYOK) 또는 managed model 비용 |
| 사용자 정체성 | 작가 (technical 무관) | AI agent 운용자 (작가 + technical 사용자) |
| 사용 패턴 | 매일 원고 작업 시 자동 watch | 작가가 AI 와 대화할 때 매번 자동 호출 |
| 가시성 | 명확 (앱 윈도우) | 투명 (AI agent 안에서 보이지 않게 작동) |
| 결제 instrument | 월 구독 KRW | API call 기반 USD (consumption-based) |

### 3.5 차별화 vs 외부 경쟁

| 경쟁 | 그들의 한계 | 우리 차별화 |
|---|---|---|
| **Pensiv** | desktop GUI only, MCP 없음 | MCP first-mover |
| **Novelcrafter** | BYOK 필수 + AI 가 자동 read 안 함 (사용자가 매번 attach) | 우리 MCP server = AI 가 자동 발견 + 호출 |
| **Sudowrite** | AI 가 글을 쓴다 | 우리는 recall only, 윤리 안전 |
| **GitHub Copilot 등 dev tool** | 코드용, 작가 도메인 0 | 작가 도메인 specialized |
| **Cursor / Cline / Continue 자체** | 일반 LLM 만, 작가 메모리 없음 | 우리가 Cursor/Cline 안에서 'project memory' 역할 |

**결정타:** 우리는 'Cursor/Cline/Claude/옵시디언 등 사용자가 쓰는 AI 도구의 기능 확장' 으로 포지션. 그들이 만드는 도구의 가치를 더해주는 plug-in. 경쟁이 아닌 보완.

---

## 4. 사용자 세그먼트 (우선순위)

### 4.1 1순위: 옵시디언 + AI plugin 작가

**Pain:** 옵시디언 자체로 의미기반 검색 / 설정 오류 찾기 다 가능하지만 plugin 조합이 fragile + 매번 prompt 작성 필요. AI 가 옵시디언 vault 전체 캐논 모름.

**Promise:** 시즌 MCP server 등록 한 번으로 AI 가 자동으로 캐논 호출. plugin 조합 폐기 가능.

**Recruit:** KR 옵시디언 작가 커뮤니티 (디스코드, 트위터 작가 계정), 글로벌 r/ObsidianMD writers subreddit.

### 4.2 2순위: Cursor / Cline / Continue 사용자 (dev-author overlap)

**Pain:** 작가이면서 개발자 / VSCode 워크플로우 익숙. 글쓰기 도구로 GUI 앱 별도 안 키고 싶음. AI agent 가 캐논 모르니 매번 컨텍스트 직접 paste.

**Promise:** 익숙한 IDE 안에서 자연어로 'Claude 야 7장 서윤 캐논 확인해줘' → 자동 호출 → 결과 inline 표시.

**Recruit:** Cursor / Cline 사용자 중 작가 정체성 가진 사람 (Twitter 'devs who write fiction' 검색, indie dev novelist 커뮤니티).

### 4.3 3순위: 출판사 / 매니지먼트 / 스튜디오 (B2B)

**Pain:** 장기 시리즈 (수백 화) 의 캐논을 작가 + 편집자 + PD 가 공유. 현재 엑셀 / 노션 / 위키 흩어짐. AI 도구 도입 시 internal canon API 필요.

**Promise:** 시즌 Studio API tier = audit log + SSO + 5 seats. 작가팀 워크플로우 안에서 캐논 single source of truth.

**Recruit:** 네이버웹툰 자회사 · 카카오엔터 · 디앤씨미디어 · 노벨피아 비즈팀 · 문피아 비즈팀 cold outreach. Track 3 의 Pro Plus / Studio Publisher 고객이 자연 upgrade path.

### 4.4 명시적 비-타깃

- 메모장 / 한글 only 사용자 → Recall Vault 영역
- AI 회의주의 작가 → 두 트랙 모두 비-타깃
- AI 가 글을 대신 쓰기를 원하는 작가 → 시즌 전체 비-타깃 (Sudowrite 영역)

---

## 5. MVP 범위 (8 features 동시 X — Layer 별 분리)

### 5.1 Layer 1 — Public REST API + API key 발급 시스템 (필수, foundation)

- Memory v3 의 핵심 endpoint 외부 노출 (recall · check · search · timeline · graph)
- API key 발급 dashboard (`/dashboard/account/api-keys`)
- Bearer token auth, scoped (read-only / read-write)
- Per-key rate limit + 월 quota
- Stripe metered billing 통합 (호출 수 기반)
- OpenAPI spec 자동 생성

### 5.2 Layer 2 — MCP server (차별화, distribution)

- Package `@seizn/author-mcp-server` (Node + TypeScript)
- Tools 5~6개:
  - `seizn_author_recall(name)` → entity card
  - `seizn_author_check(text)` → 충돌 검수
  - `seizn_author_remember(fact, entityId)` → 새 fact 등록
  - `seizn_author_search(query)` → semantic 검색
  - `seizn_author_timeline(from, to)` → chapter 진행도
  - `seizn_author_graph(entityId)` → 관계 graph subset
- npm publish + Anthropic MCP directory 등록
- 'Add to Claude Desktop in 30 seconds' tutorial doc

### 5.3 Layer 3 — IDE plugin (조건부, dogfood signal-driven)

옵시디언 / VSCode / JetBrains plugin 은 dogfood 신호 강한 곳만. 추측 생산 X.

### 5.4 명시적 비범위 (이 트랙)

- 자체 에디터 (Recall Vault 의 lab surface)
- Tauri 데스크톱 앱
- file watcher
- 모바일 (옵시디언 자체 모바일이 cover)
- AI prose generation
- 한국어 mainstream 가격 KRW (Recall Vault 가 cover)

---

## 6. 가격 (v8 lock 2026-05-06, 3-track 통합 정합)

### 6.1 Tier 표

| Plan | $/mo | $/yr (17% off) | 포함 |
|---|---|---|---|
| **Free** | $0 | — | 1 project, 100 recall/일 (Track 2 API + MCP only), MCP server 무제한 |
| **Indie** | $9 | $90 | 5 projects, 1k recall/월, priority indexing |
| **Pro** | $19 | $190 | unlimited projects, 10k recall/월, 90일 version history, 모든 export format |
| **Studio** | $99 | $990 | 100k recall/월, **5 seats**, audit log, SLA 99.5%, 1년 version history, HWP export |
| **Studio Managed** (Phase 3+, ~Q3) | $299 | $2,990 | + **500 Opus calls/월 managed** (host LLM 없어도 OK), overage $0.15/call |
| **Enterprise** | Custom | — | volume + SOC 2 + SSO + dedicated capacity + custom SLA |

**Track 2 plan = Track 2 surface (API + MCP) only.** Web dashboard (Track 1) 또는 Tauri desktop (Track 3) 사용 시 그 트랙의 별 plan 결제 필요. 단일 Stripe customer 위 트랙별 별 subscription (master `seizn-author-master-2026-05-05.md` §5.0 + §5.2 정합).

### 6.2 Backend LLM 정책 (도구별 — BYOK 필요 여부)

| 도구 | Backend LLM | BYOK 필요? |
|---|---|---|
| `seizn_author_recall` | ❌ DB lookup only | ❌ Free 에서도 unlimited fast |
| `seizn_author_remember` | ❌ DB write | ❌ |
| `seizn_author_graph` | ❌ DB join | ❌ |
| `seizn_author_search` | ⚠️ embedding only (cheap) | ❌ embedding cost 우리 부담 |
| `seizn_author_check` | ✅ Sonnet/Opus 캐논 비교 | ✅ BYOK or Studio Managed |
| `seizn_author_timeline` | ✅ beat 추출 | ✅ BYOK or Studio Managed |

→ **No-LLM 도구 (recall/remember/graph/search) 는 어떤 tier 든 BYOK 무관**. Free $0 plan 사용자도 100 recall/일 quota 안에서 무료로 사용. AI-enhanced 도구 (check/timeline) 만 사용자가 자기 Anthropic/OpenAI key 입력하면 활성화 (Studio Managed 부터는 우리 부담).

### 6.3 Host LLM 자원 무관

사용자의 host AI agent (Claude Desktop / Code / Cursor / Cline / Continue / Zed 등) 가 자체 LLM 호출 처리. **Seizn 가격은 host LLM cost 와 분리**:

- Claude MAX/Pro 구독자 → Claude Code/Desktop 안에서 우리 MCP 사용 OK (host LLM = 구독으로 cover)
- Cursor Pro 구독자 → Cursor 안에서 우리 MCP 사용 OK
- BYOK 사용자 (Cline, Continue 등) → Cline 에 자기 key 입력, 우리 MCP 도 같은 key 또는 별도 BYOK 가능
- ChatGPT Plus + ChatGPT 웹 = host 가 MCP 미지원 (제외)

### 6.4 정당화 (anchor 비교)

- **$9 anchor:** Notion Plus $10 · 뮤블 ₩4,900 (~$3.7) · 옵시디언 Sync $4 — 한국 mainstream entry-point
- **$19 anchor:** ChatGPT Plus $20 · Cursor Pro $20 · Notion Plus + AI $18 · Novelcrafter $20 — power user sweet spot
- **$99 anchor:** Cursor Business $40/seat × 5 = $200, 우리는 절반 = B2B 진입 magnet
- **$299 anchor:** Anthropic Tier 4 commit $5,000+/월의 entry-point (Studio Managed 은 우리가 enterprise discount 받아 markup 가능)
- **Free + 100/일 (no BYOK):** 옵시디언 / Cline / Cursor 사용자 즉시 dogfood 가능 = adoption funnel 진입장벽 0
- **per-call quota:** AI 비용 unit economics 보호 + 사용자 surprise bill 방지

### 6.5 Unit economics 검증

**Indie tier ($9) BYOK 사용자 가정** (recall/remember/graph 위주, no AI-enhanced):
- Backend LLM cost = $0 (no-LLM 도구만)
- Embedding cost (search) = ~$0.0001/call × 1,000 = ~$0.10
- Infra fixed cost = Supabase $25 + Vercel $20 = $45/월 (pool)
- → 5 paying Indie users = $45 매출, BEP

**Studio Managed ($299) 가정** (managed Opus 500 calls 포함):
- Opus 4.7 cost = $0.10/call × 500 = $50/월
- Gross margin = $249/월 per user
- Overage $0.15/call > Opus passthrough $0.10/call → 헤비 사용 자연 흡수

**v8 변경 사유:** v7 ($39/$149/$499/$2500) 는 Author = single Web GUI product 전제. v8 = 3 트랙 통합 + Pure BYOK default → Indie $9 entry 가능. v7 → v8 마이그레이션 = Phase 0 task pack 안에 Stripe deprecate + 신규 product 등록.

→ 메모리: `seizn-author-pricing-2026-05.md` v8 lock + 도구별 BYOK 정책 보강 (2026-05-06)

---

## 7. 기술 stack

### 7.1 Layer 1 — REST API

```text
GET    /api/v1/projects                                   list
POST   /api/v1/projects                                   create
GET    /api/v1/projects/{id}/recall?q=<name>              primary
GET    /api/v1/projects/{id}/recall/{entityId}/mentions
POST   /api/v1/projects/{id}/manuscript/index             push raw text
GET    /api/v1/projects/{id}/conflicts
POST   /api/v1/projects/{id}/canon/{entityId}/approve     approve AI suggestion
GET    /api/v1/projects/{id}/timeline
GET    /api/v1/projects/{id}/graph?root=<entityId>
GET    /api/v1/usage                                      current month quota
```

- Auth: Bearer token (API key, scoped). v1 OAuth 없음 (수동 paste)
- Rate limits: per-key token bucket (Free 100/day, Indie 60/min, Studio 600/min)
- Versioning: `/api/v1/*` URL prefix. 6개월 deprecation policy
- Backed by 기존 Memory v3 service (`src/lib/author/ui/service.ts` 의 endpoint 일부 reuse, CSRF-free Bearer 모드 추가)

### 7.2 Layer 2 — MCP server

- Package: `@seizn/author-mcp-server` (Node ESM)
- Distribution: npm + Anthropic MCP directory + GitHub README
- Auth: `SEIZN_API_KEY` env var 또는 `~/.seizn/config.json`
- 모든 tool 호출은 Layer 1 API 위임
- `mcp__seizn__*` 형태로 NPC SDK 쪽 MCP server 와 namespace 분리 (`mcp__seizn-author__*` 권장)

### 7.3 SDK (Phase 4+)

- TypeScript / JavaScript first (가장 큰 dev-author overlap)
- Python 두 번째 (옵시디언 Smart Connections 등 plugin 작성자)
- OpenAPI spec 에서 자동 generation

### 7.4 IDE plugin (조건부, signal-driven)

| Plugin | Distribution | Effort |
|---|---|---|
| 옵시디언 plugin | Obsidian Community Plugins | 1주 |
| VSCode extension | VSCode Marketplace | 2주 |
| Cline / Continue native integration | upstream PR | 1주 |
| JetBrains plugin | JetBrains Marketplace | 2주 |
| Neovim Lua plugin | community | 1주 |

dogfood 신호 (사용자 5명 명시 요구) 있을 때만 build, 추측 생산 X.

---

## 8. Phased plan

### Phase 0 — Spec lock (W0, this week, 1 주)

- Layer 1 endpoint scope lock (위 §7.1)
- 가격 tier lock (위 §6)
- API key 발급 시스템 spec (auth, rate limit, scopes)
- Stripe metered billing product 설계
- Public docs 사이트 stub (`docs.seizn.com/api` 또는 `seizn.com/api`)

**Gate to Phase 1:** spec 문서 사용자 승인. 메모리 가격 갱신 완료. Track 3 (program) owner session 와 backend 공유 confirm (master § 4 cross-track 규칙 따라).

### Phase 1 — Layer 1 API live (W1~W2, 2 주)

- §7.1 endpoint 구현 (Memory v3 reuse, CSRF-free Bearer)
- API key 발급 dashboard
- Rate limit middleware
- Quota tracking + Stripe metered billing
- Public docs (curl 예제 + auth quickstart)

**Gate to Phase 2:** end-to-end 테스트 — key 발급 → recall 호출 → quota 카운트 → invoice 생성. 모든 step pass.

### Phase 2 — MCP server prototype + 옵시디언 dogfood (W3, 1 주)

- `@seizn/author-mcp-server` 구현 (5~6 tools)
- npm publish + Anthropic MCP directory 제출
- 옵시디언 + AI 작가 2~3명 dogfood (KR 작가 디스코드 또는 글로벌 r/ObsidianMD 통해 recruit)
- 각자 Indie tier 1년 무료 in exchange for 30분 weekly 피드백

**Gate to Phase 3:** 2 of 3 dogfood 작가가 'Cursor 보다 가치 있다' 또는 동등 신호. 데이터 품질 이슈 0건.

### Phase 3 — IDE plugin + B2B outreach (W4~W6, 2~3 주)

- 옵시디언 plugin (가장 강한 dogfood signal 예상)
- KR 출판사 3곳 cold outreach (Studio API trial)
- Marketing landing 페이지 (`seizn.com/api` 또는 `seizn.com/platform`)
- MCP marketplace 홍보 submission

**Gate to public launch:** 5 paying Indie users + 1 B2B trial.

### Phase 4 — Scale + multi-language (post-MVP)

- Python SDK
- VSCode extension
- ja / zh-hans i18n docs (글로벌 power user 확장)
- NPC SDK MCP server 와 통합 dashboard 검토

---

## 9. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| API key abuse / cost overrun | Medium | Strict per-key rate limit, hard quota cap, alert threshold, 고-사용자 BYOK 권장 |
| MCP server 실제 사용 측정 어려움 | Medium | Custom user-agent header, dogfood survey, marketplace download stats |
| Pensiv / Novelcrafter 가 우리보다 먼저 MCP 등록 | Low (현 신호 0) | Phase 1 W2 안에 ship, first-mover lock |
| 옵시디언 + AI segment 너무 작아 sustain 불가 | Medium | Recall Vault 가 mainstream cover, Platform 은 platform / B2B 게이트웨이 — consumer scale 의도 X |
| B2B 사이클 W4 보다 길 가능성 | High | Indie tier ($19) 가 self-serve 즉시 매출, B2B 는 bonus |
| MCP 표준 변경 (Anthropic) | Low | TC 지원 안정, minor version 업데이트 가능 |
| Recall Vault 와 brand 혼란 | Medium | 명확 메시지: 'Recall Vault = standalone 앱, Platform = 작가님 도구 안으로'. landing 분리 |
| 한국어 docs 우선 vs 영어 우선 결정 지연 | Low | 옵시디언/Cursor 사용자 글로벌 bilingual, 영어 first 권장. KR 마케팅 카피만 별도 |
| LLM 비용 증가 (Anthropic 가격 인상) | Medium | tier 별 모델 명시 (Haiku/Sonnet/Opus), 가격 변동 시 tier 별 quota 조정 가능 |

---

## 10. Recall Vault Track 과의 분리 / 협업 규칙

### 10.1 공유

- Memory v3 backend (entity store, conflict pipeline, audit log)
- Author identity / Supabase auth
- Stripe customer (한 사람이 두 tier 동시 결제 가능)
- canon database (project 단위)

### 10.2 분리

- frontend distribution (Tauri vs npm)
- pricing currency (KRW vs USD)
- marketing landing page
- 사용자 onboarding flow
- 영어/한국어 docs 우선순위 (Recall Vault = KR first, Platform = EN first)

### 10.3 협업 (정합 cross-track)

- Recall Vault Pro Plus 사용자 → Platform API key 자동 발급 (cross-sell)
- Platform Studio API 사용자 → Recall Vault Studio Publisher tier 통합 옵션
- backend API endpoint 변경 시 두 트랙 동시 협의 (breaking change 방지)
- canon entity schema 변경 시 두 트랙 동시 마이그레이션

### 10.4 명시적 anti-pattern (충돌 회피)

- Platform 트랙이 Tauri shell / file watcher / desktop UX 만지기 X (Recall Vault 영역)
- Recall Vault 트랙이 npm package / MCP server publish X (Platform 영역)
- 두 트랙이 같은 endpoint 다른 spec 으로 따로 만들기 X (single source of truth)

---

## 11. Open questions (Phase 0 전 결정 필요)

1. **Brand naming.** `Seizn Author Platform`? `Seizn Author API`? `Seizn for Developers`? 아니면 namespace 만 (`seizn.com/api`)? 현 `engine.seizn.com` 은 NPC SDK 로 점유 — Author Platform 도 별 subdomain 필요? `api.seizn.com` 또는 `seizn.com/author/api` 후보.
2. **Free tier abuse.** 100 recall/일 BYOK — adoption 충분? 500 으로 올리면 sustained free-rider 위험. 시작은 100 권장.
3. **Stripe metered billing.** 기존 Stripe 통합은 dashboard subscription 용. 새 metered product 신설 필요. Stripe Meters API 활용.
4. **MCP server hosting.** npm only (사용자 self-host) vs hosted (managed via WebSocket from Seizn cloud)? hosted 가 onboarding 쉬우나 cost 증가. v1 = npm only 권장.
5. **한국어 / 영어 docs 우선.** 옵시디언 / Cursor 사용자 글로벌 → 영어 first. KR 마케팅 카피만 KR. v2 에서 ja / zh-hans 추가.
6. **B2B 계약 템플릿.** Studio API 첫 trial 전 Custom Enterprise MSA 필요. 법무 review.
7. **메모리 가격 정합 처리.** `seizn-author-pricing-2026-05.md` 의 $39/$129/$399 를 (a) Recall Vault Pro Plus 가격으로 재배치, (b) 'Author full web GUI tier' 로 재정의, (c) deprecate 후 두 트랙 별 가격 신설 — 셋 중 결정.

---

## 12. Anti-goals

- Tauri / desktop / file watcher 영역 침범 금지 (Track 3, `seizn-desktop/*` 별 repo, 다른 세션)
- Memory v3 service / store / supabase-store 내부 수정 금지 (persistence cycle 영역)
- KNOT 식별자 (`char.sori` · `knot.short1` · `청학여` 등) 노출 금지 — 모든 sample 은 Saebyeok IP 사용
- Engine NPC SDK 디자인 cue (cosmic dark · violet · cyan · JetBrains Mono dominant · season tier) 노출 금지 — Author 톤 (warm paper, terracotta, Newsreader serif) 유지
- BYOK 강제 금지 — Free tier with BYOK OK, Indie/Studio 는 managed 옵션 제공
- Export lock 금지 — Novelcrafter anti-pattern
- Cancel 후 read-only lock 금지 — 동일
- 'Never lose your data' 절대 표현 금지 — Recall Vault 와 동일 legal/reputation 정책
- 큰따옴표 (`""`) 금지 — 한국어 public copy 작은따옴표 (`''`) 만
- AI prose generation 노출 금지 — 시즌 전체 정책

---

## 13. Hand-off — Build Agent 위임 시 (영어, agent-to-agent)

```text
You are implementing Seizn Author Track 2 (Platform: API + MCP).
Do NOT touch Track 3 (Tauri desktop Vault → Editor) which lives at
seizn-desktop/* in a separate repo and is owned by a different
session. Do NOT touch the Engine NPC SDK surface (engine.seizn.com
or src/app/engine/*).

Work locations:
- REST API: seizn/src/app/api/v1/*
- MCP server npm package: seizn/packages/author-mcp-server/* (new)
- API key dashboard: seizn/src/app/dashboard/account/api-keys/*

Goal:
Expose the existing Memory v3 backend as a public API + MCP server, so
AI-native power-user writers can call Seizn canon recall from Claude
Desktop / Claude Code / Cursor / Cline / Continue / Obsidian (with AI
plugin) without leaving their existing tool.

Primary user problem:
Some writers do not want to migrate to a new desktop app. They already
use AI agents and want Seizn to plug into those tools. Today they
reverse-engineer Seizn-like recall via Obsidian + AI plugins or
manually paste manuscript context into ChatGPT/Claude. The product
must natively supply that recall via MCP and REST.

Scope (Phase 1 + 2):
1. Layer 1 - Public REST API at /api/v1/* with Bearer-token auth
   (scoped API keys), rate limiting per key, monthly quota tracking,
   Stripe metered billing integration.
2. API key issuance dashboard at /dashboard/account/api-keys.
3. OpenAPI spec auto-generated from the API definition.
4. Layer 2 - npm package @seizn/author-mcp-server with 5-6 tools
   (recall, check, remember, search, timeline, graph). All tool calls
   delegate to Layer 1 REST API. Auth via SEIZN_API_KEY env var.
5. Submit MCP server to Anthropic MCP directory.
6. Public docs at docs.seizn.com/api or seizn.com/api with curl
   examples + Claude Desktop / Cursor / Cline quickstart.

Out of scope:
- Tauri desktop shell or any GUI editor (Recall Vault territory)
- File watcher (Recall Vault territory)
- AI prose generation
- Mobile app
- HWP write export (NPC SDK or Recall Vault may handle later)
- Mainstream KR consumer pricing (Recall Vault handles KRW)

Non-negotiables:
- Never block data export
- Never train on user content
- All AI-derived canon stays as a suggestion until user-approved
- Hard rate limit + quota cap per API key (no surprise bills for users
  or for us)
- API versioning at /api/v1/* with 6-month deprecation policy
- BYOK supported on every tier; managed model only on paid tiers
- No double quotes in any KR public copy

Reference docs:
- This design doc: seizn-author-platform-track-2026-05-05.md
- Companion (Recall Vault, do not collide):
  seizn-author-track-3-program-2026-05-05.md
- Backend internals (read-only reference):
  docs/architecture/seizn-author-memory-v3.md
- Existing Author UI service to reuse endpoints from:
  src/lib/author/ui/service.ts

Pricing (locked):
- Free: $0, 100 recall/day, BYOK required
- Indie: $19/mo, 10k recall/mo, managed Haiku or BYOK
- Studio API: $99/mo, 100k recall/mo, 5 seats, managed Sonnet or BYOK
- Enterprise: Custom, managed Opus or BYOK, SOC2/SSO/SLA

Build cycle structure should mirror
seizn-author-dashboard-redesign-task-pack.md - phases, verify gates,
commit conventions per phase, sequential execution only.
```

---

## 14. 다음 액션

1. **이 문서 stakeholder (= 사용자) review** — 진행 / 수정 / 보류 결정
2. **메모리 갱신** — `seizn-author-pricing-2026-05.md` 의 $39/$129/$399 가격을 두 트랙 분리로 재정의 (Open Question §11.7)
3. **Track 3 (program) owner session 와 master 동기화** — backend 공유 + collision 회피 confirm. master `seizn-author-master-2026-05-05.md` 와 Track 3 `seizn-author-track-3-program-2026-05-05.md` cross-reference. 사용자가 다른 Claude 세션 시작 시 이 문서 같이 전달
4. **Phase 0 task pack 작성** — Layer 1 API spec + key issuance + Stripe metered + docs stub. 별도 cycle 로 codex / 다른 Claude 위임 가능

---

*End of design doc. 다음 결정 = 사용자 승인 후 메모리 갱신 + Phase 0 task pack 작성 시작.*
