# Seizn Author Studio — Master 3-Track 분기 SSOT

**Cycle date:** 2026-05-05
**Status:** Active. 3-track 병렬 진행 시 single source of truth.
**Convention:** 본 cycle 의 모든 doc 은 `2026-05-05` 날짜 stamp 통일. 이후 cycle 은 새 날짜.

## 동반 doc

| 파일 | 트랙 | 책임 세션 |
|---|---|---|
| `seizn-author-track-1-web-2026-05-05.md` | 웹 (Web) | TBD (별 세션) |
| `seizn-author-track-2-platform-2026-05-05.md` | API + MCP (Platform) | TBD (별 세션) |
| `seizn-author-track-3-program-2026-05-05.md` | Tauri 데스크톱 (Program) | 이 세션 |
| `_archive/seizn-author-studio-design-doc.md` | 원안 (대체됨) | — |
| `_archive/seizn-author-studio-business-review-improved.md` | 사업성 검토 input | — |

---

## 1. 왜 3-track 분기인가

작가 도구 시장은 페르소나·채널·가격이 한 제품으로 다 cover 되지 않는다. 작가 댓글 관찰 (2026-05-04) 과 경쟁 도구 분석 결과:

- 한국 mainstream 웹소설 작가 (수만 명) 는 한글·메모장·구글독스·뮤블·Scrivener 등 기존 도구를 떠나기 싫어한다 → **데스크톱 보조 앱** 필요. KRW 가격, KR-first 마케팅.
- AI-native 작가 / dev-author / B2B 출판사는 Cursor·Claude Desktop·옵시디언 + AI plugin 안에 캐논 호출이 자연스럽게 붙기를 원한다 → **API + MCP** 필요. USD 가격, EN-first 마케팅.
- 다른 디바이스에서 가볍게 읽고/검토/공유하는 흐름과, 출판사·매니지먼트의 협업 표면은 web 이 가장 자연스럽다 → **Web GUI + 협업** 필요. 기존 `/dashboard/author` 위에서 expand.

이 세 페르소나 / 채널은 서로 다른 메시징·가격·distribution 을 요구한다. 한 트랙에 묶으면 카피·UX·가격 모두가 모호해진다.

따라서 **공유 backend (Memory v3, canon DB, Author identity, Stripe customer) 위에 세 별 트랙**으로 분기한다. 같은 데이터, 다른 표면.

---

## 2. Track 정의

### Track 1 — 웹 (Web)

| 차원 | 값 |
|---|---|
| Surface | `seizn.com/dashboard/author` 및 후속 web 표면 |
| Stack | Next.js 15 + React 19 + Tailwind v4 (기존 그대로) |
| Distribution | Vercel auto deploy |
| Persona | KR mainstream 작가 + 출판사/스튜디오 협업자 + 모바일 read 작가 |
| Pricing | **트랙 자체 가격** (Track 1 owner session 이 lock. KRW 기본, web 채널 가격 모델 별도) |
| Repo path | `C:\Users\admin\Projects\seizn` (기존) |
| 첫 마일스톤 | Phase -1 dashboard import + recall prototype (7일, founding writer 5명 검증) |

**Scope 후보 (track-1 doc 에서 확정):**

- 기존 dashboard redesign cycle (1차 + 2차) 위에 manuscript import + `@recall` 검색 prototype
- founding writer dogfood + WTP 검증
- web 협업 / shared canon bible / reviewer seat (Phase 1+)
- public author profile (deferred)
- Track 3 (Program) Vault 데이터의 web read parity (Phase 2+)
- mobile read view (Phase 1+)

### Track 2 — API + MCP (Platform)

| 차원 | 값 |
|---|---|
| Surface | `/api/v1/*` REST + `@seizn/author-mcp-server` npm package |
| Stack | Next.js API routes + TypeScript MCP server |
| Distribution | API key dashboard + npm + Anthropic MCP directory |
| Persona | AI-native 작가 / 옵시디언 + AI / Cursor / Cline / Continue / dev-author / B2B 출판사 API |
| Pricing | **트랙 자체 가격** (Track 2 owner session 이 lock. USD 기본, API/MCP 채널 가격 모델 별도. v8 lock 진행 중) |
| Repo path | `C:\Users\admin\Projects\seizn` (web 과 같은 repo, `src/app/api/v1/` + `packages/author-mcp-server/`) |
| 첫 마일스톤 | Phase 0 API spec lock → Phase 1 Layer 1 REST + key 발급 + Stripe metered (W1~W2) |

**Scope (track-2 doc 에 lock):**

- Layer 1: `/api/v1/*` REST endpoint (recall · check · remember · search · timeline · graph · usage)
- API key 발급 dashboard (`/dashboard/account/api-keys`)
- Bearer token + per-key rate limit + 월 quota + Stripe metered billing
- OpenAPI spec 자동 생성
- Layer 2: `@seizn/author-mcp-server` npm package (5~6 tools)
- Layer 3: 옵시디언 / VSCode plugin (signal-driven, dogfood 5명 시 진입)

### Track 3 — Tauri 데스크톱 (Program)

| 차원 | 값 |
|---|---|
| Surface | Tauri 2.x desktop app (Win/Mac/Linux) + 모바일 (iOS/Android) 후속 |
| Stack | Tauri 2.x (Rust) + React + TipTap + Yjs + y-leveldb |
| Distribution | GitHub Release + installer + auto-update |
| Persona | 한글·메모장·구글독스·뮤블·Scrivener 정착 작가 (KR mainstream long-form fiction) |
| Pricing | **트랙 자체 가격** — KRW (Pro ₩12,900 / Pro Plus ₩24,900 / Studio Publisher ₩99,000+). Track 3 doc § 14 에 lock |
| Repo path | `C:\Users\admin\Projects\seizn-desktop` (신설, 별 repo) |
| 첫 마일스톤 | Phase 0 Recall Vault desktop alpha (Tauri shell + file watcher + local snapshot + global hotkey recall) |

**Scope (track-3 doc 에 lock):**

- Phase -1: Track 1 Phase -1 prototype 결과 검증 후 진입 gate (founding writer 3/5 retain)
- Phase 0: Tauri shell + file watcher + local append-only snapshot + zip backup/export + Memory v3 recall index + 전역 단축키 recall
- Phase 1: snapshot diff/restore + entity card 승인 UI + cloud backup opt-in + closed beta + 가격 검증
- Phase 2: 자체 에디터 (TipTap + Yjs + IME-safe Korean composition) — *committed milestone, not conditional*
- Phase 3: HWP/HWPX 안정 export + 모바일 (iOS/Android) + cross-device sync

---

## 3. 공유 backend

세 트랙은 모두 다음을 공유한다. 변경은 cross-track 협의 필수.

| Backend | 위치 | 변경 권한 |
|---|---|---|
| Memory v3 service | `seizn/src/lib/author/ui/{service,store,supabase-store}.ts` | persistence cycle / Track 2 (API expose 시) |
| canon DB schema | `supabase/migrations/` | 별 cycle (DB migration cycle) |
| Author identity / auth | `seizn/src/app/(auth)/`, `seizn/src/app/api/auth/` | 별 cycle (auth migration handoff) |
| Stripe customer | dashboard subscription product + Track 2 metered product | 가격 변경 시 3-track 모두 협의 |
| canon entity schema | TypeScript types in `seizn/src/types/author-memory-v3.ts` | breaking change 시 3-track 동시 마이그레이션 |
| i18n dictionaries | `seizn/src/i18n/dictionaries/{en,ko,ja,zh-hans,zh-hant}.json` | 자유 (key 추가만, 기존 key 변경/삭제 시 협의) |

---

## 4. Cross-track 충돌 회피 규칙

### 4.1 영역 분리 (touch X)

| 트랙 | 절대 만지지 말 영역 |
|---|---|
| Track 1 (Web) | `seizn-desktop/` 전체, `packages/mcp-server/` 내부 |
| Track 2 (Platform) | `src/components/dashboard/redesign/*` (Track 1), `seizn-desktop/` 전체, Tauri config |
| Track 3 (Program) | `seizn/` 의 어떤 파일도 직접 수정 X. 필요한 backend 변경은 issue/spec 만 작성 → Track 2 또는 별 세션이 implement |

### 4.2 같은 endpoint / schema / 가격 변경 시

- 한 트랙이 단독 결정 X. master doc 의 §3 표 갱신 후 3-track 알림.
- breaking change (API endpoint 제거, schema migration, 가격 단가 변경) 는 master 에 PR-style 변경 노트 추가.

### 4.3 같은 페르소나에 다른 메시지 금지

- Track 1 KRW 마케팅 카피와 Track 2 USD 카피가 서로 모순되지 않게.
- Track 3 Recall Vault 카피 (`쓰던 곳에서 계속 쓰세요`) 와 Track 2 Platform 카피 (`쓰던 AI 도구 그대로`) 는 페르소나가 다르므로 공존 OK. 같은 사용자에게 동시 노출 시 disambiguation: Track 1/3 = `데스크톱·웹·기존 도구 + Vault`, Track 2 = `AI agent 안에서 호출`.

### 4.4 절대 표현 금지 (3-track 공통)

- `한 단어도 잃지 않습니다.` 등 absolute guarantee 금지 (legal/평판 리스크)
- `AI 가 글을 대신 써줍니다.` 금지 (시즌 전체 정책 — recall · validation · backup, 생성 X)
- `작가용 올인원 집필툴` 금지 (직접 경쟁 회피)
- 한국어 public copy 에서 큰따옴표 (`""`) 금지 — 작은따옴표 (`''`) 만
- `KNOT` / `청학여` / `char.sori` / `knot.short1` 등 NPC SDK 식별자 노출 금지 (sample 은 Saebyeok IP 만)
- engine.seizn.com 디자인 cue (cosmic dark · violet · cyan · JetBrains Mono · season tier) Author 표면 노출 금지

---

## 5. Cross-track sell path

### 5.0 가격 모델 분리 원칙 (lock 2026-05-06)

- **트랙별 별 가격, 별 plan, 별 인보이스.** Web · API/MCP · Program 은 채널 / 페르소나 / cost structure 모두 다름. 단일 통합 plan 으로 묶지 않음.
- **`single plan = all surfaces` 정책 X.** 한 트랙 plan 이 다른 트랙 surface 를 커버하지 않는다. 사용자가 두 트랙 surface 를 쓰려면 두 plan 결제.
- **단일 Stripe customer.** 한 사용자 = 한 customer. 그 위에서 트랙별 plan 이 별 subscription 으로 붙음. 인보이스 분리.

### 5.1 Cross-track upsell 매트릭스

| 시작 트랙 | 다음 단계 | Trigger |
|---|---|---|
| Track 1 paid → Track 3 trial | Track 3 desktop 다운로드 | snapshot / file watcher 가치 알게 됨 |
| Track 3 paid → Track 2 API key 발급 | Track 2 plan 별 결제 | 작가가 Cursor/Claude 에서 캐논 호출 원함 |
| Track 1/3 Studio Publisher → Track 2 Studio | Track 2 별 결제 | 출판사 internal API 필요 |
| Track 2 Studio → Track 1 web seats | Track 1 별 결제 | B2B 작가팀 web 협업 필요 |

각 단계는 새 plan 결제. cumulative add-on 형태가 아니라 **각 트랙 plan 의 동시 보유**.

### 5.2 결제 모델

- 한 사용자의 Stripe customer = 1개
- 그 customer 에 트랙별 별 subscription product:
  - Track 1: KRW subscription (Track 1 owner session 이 product / tier lock)
  - Track 2: USD subscription + metered usage (Track 2 owner session 이 v8 lock)
  - Track 3: KRW subscription (Track 3 doc § 14 에 lock)
- 인보이스 트랙별 분리. 작가가 자기 영수증에 어느 채널 결제인지 명확
- 환불 / 일시중단 / 다운그레이드도 트랙별 독립

---

## 6. Naming / Conventions

### 6.1 Doc 파일 naming

```
seizn-author-master-{cycle-date}.md           # 이 파일
seizn-author-track-{1|2|3}-{web|platform|program}-{cycle-date}.md
seizn-author-track-{N}-phase-{phase}-task-pack-{cycle-date}.md
_archive/{원본 파일명}.md                       # deprecated/대체된 doc
```

### 6.2 Brand naming

- 제품 라인 전체: **Seizn Author Studio**
- Track 1 표면: `Seizn Author Studio for Web` (또는 `the Seizn dashboard`)
- Track 2 표면: `Seizn Author Platform` (외부 카피), `Seizn Author API & MCP` (개발자 docs)
- Track 3 표면: `Seizn Author Studio for Desktop` (또는 `Seizn Recall Vault` 첫 launch ramp 중)

### 6.3 Repo / 폴더

- `seizn/` — Track 1 + Track 2 source (web + API + MCP server)
- `seizn-desktop/` — Track 3 source (Tauri shell)
- `seizn-mobile/` — (deferred, Track 3 Phase 3 에서 신설 검토. Tauri mobile 통합 가능성)

### 6.4 Git account

세 트랙 모두 `litheonhq <litheonhq@gmail.com>` (CLAUDE.md §9). 다른 계정 절대 X.

---

## 7. 작업 분배 (현재 cycle)

| 트랙 | 책임 세션 | 즉시 다음 step |
|---|---|---|
| Track 1 (Web) | TBD Claude (별 세션) | track-1 doc 본문 작성 → Phase -1 dashboard prototype task pack |
| Track 2 (Platform) | TBD Claude (별 세션) | track-2 doc 의 Phase 0 spec lock → Phase 1 Layer 1 task pack |
| Track 3 (Program) | 이 세션 | track-3 doc 갱신 → Phase 0 task pack → `seizn-desktop/` repo scaffold |

세 트랙은 병렬 진행. 단 Track 3 Phase -1 gate 는 Track 1 Phase -1 prototype 결과에 의존:

- Track 1 Phase -1 (7일) 에서 founding writer 5명 중 3명 retain + 2명 WTP 신호 → Track 3 Phase 0 진입 OK
- 미달 시 Track 3 Phase 0 보류, Track 1 Phase -1 iterate

---

## 8. Open questions (cycle 진행 중 결정 필요)

1. **`seizn-desktop/` 초기 stack lock.** Tauri 2.x + React + TipTap + Yjs + y-leveldb 으로 진행? (Track 3 doc §5.2 에 detail. 사용자 승인 후 lock).
2. **메모리 가격 정합.** `seizn-author-pricing-2026-05.md` 메모리 ($39/$129/$399) 와 본 master 의 KRW + USD 트랙 분리 가격 조율 — 메모리 갱신 필요.
3. **Track 1 - Track 3 간 web read parity 시점.** Phase 1 (closed beta) 중 web read 만? Phase 2 (editor) 와 함께 web write parity? Track 3 doc 에서 결정.
4. **HWP 우선순위.** Phase -1 인터뷰에서 `HWP 없으면 결제 보류` 비율 40% 이상이면 Phase 1.5 로 당김. Track 3 doc §7 에 분기.
5. **Tauri mobile (iOS/Android) 진입 시점.** Phase 3 default 이지만, founding writer 인터뷰에서 모바일 needs 강하면 Phase 1 후반에 spike.
6. **부산대 맞춤법 검사기 상업 라이선스.** 현재 미해결. 검사기 v1 에서 완전 제거 또는 사용자가 외부 검사기로 export 하는 flow 만 제공. 라이선스 확정 전 제품 서버에서 호출 X.
7. **Pensiv 사실 검증.** GPT input doc 은 pensiv 가 desktop + offline + HWP + mobile beta 다 갖췄다고 주장. Track 3 Phase -1 에서 pensiv.so 직접 fetch 로 검증 필요.

---

## 9. 다음 액션 (이 세션)

1. `seizn-author-track-3-program-2026-05-05.md` 본문 갱신 — Track A 분리, Vault-first launch ramp + Editor Phase 2 commit, Tauri/TipTap/Yjs stack lock, 977-line 원안의 deep stack 분석 흡수.
2. `seizn-author-track-1-web-2026-05-05.md` skeleton 작성 — 다른 세션이 본문 채울 frame.
3. `C:\Users\admin\Projects\seizn-desktop\` repo scaffold (Tauri 2.x init + React + git init + `litheonhq` 계정).
4. Track 3 Phase 0 task pack 작성 (`seizn-author-track-3-phase-0-task-pack-2026-05-05.md`).

---

*End of master. 본 doc 변경 시 3-track 모두에 알림. 변경 이력은 git log 로 추적.*
