# Seizn Author Studio — Track 3: Program (Tauri 데스크톱)

**Cycle date:** 2026-05-05 (작성), 2026-05-06 (global-first lock)
**Status:** Active design doc. 이 cycle 의 Track 3 SSOT.
**Owner session:** Track 3 owner — Windows VSCode Claude (swap 2026-05-06, Tauri Windows native build 환경 적합)
**Locale strategy (lock 2026-05-06):** **EN-first, ko/ja/zh-Hans/zh-Hant/es secondary.** 이전 KR-only 페르소나는 ko locale segment 으로 demote. 이유: Litheon LLC USD revenue 정합 + 글로벌 long-form fiction writer 풀 (Scrivener 6M+ 사용자, Reedsy 1M+, Atticus·Vellum 50k+) 이 KR mainstream (~수만) 보다 큼 + Track 2 와 같은 USD 단위로 cross-track upsell 단순화
**Repo:** `C:\Users\admin\Projects\seizn-desktop\` (root commit `32ebc28`, Phase 0.1~0.6 완료)
**Master:** `seizn-author-master-2026-05-05.md`
**Companion tracks:**
- Track 1 (Web): `seizn-author-track-1-web-2026-05-05.md`
- Track 2 (Platform): `seizn-author-track-2-platform-2026-05-05.md`

---

## 0. 결론 한 줄

> **Vault-first launch, built-in editor is a Phase 2 commitment (not conditional). The product writers eventually live in.**

Vault keeps writers in the tools they already use (Scrivener · Ulysses · Bear · Word · Google Docs · Obsidian · Vellum · Atticus · Hangul · Mubble · Notepad). Editor is the *destination*. Same Tauri shell, same backend, same identity. Vault lowers the entry friction, Editor earns retention.

**Locale: EN-first, ko/ja/zh-Hans/zh-Hant/es secondary** (lock 2026-05-06 global-first).

---

## 1. 사용자 신호 — 작가 댓글 분석 (2026-05-04 관찰)

KR 웹소설 작가 YouTube 댓글 thread 50+ 댓글 분석 (사용자가 직접 수집·전달). 신호 8가지:

### 1.1 도구 분산은 극단적

`한글`, `메모장`, `Notepad++`, `구글 독스`, `옵시디언`, `Scrivener`, `뮤블`, `노벨라`, `삼성노트`, `카톡 자기 채팅`, `Pencake`, `업노트`, `Gmail Draft`, `문피아 작성창` — 한 thread 안에서 14가지 이상 도구 언급. 한 작가 = 한 도구 정착.

### 1.2 한 번 쓰면 계속 쓴다

> `메모장에 글 쓰면 한글이나 워드처럼 안 뻑나서`
> `뮤블 쓰는데 너무 만족`
> `스크리브너 쓰고 있고 다른 사람들도 써서`

도구 변경 friction = 매우 높음. 새 에디터로 마이그레이션 ask 는 conversion rate 낮음.

### 1.3 데이터 유실 트라우마 반복 출현

> `한컴 독스 4,000자 날아감`
> `자동 저장 켜놨는데 단어 순서가 뒤집혀 저장됨`
> `튕기면 그 회차 다 날아감`

작가의 첫 신뢰 = `안 날림` > `똑똑함`.

### 1.4 1화부터 완결까지 한 파일

> `1화부터 100화까지 한 .txt 안에 다 있음. Ctrl-F 로 찾음`

20만~100만 자 단일 파일. 챕터 split 안 함. 검색 = Ctrl-F 또는 정렬용 별도 엑셀.

### 1.5 설정은 별도 위치 (글과 분리)

> `글은 메모장, 설정은 엑셀`
> `옵시디언 vault 에 설정만 따로`
> `노트북에 손글씨로 적어둠`

작가는 글-설정 분리를 자연스럽다고 느낌. Recall 도구는 글 + 설정 *둘 다* 를 색인해야 함.

### 1.6 까먹은 설정은 Ctrl-F

> `이전 회차에서 이 인물 머리 색 뭐였더라 싶으면 Ctrl-F`

검색은 이미 일상. 더 빠른 검색 + entity-aware recall = 즉시 가치.

### 1.7 옵시디언 + AI plugin 작가의 reverse-engineering

> `검색 쉬움, 설정 위키화 가능, 가장 큰 게 ai 접근 권한 쉬움 (문장 수정, 요약, 의미기반 검색, 설정 위키화, ai랑 브레인 스토밍 가능, 맞춤법 검사, 설정 오류 찾기, 평가 다 가능)`

이 segment 는 Track 2 (Platform) 영역. Track 3 의 Editor lab 은 이 segment 가 Vault + Editor 로 자연 흡수될 가능성도 있다 (옵시디언 plugin 조합 fragility 가 큰 페인).

### 1.8 글 쓴 후 맞춤법 검사

> `글 쓰고 부산대 맞춤법 검사기 돌림`
> `한컴 자동 맞춤법 켜둠`

작성 직후 검사 = 일상 흐름. v1 에서 자체 검사기 X (라이선스 미해결), 외부 검사기 export flow 만 제공.

---

## 2. 포지셔닝

### 2.1 제품 정의 (외부 카피용)

> 시즌 오서 스튜디오 데스크톱은 한국 장편 소설 작가가 이미 쓰고 있는 원고와 설정 파일을 로컬에서 안전하게 남기고, 등장인물·장소·설정·약속·사건을 즉시 다시 찾아주는 도구입니다. AI 가 문장을 대신 쓰지 않고, 작가가 이미 쓴 원고에서 필요한 기억을 꺼내 줍니다.

### 2.2 Wedge

> **쓰던 곳에서 계속 쓰세요. 시즌이 백업하고 기억합니다.** *(Phase 0 launch ramp)*

> **시즌 안에서 다음 회차를 시작하세요. 어제까지 쓴 캐논이 곁에 있습니다.** *(Phase 2 editor 도착 시)*

### 2.3 추천 카피 (Phase 0)

- `쓰던 파일은 그대로. 잊은 설정은 시즌이 찾아드립니다.`
- `AI 가 대신 쓰지 않습니다. 당신의 원고에서 찾아줍니다.`
- `20만 자 원고 속 설정, Ctrl-F 대신 @로 호출하세요.`
- `메모장·한글·구글문서·뮤블·Scrivener 어디서 쓰든 시즌이 백업하고 기억합니다.`
- `원고 변경 이력을 자동으로 남기고, 언제든 이전 버전으로 돌아갑니다.`

### 2.4 추가 카피 (Phase 2 editor 도착 시)

- `백업과 검색이 익숙해졌나요. 다음 회차는 시즌 안에서.`
- `같은 캐논, 더 빠른 흐름. 자체 에디터로 글 쓰기.`

### 2.5 피해야 할 카피

- `한 단어도 잃지 않습니다.` — 절대 보장 표현, legal/평판 리스크
- `작가용 올인원 집필툴` — 뮤블·pensiv·노벨라와 정면 충돌
- `AI 가 함께 씁니다.` — 작가 윤리/문체 우려, Sudowrite 영역
- `Scrivener 대체` — 비교 톤 X, `옆에 붙는 보조` 톤 유지

---

## 3. 경쟁 판단

### 3.1 Pensiv

**Primary source verified 2026-05-06** (pensiv.so homepage fetch):

- Desktop app: ✓ (`Download Desktop`)
- Offline / local-only: ✓ (`Offline and local-only mode when you want drafts and assets to stay on your device without cloud sync`)
- HWP export: ✓ (`Hangul (HWP)` listed alongside Word / PDF / EPUB / Markdown)
- Mobile beta: ✓ (`pensiv mobile beta testing is starting`)
- 1차 언어: 영어 (KR mainstream 작가 직접 마케팅 X)
- 가격 tier: homepage 미노출 (별 fetch 필요)
- 메인 카피: `Where stories take shape. A focused workspace for storytellers where novels, screenplays, and drafts find room to grow.`

따라서 `desktop 있고 HWP 가능` 은 Track 3 우위 X. 직접 비교 우위 narrow:

| 차원 | Pensiv | Track 3 |
|---|---|---|
| Desktop app | ✓ | ✓ (예정) |
| Offline / local-only | ✓ | ✓ |
| HWP export | ✓ | Phase 1.5+ (write 안정), Phase 0 = read import |
| Mobile beta | ✓ | Phase 3 |
| 옆에 붙는 보조 layer (file watcher) | 미확인 (별 fetch) | ✓ (Phase 0 핵심) |
| 옵시디언 / 한글 / 메모장 export 파일 watch | 미확인 | ✓ |
| Memory v3 entity-aware canon recall | 미확인 | ✓ |
| KR mainstream 작가 마케팅 / KRW 가격 | 영어 사이트만 | ✓ (KRW + KR 인터뷰 / 카피) |

차별점 = **pensiv 로 이사하지 않아도 Track 3 를 쓸 수 있어야 한다**. pensiv 사용자도 pensiv export 파일을 Track 3 가 watch + recall.

**Phase -1 인터뷰 보충 질문:**
- Pensiv 의 entity recall / file watcher 기능 유무 작가가 알고 있나?
- Pensiv 사용 작가의 KR 시장 비율 (인터뷰에서 직접)?
- Pensiv export 파일 (markdown? 자체 format?) 을 Track 3 가 watch 가능한가?

### 3.2 TypeTak

`AI 가 글을 함께 씁니다`, 문장 개선, 등장인물 자동 정리, 장면 제안 등 generation 메시지 강함. Track 3 는 반대편.

> `우리는 대신 쓰지 않는다. 이미 쓴 것을 기억한다.`

AI 창작 윤리·문체 훼손 우려 작가에게 안전 포지션.

### 3.3 뮤블 / 노벨라 / Scrivener

- 뮤블: KR 작가 정착 만족 신호 강함. 직접 경쟁 X — Track 3 는 뮤블 export 파일을 watch + recall.
- 노벨라: 모바일 편의 + 검색.
- Scrivener: 매뉴얼 PDF 800+ 페이지. 안정성 신뢰. 복잡도 높음. HWP/Android 흐름 약함.

세 도구 모두 Track 3 의 *대체* 아닌 *옆 보조*.

### 3.4 Novelcrafter / Sudowrite

영문권. Novelcrafter = BYOK + 사용자가 매번 컨텍스트 attach. Sudowrite = AI 가 prose generate.

Track 3 vs:
- Novelcrafter: 우리는 자동 watch + recall (사용자 attach 노력 없음).
- Sudowrite: 우리는 generate 안 함, recall only.

### 3.5 옵시디언 + AI plugin

이 segment 의 작가는 이미 캐논 검색·설정 위키화·AI 호출을 옵시디언 안에서 reverse-engineering.

→ 이 페르소나는 **Track 2 (Platform) 의 MCP server 가 즉시 흡수**. Track 3 는 이 페르소나에 secondary.

---

## 4. User segments (Track 3 priority, global-first lock 2026-05-06)

### 4.1 P1: long-form fiction writers in Scrivener · Ulysses · Bear · Word · Google Docs · Obsidian

Pain:

- Manuscript balloons past 100k words; existing tools slow, search bad
- Lose minutes/hours hunting prior canon (character height, magic system rule, foreshadowed promise)
- Lost-data trauma (Word crash, Docs sync glitch, hard drive die)

Track 3 promise:

- Watches the file you already write in; never asks you to switch
- Auto-snapshots every change, restorable in 10 seconds
- `@name` / `@place` / `@promise` recall across the full manuscript

Recruit channels: r/writing, r/Fantasy_Writers, r/selfpublish, NaNoWriMo forums, Twitter writing community, Indie Author Telegram groups.

### 4.2 P2: indie self-publishers using Vellum · Atticus · Plottr · World Anvil

Pain:

- Worldbuilding lives in one tool, draft in another, formatting in a third — context lost between
- Series canon (book 1 → book 5) drifts without a memory layer

Track 3 promise:

- Watches the manuscript export from Vellum / Atticus; recalls World Anvil entries beside the draft
- Cross-book canon (P1.5+) for series authors

### 4.3 P3: KR mainstream long-form web-novel writers (한국 웹소설 작가, ko locale segment)

Pain:

- 한글/뮤블/메모장/구글독스 정착, 원고가 길수록 검색·백업 약함
- 회차 간 설정 충돌·자동 저장 사고

Track 3 promise:

- 지금 도구 안 바꿈. 옆에서 백업하고 설정을 기억함
- `@이름`, `@장소`, `@떡밥` recall

Recruit channels: 나비계곡, 작가 디스코드, 트위터 KR, Reddit r/koreanwebnovel.

### 4.4 P4: Notepad / VS Code / TextEdit minimalists

Pain:

- Lightweight by choice, but settings management + backup almost zero
- Cross-device fragmentation

Track 3 promise:

- Don't change tool. Just attach watch + recall layer.

### 4.5 P5: publishers / agencies / studios (B2B, all locales)

Pain:

- Galleys / DOCX / spreadsheets / wiki spread thin
- Long-running series canon hard to share with editors / PMs

Track 3 promise:

- Studio Publisher tier: shared canon bible, export/audit history, reviewer seat (cross-track with Track 1 web collaboration)

### 4.6 Explicit non-targets

- AI-skeptic writers (entire Seizn product non-target)
- Writers who want AI to draft prose for them (Sudowrite territory)
- Short-form writers (recall value low under ~30k words)
- Obsidian + AI plugin writers → Track 2 territory (Track 3 secondary)

---

## 5. Stack 결정 (lock 후보)

### 5.1 Desktop shell — Tauri 2.x

| 후보 | 결정 | 이유 |
|---|---|---|
| **Tauri 2.x** | ✓ pick | Rust + Webview = 메모리 ~80MB, binary ~20MB, mobile (iOS/Android) 통합 (Phase 3), auto-update 안정, Notepad-light footprint |
| Electron | ✗ | 메모리 ~300MB+, binary ~150MB+, Notepad-light 와 모순 |
| Native (Swift/C# WPF) | ✗ | 플랫폼별 별 코드, 1인 / 소수 개발 비현실 |
| Web only (PWA) | ✗ | file watcher / 전역 단축키 / offline-first 안 됨 |

**Tauri 2.x lock 사유:** mobile 통합 (Phase 3) 까지 single shell 로 가능, Rust 의 file watcher (notify crate) + IPC 안정성, npm 생태계 (TipTap/Yjs) 그대로 사용 가능.

### 5.2 Editor — TipTap 3 (Phase 2, lock 2026-05-06)

| 후보 | 결정 | 이유 |
|---|---|---|
| **TipTap 3 + `@tiptap/y-tiptap`** | ✓ pick (lock 2026-05-06) | TipTap 3 stable (decorations API · Floating UI · TableKit · `@tiptap/y-tiptap` 공식 Yjs 바인딩). editorkit-pro fork base 가 v3 정합 시 그대로, v2 면 fork-and-pin v2. Yjs 통합 native |
| TipTap 2 | conditional | editorkit-pro 가 v2 잠긴 경우만. 새 코드는 v3 권장 |
| Lexical (Meta) | ✗ | IME 미성숙 (KO/JA/ZH composition 버그 잔존), Yjs 통합 plugin 부재 |
| Slate | ✗ | maintenance 약화, IME 직접 구현 부담 |
| TinyMCE / Quill | ✗ | long-form / chapter marker / chunk-based 색인에 약함 |

**Korean IME 위험 (lock 2026-05-06):** TipTap 자체는 안정적이나 ProseMirror 레이어에 한국어 IME 버그 잔존 (y-prosemirror issues #186/#188 2025-05+, ProseMirror issue #1484 — Korean Enter-key character loss). 근본 원인 = ProseMirror 의 aggressive DOM management during composition + Chrome IME brittleness. **Phase 2 dispatch 전 KO dogfood 필수 + `handleDOMEvents.beforeinput` workaround 예산 (~3 일)**. ko-locale 작가 alpha 회귀 셋 (자모 조합 깨짐, 일본어 변환 중 Enter, 拼音 후 backspace) ≥30 cases 필요.

### 5.3 CRDT — Yjs (lock 2026-05-06: yjs ^13 · y-prosemirror ^1.2)

| 후보 | 결정 | 이유 |
|---|---|---|
| **Yjs ^13 + y-prosemirror ^1.2 + @tiptap/y-tiptap** | ✓ pick | sequential text insert 빠름, y-prosemirror / y-leveldb / y-indexeddb / y-websocket 생태계 성숙 |
| Automerge | ✗ | sequential text insert 느림, fiction 장문 워크로드에 약함 |

### 5.4 Local persistence (lock 2026-05-06: SQLite-backed Yjs adapter, y-leveldb fallback)

- **Primary: SQLite-backed Yjs persistence** — Phase 0.5 의 snapshot SQLite 인프라 재사용. 새 `yjs_documents` table (project_id, doc_state BLOB, updated_at). `Y.encodeStateAsUpdate` / `Y.applyUpdate` 으로 binary 저장. **이유:** y-leveldb 의 native bindings 가 Windows + Tauri 에서 fragile, 단일 SQLite root = backup 단순화 + uninstall 시 orphan data X
- **Fallback: y-leveldb** — Phase 2 spike 후 SQLite adapter 가 perf 미달 (10k char doc apply >100ms 등) 시 도입 검토. Phase 2 시작 전 1-day spike: `leveldb-rs` on Win11 + Tauri 빌드/load test
- **append-only snapshot log** — 별 SQLite table 에 timestamped snapshot. Yjs 의 internal history 와 별개로 사용자-인지 가능한 `오늘/어제/지난주 버전` 표시
- **file watcher** — Rust `notify` crate, 변경 감지 → debounce 500ms → snapshot append + Memory v3 index refresh
- **zip export** — 프로젝트 단위, 무결성 verify (SHA-256)
- **Storage root (lock 2026-05-06):** `<app_data_dir>/projects/<project_id>/snapshots.db` (Phase 0.5 시작점). entities + entities_vec + conflicts + yjs_documents + settings 모두 같은 DB. keyring 은 OS 별 (Windows Credential Manager / macOS Keychain / Linux Secret Service) — 단일 store 로 묶을 수 없으니 unique 패턴 OK. **uninstall 가이드** = `app_data_dir` 통째 삭제 + OS keyring 의 `seizn-desktop` 서비스 항목 삭제 (사용자 안내 필요)

### 5.5 HWP 라이브러리 (lock 2026-05-06, audit 결과 반영)

| 후보 | 라이선스 | 활성 (2026-05) | 용도 | 결정 |
|---|---|---|---|---|
| **`rhwp`** (Rust + WASM, edwardkim) | MIT | ✓ active (2026-05 commits) | read+editor | **Phase 0.11 1순위** (Rust native, Tauri 통합 단순) |
| **`openhwp`** (Rust crates `hwp` + `hwpx`, IR) | MIT | ✓ active (2025-12+) | read + HWPX write | Phase 0.11 fallback + Phase 1.5+ HWPX write 후보 |
| **`@ohah/hwpjs`** (Rust core + JS/WASM/RN) | MIT | ✓ active (npm 2025-12) | read | JS 통합 필요 시 보조 (현 Tauri Rust side 우선이라 후순위) |
| ~~`hwp.js`~~ (hahnlee) | MIT | ✗ stale (2022 last commit) | read | **drop** |
| ~~`hwp-rs`~~ (hahnlee) | MIT | ✗ stale (2022) | read | **drop** |
| `node-hwp` | MIT | unverified | read/write | Phase 3 검토 (단 Phase 3 시점 status 재확인 필요) |

**Phase 0.11 entry decision (lock):** `rhwp` 1순위. 1-day spike 에서 sample HWP read 통과 시 lock; 실패 시 `openhwp` 으로 fallback. Phase 1.5+ HWPX write = `openhwp` 의 hwpx crate (write coverage 있음).

**Phase 3 HWP write stable:** **production-ready Rust crate 없음** (audit 2026-05 결과). 옵션:
1. `openhwp` 의 hwpx write 능력 확장 (PR contribution + 우리 spike 2주)
2. Hancom 직접 partnership (commercial library license)
3. HWP write 포기, HWPX 만 (Hancom Office 2018+ 호환)

**권장 = (3)**. HWP (binary, 구식) write 보다 HWPX (XML, 표준) write 가 작가에게 충분 + 우리 부담 ↓. 사용자 인터뷰에서 `HWP 만 받는 출판사` 비율 ≥30% 면 (1) 또는 (2) 진입.

Phase 0 = read-only import 만. Phase 1.5 또는 Phase 3 = stable HWPX export.

### 5.6 자체 backend — local embedding + LLM BYOK (lock 2026-05-06, revised)

**Track 2 endpoint 의존 무효** (master § 4.1 / § 5.3 / § 5.4 / § 8.1). Track 3 desktop 은 자체 backend 갖는다. fire-and-forget 모드 (master § 4.5) 정합.

**Hybrid AI 전략 (revised 2026-05-06):**

- **Embedding (recall vector search) = local default** (`fastembed-rs` + BGE-m3 multilingual, ~500MB model, CPU 가능, 한국어 OK). **사용자 BYOK 0, Free tier 도 recall 작동.** Cloud embedding (Voyage AI / OpenAI) = optional alternative for users who want higher quality.
- **LLM (entity 추출 / canon conflict 감지) = BYOK** Anthropic SDK 호출 (Haiku default / Sonnet opt-in). **AI 제안 entity 는 작가 승인 후 canonical** (hallucination 차단 gate).
- **Phase 1.X (signal 기반):** Free tier 사용자 다수가 LLM BYOK 진입장벽 호소 시 Ollama integration 추가 (`http://localhost:11434` 자동 감지, `cloud BYOK / local Ollama / skip` 3 선택 wizard).
- **Phase 2+ (검토):** in-process llama.cpp (`llama-cpp-rs`) — Ollama install 부담 X, 단 build/binary size complexity ↑. Phase 1 Ollama 신호 강할 때만 진입.

**Stack:**

```text
seizn-desktop/src-tauri/
├── memory/
│   ├── extract.rs      ← LLM entity 추출 (BYOK Anthropic Haiku/Sonnet)
│   ├── store.rs        ← rusqlite + sqlite-vec (vector search)
│   ├── recall.rs       ← @ 검색 → entity card 생성 (embedding-first; LLM 보강 = BYOK 시만)
│   ├── conflict.rs     ← canon 충돌 감지 (rule + LLM compare, BYOK 시만)
│   └── approve.rs      ← entity 승인 / 수정 / 삭제 (no LLM, 로컬만)
└── llm/
    ├── anthropic.rs    ← BYOK Haiku/Sonnet 호출 (reqwest)
    ├── embedding.rs    ← fastembed-rs default (local BGE-m3) + cloud alt (Voyage / OpenAI BYOK)
    └── keyring.rs      ← Tauri keyring 으로 사용자 API key 보관 (Anthropic 필수 시만, embedding cloud 선택 시 추가)
```

**의존 변환:**

| 항목 | 그 전 (Track 2) | 자체 backend (revised) |
|---|---|---|
| Embedding (recall) | Voyage/OpenAI cloud | **fastembed-rs local default**, cloud BYOK alt |
| Entity 추출 | `/manuscript/index` POST | Tauri command + BYOK Anthropic Haiku |
| Recall 검색 | `/recall?q=` GET | 로컬 SQLite vector search (embedding 무료) |
| Entity 승인 | `/canon/.../approve` POST | local SQLite write |
| Conflict 감지 | `/conflicts` GET | 로컬 rule + LLM compare (BYOK 시만) |
| LLM 비용 | Track 2 managed | 사용자 BYOK (Studio Managed Phase 3+ 옵션) |
| Embedding 비용 | Track 2 managed | 0 (local) |
| Offline | 부분 (cache) | embedding/recall 완전 offline · LLM call 시만 인터넷 |
| Privacy | 작가 원고가 우리 server 통과 | embedding/recall 100% local · LLM (BYOK) 만 cloud (Anthropic) 통과 |
| BYOK friction (Free tier) | N/A | recall = 0 (local embedding), entity 추출 = Anthropic key 필요 시만 |

**Free tier UX (lock):** import + watcher + snapshot + **recall (semantic search)** 모두 BYOK 0 작동. Anthropic key 입력 = entity 추출 / conflict 감지 활성화 (옵션). 마케팅 카피: `Recall works out of the box. Bring your own key only when you want AI-extracted entities.`

**Cloud embedding alternative — OpenAI dropped (lock 2026-05-06):**

OpenAI text-embedding-3-small = **drop**. 사유: OpenAI 의 free/Tier 1 API 는 학습 opt-out 이 default 가 아니라 **opt-in 필요** (사용자가 모르고 사용 시 자기 manuscript 가 OpenAI training set 에 들어갈 risk). Track 3 의 `no AI training on user content` 약속 (§ 8.1) 과 모순. **권장 cloud embedding alt = Voyage AI 만** (paid, no-train default per Voyage commercial terms — Phase 0.7.5 wizard 에서 Voyage 선택 시 paid org key 안내). OpenAI 옵션 부활 = 사용자가 명시적으로 `opt-out 등록 완료` toggle 체크 시만 (Phase 1.X).

**Anthropic API privacy (verified 2026-05-06 from `privacy.claude.com`):**

- API inputs/outputs default retention = **30 days** (auto-delete on backend). [policy date 2026-03-16]
- Zero Data Retention = enterprise contract negotiation 가능 (User Safety classifier 결과만 보존)
- Usage Policy violation 시 inputs/outputs 최대 2년, classification 최대 7년
- 학습 정책 = 별 `Commercial Terms` 문서. **마케팅 copy 발행 전 docs.anthropic.com 에서 commercial training opt-out default 재확인 필수** (글로벌 CLAUDE.md §12 fact verification, anthropic 정책 자주 revise)

→ 사용자에게 `BYOK Anthropic key 사용 시 30일 retention, 학습 X (commercial terms 정합)` 안내. Marketing copy 의 정확한 wording 은 Phase 0.15 alpha invite 시 lock 전 재확인 cycle.

**Phase 3 cross-device sync 시:**

Track 2 의 entity schema 와 long-term 정합. schema migration 필요 시 master 통해 cross-track 협의 (fire-and-forget § 4.5 예외 — schema 는 cross-track 결정).

### 5.7 의존 라이브러리 (lock 2026-05-06)

```toml
[dependencies]
# Tauri shell
tauri = { version = "2", features = ["protocol-asset"] }
tauri-plugin-fs = "2"
tauri-plugin-dialog = "2"
tauri-plugin-global-shortcut = "2"

# File watcher
notify = "6"

# Local persistence
rusqlite = { version = "0.31", features = ["bundled"] }
sqlite-vec = "0.1"  # 또는 sqlite-vss. Phase 0.6.5 에서 lock
zstd = "0.13"
sha2 = "0.10"

# Local embedding (default, Free tier OK without BYOK)
fastembed = "5"  # BGE-m3 multilingual, ~500MB model auto-download on first run
ort = { version = "2", optional = true }  # ONNX runtime backend for fastembed

# LLM client (BYOK Anthropic) + optional cloud embedding alt (Voyage / OpenAI)
reqwest = { version = "0.12", features = ["json", "rustls-tls", "stream"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
keyring = "3"  # OS keyring for BYOK API keys

# Encoding
encoding_rs = "0.8"  # EUC-KR fallback

# Async
tokio = { version = "1", features = ["full"] }

# Korean
unicode-normalization = "0.1"
```

### 5.8 Korean spellcheck

v1 = 외부 검사기 export flow 만 (라이선스 미해결). 사용자가 직접 부산대/한컴 검사기로 paste 가능한 export.

라이선스 확보 시 Phase 1.5+ 자체 통합.

---

## 6. MVP — Phase 0 Recall Vault desktop alpha

### 6.1 목표

작가가 지금 쓰는 방식을 유지한 채, Track 3 desktop 이 원고를 백업하고 설정을 기억한다. 자체 에디터 X.

### 6.2 필수 기능 (8개)

1. **원고 가져오기**
   - `.txt`, `.md`, `.docx` 우선
   - `.hwp/.hwpx` read-only import (experimental flag)
   - Google Docs = export/import flow

2. **파일 감시 모드**
   - 사용자가 Word·메모장·VS Code·Scrivener·Vellum·Atticus export 파일에서 계속 쓰면 desktop 이 지정 파일 watch
   - 변경 감지 → debounce 500ms → snapshot 생성 + 자체 backend (sqlite-vec) index refresh (lock 2026-05-06: Track 2 API 호출 X, master § 5.6)

3. **로컬 우선 snapshot vault**
   - append-only snapshot log (SQLite primary, y-leveldb fallback Phase 2 spike 후)
   - `오늘 / 어제 / 지난주 / 지난달` 버전 보기
   - diff 후 복원
   - 삭제 시 tombstone 유지

4. **원고 + 설정 파일 동시 색인**
   - 원고뿐 아니라 엑셀/CSV/메모/설정 문서도 project context
   - `글은 텍스트 + 설정은 엑셀` 흐름 cover

5. **@ Recall 검색 (전역 단축키)**
   - 시스템 전역 단축키 (`Ctrl+Shift+Space` 또는 사용자 지정)
   - 인물/장소/물건/설정/약속/사건/떡밥 검색
   - 결과: `첫 등장`, `마지막 언급`, `현재 canon`, `관련 충돌 후보` 카드

6. **설정 카드 승인/수정**
   - Memory v3 추출 entity = `AI 제안` 라벨
   - canonical truth 는 작가 승인 후 확정
   - hallucination 의 canon 승격 차단

7. **원클릭 백업/export**
   - 프로젝트 zip export (SHA-256 verify)
   - txt/md/docx export
   - export paywall 금지

8. **검증 지표 수집 (analytics)**
   - import → 첫 useful recall 까지 걸린 시간
   - 저장된 entity card 수
   - snapshot 복원 성공률
   - WTP 응답
   - retention (D1/D7/D14/D30)

### 6.3 비필수 기능 (Phase 0 제외)

- 자체 에디터 (Phase 2)
- 웹 편집 (Track 1 영역)
- CLI (Phase 3+, 신호 driven)
- 실시간 CRDT 협업 (Phase 2 와 함께)
- 모바일 (Phase 3)
- 풀 conflict detection (Phase 1+)
- 자동 맞춤법 검사 (라이선스 후)
- HWP write 안정 export (Phase 1.5 또는 Phase 3)

---

## 7. HWP 전략

HWP 는 KR 작가 포지셔닝에서 중요. 단 불안정한 write 로 v1 신뢰 망치면 안 됨.

순서:

1. **Phase 0:** HWP/HWPX read-only import (`rhwp` 또는 `@ohah/hwpjs`)
2. **Phase 0:** Hancom-friendly DOCX export preset (한컴오피스에서 열어서 흐름 끊김 최소화)
3. **Phase 1:** HWPX export experimental flag (작가 옵트인)
4. **Phase 1.5 또는 Phase 3:** HWP/HWPX stable export

**Phase -1 인터뷰 필수 질문:**
- HWP export 가 v1 에 없으면 사용 보류?
- 결제 보류?
- DOCX 를 한컴에서 여는 흐름이 충분?

`HWP 없으면 결제 안 함` 비율 ≥ 40% → Phase 1.5 로 당김.

---

## 8. 데이터 안전 전략

내부 목표 = `zero data loss`. 외부 카피 = 절대 표현 금지.

### 8.1 원칙

- local-first
- append-only snapshot
- user-export 항상 가능
- export paywall 금지
- cancel 후 read-only lock-in 금지
- 삭제 시 tombstone 유지
- cloud backup = opt-in
- AI 학습에 사용자 콘텐츠 사용 X (privacy)

### 8.2 필수 테스트 (Phase 0 release gate)

- 편집 중 앱 강제 종료 후 복구 (kill -9, OS shutdown)
- 감시 중 파일 변경 감지 누락 여부 (rapid edit)
- snapshot diff/restore 성공률 (100% target)
- 디스크 용량 부족 시 경고 + 안전 중단
- corrupt local state 감지 후 복구 경로
- zip export 무결성 verify (SHA-256)
- file watcher 장기 실행 (24h+) memory leak 없음

### 8.3 데모 우선순위

첫 데모 = `AI 가 설정 찾아줌` 보다 먼저:

> 원고가 날아간 순간, 이전 버전으로 돌아가는 10초 데모.

작가의 첫 신뢰 = 똑똑함보다 `안 날림`.

---

## 9. Memory v3 / Recall 품질

### 9.1 Recall 의 역할

작가 대신 쓰는 기능 X. 작가가 이미 쓴 원고에서 필요한 기억을 찾는 기능.

### 9.2 Recall card 구성

- canonical name
- entity type (인물/장소/물건/설정/약속/사건/떡밥)
- first mention (회차 + 위치)
- last 3 mentions
- current state
- related promises/events/items
- pending conflict candidates
- source snippet (원문 quote)
- confidence
- `작가 승인됨` / `AI 제안` 상태

### 9.3 품질 기준 (Phase 0 release gate)

- 첫 useful recall 까지 ≤ 10분
- recall usefulness ≥ 80% (작가 self-report)
- critical hallucination 0건 (gate, hard fail)
- AI 제안의 canon 자동 승격 X

### 9.4 Cross-track 의존

Track 3 desktop 은 Track 2 의 `/api/v1/*` REST 호출. Memory v3 자체 변경은 Track 2 영역. Track 3 는 client-side 캐싱 (offline) + UI 만.

---

## 10. UI 방향

### 10.1 톤 — warm paper

- 1차 dashboard cycle 의 `.dashboard-redesign` warm paper-tone palette 재사용
- terracotta + cream + ink black + soft pulp grain
- Newsreader serif var (장문 원고 표시)
- engine.seizn.com 의 cosmic dark / violet / cyan / JetBrains Mono **금지**

### 10.2 애니메이션 자산 reuse

`D:\AI-Apps\_extracted\` 의 9개 MUST 파일 (cubic-bezier 곡선 + spring physics):

- `01-easing.css` — Vercel/Stripe 표준 ease-out
- `02-spring.css` — Toss-tier spring 물리
- `03-page-transitions.tsx` — Notion 스타일 fade
- `04-modal-enter.tsx` — bottom sheet
- `05-skeleton-pulse.css` — 로딩 pulse
- `06-number-lerp.tsx` — 카운터 lerp
- `07-swipe-dismiss.tsx` — 모바일 dismiss
- `08-list-stagger.tsx` — list item stagger
- `09-success-confetti.tsx` — 미니 success feedback

### 10.3 Architectural reference

- Linear (`D:\AI-Apps\_extracted\Linear`) — 키보드 shortcut UX
- Notion (`D:\AI-Apps\_extracted\Notion`) — block-based 흐름 (editor Phase 2)
- Paper (`D:\AI-Apps\_extracted\Paper`) — paper texture 처리
- Slack (`D:\AI-Apps\_extracted\Slack`) — sidebar nav

---

## 11. UX 방향 — Toss-tier

### 11.1 원칙

- **친밀함 > 화려함.** 한국어 마이크로카피, 작가 이름 호명, 작은 우호 동작 (예: snapshot 복구 시 `복구 완료. 4,302자 다시 곁에 있어요.`)
- **Bottom sheet over modal.** 모바일 친화 (Phase 3 lead-in), spring 물리
- **Number lerp.** 자릿수 변경은 lerp 으로 부드럽게 (글자 수, 백업 횟수, retention 일수)
- **Swipe-dismiss.** 카드형 entity / snapshot 리스트
- **Pulse on freshness.** 방금 변경된 entity 는 부드러운 pulse 1회

### 11.2 Asset reuse map

| 자산 | 위치 | 용도 |
|---|---|---|
| `editorkit-pro` 의 TipTap scaffold | `C:\Users\admin\Projects\editorkit-pro` | Phase 2 editor base (직접 재사용, fork) |
| `editorkit-pro` 의 25 extension | 같음 | Phase 2 editor 확장 (chapter marker, mention, table 등) |
| `editorkit-pro` 의 Yjs + Hocuspocus 통합 | 같음 | Phase 2 collab base |
| `editorkit-pro` 의 DOCX/PDF export | 같음 | Phase 0 export 재사용 |
| `editorkit-pro` 의 Toss Payments adapter | 같음 | Phase 1 KRW 결제 (Track 1 과 단일 customer 공유) |
| `ara.studio` OKLCH palette | `C:\Users\admin\Projects\ara.studio` | warm paper palette 보강 |
| `ara.studio` paper grain SVG | 같음 | background texture |
| `notrivo` chunk IDs | `C:\Users\admin\Projects\notrivo` | 장문 원고 chunk-based 색인 |
| `notrivo` offline persistence | 같음 | y-leveldb 와 합칠지 검토 |
| `D:\AI-Apps\_extracted\01..09` | 같음 | 9 MUST 애니메이션 |

### 11.3 한국어 마이크로카피 원칙 (CLAUDE.md §11.2 ko 가이드 참조)

- 큰따옴표 (`""`) 금지 → 작은따옴표 (`''`)
- AI-generated 패턴 회피 (`완전한`, `최첨단의`, `혁신적인` 등)
- 작가 호명: `작가님`, `오늘도 4,302자`
- 작성 전 `ai-writing-patterns-guide-ko.md` self-check 필수

---

## 12. 30일 / 90일 plan

### 12.1 30일 (Phase 0 alpha)

**Week 1:**
- `seizn-desktop/` repo scaffold (Tauri 2.x init)
- Tauri shell 기본 (window + menu + tray)
- file watcher prototype (`notify` crate, 단일 파일 단일 폴더)
- 첫 manuscript import (txt)
- Track 2 API client stub (`/api/v1/recall` 호출 테스트)

**Week 2:**
- y-leveldb / SQLite append-only snapshot store
- snapshot UI (`오늘/어제/지난주`)
- diff/restore 흐름
- zip export (SHA-256 verify)
- docx 추가 import

**Week 3:**
- 전역 단축키 recall (Tauri global shortcut API)
- recall card UI (entity 카드 8요소)
- entity 승인/수정/삭제 흐름
- closed alpha 작가 3명 invite (Track 1 Phase -1 retain 작가 중)

**Week 4:**
- analytics 이벤트 (activation/retention/recall usefulness/restore success)
- 데이터 안전 테스트 suite (kill -9, rapid edit, corrupt state)
- HWP/HWPX read-only import (experimental flag)
- DOCX export Hancom-friendly preset

**Phase 0 release gate (30일 끝):**
- 3명 작가가 기존 편집기 유지한 채 1주 이상 사용
- 데이터 유실 0건
- snapshot 복원 성공률 100%
- recall usefulness ≥ 80%
- critical hallucination 0건

### 12.2 60일 (Phase 1 closed beta)

- snapshot diff/restore 안정화
- entity card 승인 UI 개선 (bulk approve, undo)
- cloud backup opt-in (S3 또는 Supabase Storage, KMS 암호화)
- founding writer 10명 invite
- 가격 실험 (Pro ₩12,900 vs ₩9,900 vs ₩14,900 split test)
- HWPX export experimental flag
- conflict detection toggle (Phase 1.5 lead-in)

**Phase 1 release gate (60일 끝):**
- 10명 중 5명 이상 2주차 retain
- 3명 이상 결제 또는 선결제
- HWP blocker 비율 측정
- 자체 에디터 요구가 실제 결제 blocker 인지 측정

### 12.3 90일 (Phase 2 editor 진입)

- editorkit-pro fork → Tauri shell 통합
- TipTap + Yjs 단일 파일 에디터
- chapter marker 자동 감지 (`# 1화` 등)
- Sidebar (chapter list + entity list)
- on-demand recall panel (작성 중 `@` 로 호출)
- local-first save indicator
- optional cloud sync

**Phase 2 release gate (90일 끝):**
- 기존 Vault 사용자 중 ≥ 30% 가 자체 에디터 선택
- editor retention > watcher retention
- local save indicator + restore 테스트 통과
- IME composition 안전성 (KO/JA/ZH 입력 회귀 테스트)

---

## 13. Phase Gate (cumulative)

### Phase -1 (Track 1 영역)

Track 1 의 Phase -1 dashboard prototype. Track 3 진입 *전제*.

Gate (Track 1 doc 에서 lock):
- 5명 중 3명 이상 `다음 원고에도 쓰겠다`
- 2명 이상 월 ₩9,900 이상 WTP
- 첫 useful recall ≤ 10분
- critical hallucination 0건

미달 시 Track 3 Phase 0 보류, Track 1 Phase -1 iterate.

### Phase 0 (Track 3, 30일)

위 §12.1 gate 그대로.

### Phase 1 (Track 3, 60일)

위 §12.2 gate 그대로.

### Phase 2 (Track 3, 90일)

위 §12.3 gate 그대로. **Committed milestone, not conditional.** (Vault 만 launch 하고 끝 X)

### Phase 3 (Track 3, 180일+)

- HWP/HWPX stable export
- 모바일 (iOS/Android) Tauri mobile
- cross-device sync
- web parity (Track 1 web read/edit)
- Studio Publisher tier (B2B, shared canon bible, reviewer seat)

---

## 14. Pricing (USD, Track 3, global-first lock 2026-05-06)

> **Per-track pricing separation** (master § 5.0). A Track 3 plan does NOT cover Track 1 (Web) or Track 2 (API/MCP) surfaces. To use those surfaces a writer pays for those tracks separately.

| Plan | / month | / year (17% off) | Includes |
|---|---|---|---|
| **Free** | $0 | — | 1 active project, local snapshot, txt/md/docx export, **local semantic recall (no BYOK needed — embedding runs on-device)**, full data export always. AI-extracted entities = BYOK Anthropic key required (optional). |
| **Pro** | $9.90 | $99 | unlimited projects, cloud backup/sync, recall fair-use unlimited, 1 year version history, conflict candidate review, priority indexing |
| **Pro Plus** | $19.90 | $199 | very long manuscripts (>500k chars), HWP/HWPX export when stable, cross-series canon recall, advanced audit/timeline |
| **Studio Publisher** | $79+ | custom | editor/reviewer seats (desktop only), private workspace, shared canon bible, export/audit history, onboarding support |

KRW shown via Stripe automatic FX. No PPP tier (review at Phase 1 if cohort data shows demand).

> **Studio Publisher web-collaboration surface** = Track 1 Studio plan, billed separately. Track 2 API integration = Track 2 plan, billed separately. Track 3 Studio Publisher covers desktop channel only.

Pricing principles:

- No export paywall
- No read-only lock-in after cancel
- No usage-based billing on AI generation (recall · backup · project value-based)
- No `AI prose generation` paid feature placement
- 1 Stripe customer / 1 Track 3 subscription. Other track plans = separate subscriptions on the same customer. Invoices separated.

**v0 → v1 (KRW deprecated 2026-05-06):** previous KRW lock (Pro ₩12,900 / Pro Plus ₩24,900 / Studio Publisher ₩99,000+) deprecated for global-first conversion. KR locale users see KRW via Stripe FX, not a separate price tier.

---

## 15. 인터뷰 질문 (founding writer, Phase -1 ~ Phase 0)

1. 지금 원고는 어디에서 쓰는가?
2. 설정은 어디에 정리하는가?
3. 최근 3개월 안에 원고 유실, 저장 실패, 동기화 오류를 겪었는가?
4. 예전 회차의 설정을 찾느라 시간을 쓴 최근 사례가 있는가?
5. 새 에디터로 옮기는 것과 기존 파일 옆에 recall/backup 앱을 붙이는 것 중 어느 쪽이 편한가?
6. HWP export 가 v1 에 없으면 사용 보류?
7. HWP export 가 v1 에 없으면 결제 보류?
8. 월 ₩9,900 / ₩12,900 / ₩19,900 중 어디까지 지불 가능?
9. `AI 가 대신 쓰지 않고, 이미 쓴 원고에서 찾아준다` 설명이 안심되는가?
10. 이 도구를 매일 켜둘 이유가 있는가?
11. (Phase 0 후) 자체 에디터가 같은 앱 안에 있다면 글 쓰는 자리를 옮길 의향이 있는가?
12. 모바일 (iOS/Android) 에서 read 만 가능해도 도움이 되는가? read+write 까지 필요한가?

---

## 16. Cross-track 의존 / 협업 (lock 2026-05-06: 자체 backend 모드)

Track 3 fire-and-forget 모드 (master § 4.5) + 자체 backend (§ 5.6) 채택. cross-track 의존 거의 0.

### 16.1 Track 3 가 Track 2 에 요청하는 것

~~Phase 0~Phase 2 모두 X.~~ Track 2 endpoint 호출 0. 자체 backend 가 동일 logic 처리 (Anthropic SDK BYOK + sqlite-vec).

**Phase 3 (cross-device sync) 시 한정:**
- Track 2 의 entity schema 와 long-term 정합 (schema migration 협의)
- Track 2 의 cloud sync endpoint (Phase 3 신설 시) 사용 가능 — 또는 Track 3 자체 cloud (Supabase Storage + KMS) 사용

### 16.2 Track 3 가 Track 1 에 요청하는 것

~~Track 1 Phase -1 founding writer cohort transfer.~~ **CLOSED 2026-05-06.** Track 3 self-dogfood + 별 channel 모집 (나비계곡 / 작가 디스코드 / 트위터 cold DM).

**Phase 3 한정:**
- Track 1 `/dashboard/author` 의 web read 표면 — Phase 3 web parity 의 base
- Track 1 의 결제 dashboard (Track 1 owner session 결정 후) — Track 3 Pro 구독 결제 표면

### 16.3 Track 3 가 다른 트랙에 절대 안 하는 것

- `seizn/` repo 의 어떤 파일도 직접 수정 X
- Track 1 의 dashboard 표면 변경 X
- Track 2 API endpoint 변경 X
- engine.seizn.com (NPC SDK) 영역 touch X
- master.md 의 다른 트랙 영역 (§ 2 Track 1/2 셀, § 4.1 Track 1/2 row) 만지지 X (master § 4.5 fire-and-forget 정합)

---

## 17. Anti-goals (Track 3)

- `seizn/src/components/landing/*` 변경 X (Author flagship landing)
- `seizn/src/lib/author/ui/{service,store,supabase-store}.ts` 직접 수정 X
- `seizn/supabase/migrations/` 변경 X
- `seizn/src/app/engine/` 변경 X (NPC SDK)
- `seizn/src/app/(auth)/`, `seizn/src/app/api/auth/*` 변경 X
- Electron 도입 X (Tauri lock)
- 모바일 only 출시 X (desktop first, mobile Phase 3)
- AI prose generation 기능 X (시즌 전체 정책)
- 부산대 맞춤법 검사기 상업 사용 X (라이선스 미해결)
- 'Not one word will be lost' / `한 단어도 잃지 않습니다` 등 absolute guarantee 표현 X (legal/평판 리스크, 모든 locale)
- 큰따옴표 (`""`) 사용 X (**ko locale only** — EN/JA/ZH/ES locale 은 standard typography 적용)
- KNOT/청학여/char.sori/knot.short1 sample X (Saebyeok IP 만)
- Marketing or UI copy that hard-codes a single locale's tools (e.g., '한컴 전용', 'Mubble export 우선') outside its locale segment — keep tool callouts locale-scoped
- **함초롬바탕 폰트 binary embed 금지** (Hancom 독점 폰트 — license 위반). DOCX export 시 style name 만 declare, Hancom Office 가 호스트 머신에서 substitute. Fallback chain: 함초롬바탕 → 바탕 → 맑은 고딕
- **OpenAI cloud embedding 기본 활성화 X** (free/Tier 1 의 학습 opt-in default 정책 → §5.6 정합, Voyage 만 cloud alt). 사용자가 OpenAI opt-out toggle 명시 체크 시만 (Phase 1.X)
- **Stronghold plugin 도입 X** (Tauri 측 v3 에서 removal 예정 lock 2026-05-06; `keyring 3` crate 사용 — 이미 §5.7 lock)
- **Anthropic 외 LLM provider production 추가 X (Phase 0)** — Phase 0 LLM = Anthropic Haiku BYOK 단일. Phase 1.X 의 Ollama integration + GPT-5-mini / Gemini Flash 옵션 추가 = signal 기반 (§5.6 hybrid AI 전략 정합)

---

## 18. Build agent handoff (영어, agent-to-agent per CLAUDE.md §7)

```text
You are implementing Seizn Author Studio Track 3 (this doc).
Do NOT touch Track 1 (Web) or Track 2 (Platform) source. Backend access
is via Track 2 REST API only.

Goal:
Build a Tauri 2.x desktop alpha (Recall Vault) for Korean long-form
fiction writers in seizn-desktop/. Phase 0 scope is recall + snapshot +
file watcher + zip export. The built-in editor is committed for Phase 2
(~90 days) but is out of Phase 0 scope.

Primary user problem:
Writers already have long manuscripts in HWP, Word, txt, md, Notepad++,
Obsidian, Scrivener exports, Mubble/Novela exports, Google Docs exports,
or setting spreadsheets. They lose time searching their own canon and
fear losing manuscript data. The product must preserve their current
workflow, snapshot files locally, and provide fast Memory v3 recall via
Track 2 API.

Repo:
C:\Users\admin\Projects\seizn-desktop\ (NEW; scaffold step is Step 3 of
master cycle plan)

Stack (locked, do not deviate without master doc update):
- Tauri 2.x + Rust + React (TypeScript)
- TipTap + Yjs (Phase 2 only; not Phase 0)
- y-leveldb (local persistence)
- notify (file watcher)
- Track 2 REST API client (no direct Memory v3 access)

Phase 0 scope (8 features):
1. Manuscript import (.txt, .md, .docx; .hwp/.hwpx read-only behind flag)
2. File watcher (notify crate, debounce 500ms)
3. Local append-only snapshot vault (today/yesterday/last week views,
   diff, restore, tombstone on delete)
4. Setting file index (.csv, .xlsx, .md, .txt project context)
5. @ Recall via global shortcut (Tauri global shortcut API)
6. Entity card approve/edit/delete UI
7. One-click backup/export (zip with SHA-256 verify, txt/md/docx export,
   no paywall)
8. Analytics events (activation/retention/recall usefulness/restore success)

Out of Phase 0:
- Built-in editor (Phase 2)
- Web write surface (Track 1)
- CLI (Phase 3+)
- Real-time CRDT sync (Phase 2)
- Mobile (Phase 3)
- AI prose generation (forever)
- HWP write export stable (Phase 1.5 or Phase 3)
- Korean spellcheck (license-blocked)

Non-negotiables:
- Never block data export
- Never train on user content
- All AI-derived canon stays as suggestion until user-approved
- Local snapshots inspectable + exportable
- Data-loss tests must pass before any beta release
- External copy must avoid absolute guarantees ('not one word is lost'
  etc.); product tests may still target zero data loss internally
- Korean public copy: single quotes only, never double quotes
- Git account: litheonhq <litheonhq@gmail.com> (CLAUDE.md §9)

Reference docs (read-only):
- Master: docs/architecture/seizn-author-master-2026-05-05.md
- Track 2 API spec: docs/architecture/seizn-author-track-2-platform-2026-05-05.md
- Memory v3 internals: docs/architecture/seizn-author-memory-v3.md
- Existing Author UI service to mirror endpoints from:
  src/lib/author/ui/service.ts (DO NOT MODIFY, read for reference only)

Build cycle structure:
Mirror seizn-author-dashboard-redesign-task-pack.md - phases, verify
gates, commit conventions per phase, sequential execution only.
```

---

## 19. Open questions (Phase 0 전 결정 필요)

1. **Tauri 2.x 의존성 설치.** `cargo install tauri-cli` + Rust toolchain 필요. 시스템 admin 권한 필요할 수 있음. Step 3 직전에 사용자 hand-off.
2. **`seizn-desktop/` git remote.** local-only? 또는 `litheonhq/seizn-desktop` GitHub repo 신설? 사용자 결정 필요.
3. **Pensiv 사실 검증 timing.** Phase -1 (Track 1) 시작 전 vs Track 3 Phase 0 Week 1. 권장: Track 1 Phase -1 시작 전 (별 cycle).
4. **편집기 전용 사용자에게 Vault 단계 강제 X.** Phase 2 editor launch 시 Vault 안 쓰는 사용자도 editor 만 쓸 수 있어야 하는가? 권장: yes (강제 X).
5. **Editor Phase 2 conditional vs committed.** master + 본 doc 모두 `committed` 로 lock. Phase 1 gate 결과가 약하면 어떻게? 권장: gate 결과 반영해 timeline 만 조정 (committed 자체는 유지).
6. **부산대 맞춤법 라이선스 협상.** Phase 0 scope 외. 별 cycle.

---

## 20. Next actions (Track 3 owner session, post global-first lock 2026-05-06)

Phase 0 implementation already in progress in `C:\Users\admin\Projects\seizn-desktop\` (commits `086ceb4` Tauri scaffold → `085ceca` skeleton+tray → `3606b88` watcher → `36b7034` import → `9c651de` snapshot store → `91612db` snapshot UI). Mouse gesture spec locked at `9cae27b` (Phase 1 implementation, not Phase 0).

Global-first conversion follow-through (this cycle):

1. Phase 0.7 (self-hosted backend, sqlite-vec + Anthropic BYOK) implementation — locale-agnostic (BYOK key entry / wizard wording = EN default + ko fallback).
2. seizn-desktop code: i18n dict.ts add `en` + default = en, system locale fallback. Microcopy strings hoisted out of App.tsx into dict. tauri.conf window title kept as 'Seizn Desktop'. Tray menu labels EN default. README/CLAUDE.md EN-first. Codex task pack covers this.
3. Mouse gesture spec (`seizn-desktop/docs/mouse-gesture-spec-2026-05-06.md`): add EN action labels alongside KR labels.
4. Stripe v0 (USD) product creation — Phase 1 entry, after Phase 0 release gate passes.
5. Marketing brief (en) for Phase 0.15 alpha invite — global recruit channels (r/writing, r/Fantasy_Writers, Twitter writing community, Indie Author Telegram).
6. ko locale brief preserved as Phase 1.5 secondary launch (KR-mainstream channels: 나비계곡, 작가 디스코드, r/koreanwebnovel).

---

*End of Track 3 design doc. 본 doc 변경 시 master 와 cross-track 알림. 변경은 git log 추적.*
