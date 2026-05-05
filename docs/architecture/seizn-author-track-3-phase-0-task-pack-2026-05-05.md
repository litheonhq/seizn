# Seizn Author Studio — Track 3 Phase 0 Task Pack

**Cycle date:** 2026-05-05
**Phase:** 0 (Recall Vault desktop alpha, ~30 days)
**Repo:** `C:\Users\admin\Projects\seizn-desktop\`
**Master:** `seizn-author-master-2026-05-05.md`
**Design doc:** `seizn-author-track-3-program-2026-05-05.md`

> **Entry gate (lock 2026-05-06).** ~~Track 1 Phase -1 dashboard prototype 의 founding writer 5명 중 3명 retain.~~ **우회**. Track 3 fire-and-forget 모드 (master § 4.5) + 자체 backend (master § 5.6, Track 3 doc § 5.6) 채택으로 Track 1 gate 의존 무효. self-dogfood (사용자 본인이 첫 alpha, Saebyeok IP 원고 import) + Phase 0.15 시 별 channel 모집 (나비계곡 / 작가 디스코드 / 트위터). 즉시 Phase 0.0 진입 가능.

---

## 0. Phase 0 목표

작가가 지금 쓰는 도구를 유지한 채, Track 3 desktop 이 옆에서 원고를 백업하고 설정을 기억한다.

**Phase 0 release gate (Day 30, global-first lock 2026-05-06):**

- ≥3 alpha writers (mix of EN-locale primary + ko-locale secondary, **min 1 EN**) used the build for ≥1 week with their existing editor
- 0 data-loss events
- 100% snapshot restore success rate
- recall usefulness ≥80% (writer self-report, per locale)
- 0 critical hallucinations

**Phase 0 = NOT in scope:**
- 자체 에디터 (Phase 2)
- 모바일 (Phase 3)
- 실시간 협업 (Phase 2)
- HWP write 안정 (Phase 1.5+)
- 자동 맞춤법 (라이선스 후)
- **Track 2 REST endpoint 호출** (자체 backend 채택 — master § 5.6, lock 2026-05-06)
- **Track 1 cohort 의존** (self-dogfood + 별 channel — § 17.0)

---

## 1. Cycle conventions

### 1.1 Phase numbering

`Phase 0.{n}` 형식. Phase 0.0 = pre-flight (admin hand-off). Phase 0.1 ~ Phase 0.15 = implementation.

### 1.2 Verify gate (각 phase 끝)

각 phase 완료 시 다음 모두 pass:
- 명시된 verify 항목 (각 phase 본문)
- `cargo check` clean
- `pnpm tsc --noEmit` clean (frontend)
- 회귀: 직전 phase 의 verify 가 여전히 pass

미달 시 다음 phase 진입 X.

### 1.3 Commit convention

```
<type>(<scope>): <subject>

<body>

Phase: 0.{n}
Verify: <pass/fail summary>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

`type` = `feat | fix | chore | docs | refactor | test`
`scope` = `tauri | watcher | snapshot | recall | ui | export | analytics | hwp`

### 1.4 Sequential execution

Phase 들은 순서대로. 병렬 X. 각 phase 완료 후 verify gate pass 시에만 다음 진입.

### 1.5 Branch / push

- 단일 `main` branch (또는 `phase-0` feature branch)
- Local commit only (Phase 0 끝까지 push 보류, 사용자 결정 후 GitHub remote 신설)

### 1.6 Git account

`litheonhq <litheonhq@gmail.com>` 매 phase 시작 전 verify.

---

## 2. Pre-flight — Phase 0.0 (admin hand-off)

이 phase 는 사용자가 admin 권한으로 직접 실행. AI 가 대신 X.

### 2.1 Rust toolchain install

- Environment: PowerShell (admin) on Windows host
- Command: `winget install Rustlang.Rustup ; rustup default stable`
- Expected result: `rustc --version` outputs stable Rust ≥ 1.79
- Logs to check on failure: `rustup show`, `cargo --version`

### 2.2 Tauri CLI install

- Environment: PowerShell (any) on Windows host
- Command: `cargo install create-tauri-app && cargo install tauri-cli --version "^2.0"`
- Expected result: `cargo tauri --version` outputs ≥ 2.0
- Logs to check on failure: `cargo install --list`

### 2.3 Node.js LTS verify

- Environment: PowerShell (any)
- Command: `node --version ; npm --version`
- Expected result: Node ≥ 20.0, npm ≥ 10.0
- Logs to check on failure: `node -e "console.log(process.versions)"`

### 2.4 (Optional) pnpm install

- Environment: PowerShell (any)
- Command: `npm install -g pnpm`
- Expected result: `pnpm --version` outputs ≥ 9.0
- Logs to check on failure: `npm ls -g --depth=0`

### 2.5 (Optional) Visual C++ Build Tools

Windows 에서 Tauri Rust compile 시 필요할 수 있음. 이미 설치되어 있으면 skip.

- Environment: PowerShell (admin)
- Command: `winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`
- Expected result: build tools 설치 완료
- Logs to check on failure: 설치 GUI 의 install log

**Phase 0.0 verify gate:**

```powershell
rustc --version
cargo --version
cargo tauri --version
node --version
npm --version
pnpm --version  # optional
```

모두 정상 출력 시 → Phase 0.1 진입.

---

## 3. Phase 0.1 — Tauri 2.x init (Day 1)

### 3.1 Scope

`seizn-desktop/` 안에 Tauri 2.x 프로젝트 생성. React + TypeScript + Vite stack.

### 3.2 Steps

```bash
# (cd seizn-desktop && ...) — 사용자 host 에서
cargo tauri init --ci
# OR (선호: 권장)
npm create tauri-app@latest -- --template react-ts --manager pnpm
```

생성 후:
- `src-tauri/` (Rust)
- `src/` (React + TS)
- `package.json`, `pnpm-lock.yaml`
- `vite.config.ts`
- `src-tauri/tauri.conf.json` 의 `productName` = `Seizn Desktop`, `identifier` = `com.litheon.seizn-desktop`

### 3.3 Verify

- `pnpm install` 성공
- `pnpm tauri dev` 시 빈 window 띄움
- 창 제목 = `Seizn Desktop`
- TypeScript strict mode (tsconfig)

### 3.4 Commit

```
feat(tauri): init Tauri 2.x project (React + TS + Vite + pnpm)

Phase: 0.1
Verify: pnpm tauri dev opens window successfully
```

---

## 4. Phase 0.2 — App skeleton + tokens (Day 2-3)

### 4.1 Scope

- 기본 layout (sidebar + main + statusbar)
- warm paper-tone palette (Track 3 doc § 10.1)
- Tauri menu + tray icon
- 한국어 i18n stub (`react-i18next` 또는 자체 minimal)
- 첫 home view (`작가님, 첫 원고를 가져와 주세요.`)

### 4.2 Tokens

`seizn` repo 의 `src/styles/tokens.css` 에서 `.dashboard-redesign` palette 만 추출 → `seizn-desktop/src/styles/tokens.css` 에 복사. 정확히 동일한 색 값을 유지 (Track 1 / Track 3 brand 일관성).

### 4.3 Verify

- 빈 window 가 warm paper-tone 으로 칠해짐
- 한국어 첫 문구 정상 표시
- 메뉴 + tray 동작
- `pnpm tsc --noEmit` clean
- `cargo check` clean

### 4.4 Commit

```
feat(ui): app skeleton + warm paper tokens + ko i18n stub

Phase: 0.2
Verify: window renders with paper palette, ko text correctly
```

---

## 5. Phase 0.3 — File watcher (Day 4-5)

### 5.1 Scope

Rust 의 `notify` crate 으로 file watcher 구현.

### 5.2 의존성 (`src-tauri/Cargo.toml`)

```toml
[dependencies]
notify = "6"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
```

### 5.3 Tauri command

```rust
#[tauri::command]
async fn watch_file(path: String, app: AppHandle) -> Result<(), String> {
    // notify::recommended_watcher
    // debounce 500ms
    // emit event "file-changed" with path + timestamp
}
```

### 5.4 Frontend

```ts
import { listen } from '@tauri-apps/api/event';
listen<{ path: string; ts: number }>('file-changed', (e) => {
    console.log(e.payload);
});
```

### 5.5 Verify

- 단일 파일 watch → 외부에서 수정 시 frontend console 에 path + timestamp 표시
- 1초에 100번 변경 → debounce 후 1~2번 emit
- `pnpm tauri dev` 24시간 실행 후 메모리 leak 없음 (Activity Monitor / Task Manager 확인)
- watcher unregister 시 file handle 깨끗이 해제

### 5.6 Commit

```
feat(watcher): notify-based file watcher with 500ms debounce

Phase: 0.3
Verify: rapid edits debounced, 24h no leak
```

---

## 6. Phase 0.4 — First manuscript import (.txt) (Day 6-7)

### 6.1 Scope

- File picker dialog (Tauri `@tauri-apps/plugin-dialog`)
- `.txt` read: UTF-8 primary, **EUC-KR fallback for ko locale users only** (legacy KR txt). Other locales rely on UTF-8.
- Char count display
- Project metadata persisted (project name, file path, last modified)

### 6.2 의존성

```toml
encoding_rs = "0.8"  # EUC-KR fallback
```

### 6.3 UI

- `원고 가져오기` 버튼 → 파일 선택
- 선택 후 home 에 `OO자, 마지막 변경: HH:MM` 표시
- `이 파일을 감시 중입니다.` 상태 표시

### 6.4 Verify

- 1MB ~ 100MB .txt 정상 import
- EUC-KR 인코딩 .txt 도 정상 표시 (legacy KR 작가 케이스)
- 가져온 후 watcher 자동 등록
- 외부에서 .txt 수정 → 글자 수 자동 갱신

### 6.5 Commit

```
feat(import): .txt manuscript import with EUC-KR fallback + auto-watch

Phase: 0.4
Verify: 100MB txt import OK, EUC-KR detected, watcher auto-registered
```

---

## 7. Phase 0.5 — Local snapshot store (Day 8-10)

### 7.1 Scope

`rusqlite` 기반 append-only snapshot store. 변경 감지 시 SQLite 에 row insert.

### 7.2 Schema

```sql
CREATE TABLE snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    content BLOB NOT NULL,           -- compressed (zstd) full text
    char_count INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    created_at INTEGER NOT NULL,     -- UNIX ms
    delta_from INTEGER,              -- nullable, FK to snapshots.id (skipped for v0.1)
    is_tombstone INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_snapshots_project_created ON snapshots(project_id, created_at DESC);
```

### 7.3 의존성

```toml
rusqlite = { version = "0.31", features = ["bundled"] }
zstd = "0.13"
sha2 = "0.10"
```

### 7.4 정책

- file watcher 변경 감지 → debounce 500ms → 새 snapshot insert
- 동일 SHA256 면 skip (no-op edit)
- delete 시 `is_tombstone=1` row insert (실제 DELETE X)
- 로컬 데이터 디렉토리: `%APPDATA%\Seizn\Desktop\projects\<project_id>\snapshots.db` (Windows), `~/Library/Application Support/Seizn Desktop/...` (macOS), `~/.config/seizn-desktop/...` (Linux)

### 7.5 Verify

- 1초에 10번 편집 → debounce 후 SQLite 에 1~2 row 삽입
- 같은 내용 저장 시 새 row 안 만듦
- Tauri 강제 종료 (`kill -9`) 후 재시작 → snapshot 모두 살아있음
- DB 100MB 까지 query 시간 < 100ms

### 7.6 Commit

```
feat(snapshot): rusqlite append-only snapshot store with zstd compression

Phase: 0.5
Verify: kill -9 recovery OK, dedup OK, 100MB query <100ms
```

---

## 8. Phase 0.6 — Snapshot UI (today/yesterday/last week) (Day 11-12)

### 8.1 Scope

- snapshot list view (그룹 = `오늘 / 어제 / 지난주 / 지난달 / 그 이전`)
- 카드 = `HH:MM, 글자 수 변화 (+OO자 / -OO자), preview 80자`
- 클릭 시 diff view (split, char-level diff)
- `복원` 버튼 → 파일에 덮어쓰기 + 새 snapshot insert

### 8.2 의존성

- `diff-match-patch-rs` 또는 frontend 의 `diff-match-patch`
- `dayjs` 또는 `date-fns` for KR locale

### 8.3 Verify

- 100 snapshot 의 list 렌더링 시간 < 200ms
- Diff view 가 한국어 char-level 정확
- 복원 → 외부 에디터에서 file 열어 같은 내용 확인
- 복원 시 새 snapshot 생성 (history 보존)

### 8.4 Commit

```
feat(ui): snapshot list (today/yesterday/last week) + diff/restore

Phase: 0.6
Verify: 100 snapshots <200ms, restore preserves history
```

---

## 9. Phase 0.7 — 자체 backend: LLM client + sqlite-vec store (Day 13-16, REVISED 2026-05-06)

### 9.0 Revision note

이전 spec = Track 2 REST client. **자체 backend 채택 (master § 5.6 + Track 3 doc § 5.6)** 으로 변경. Track 2 endpoint 호출 0. 모든 entity 추출 / recall / 승인 = local SQLite + 사용자 BYOK Anthropic key.

기간 4일 (Day 13-16) — 이전 0.7 (Day 13-14) + 옛 0.8 의 일부 시간 흡수.

### 9.1 Scope

Tauri Rust side 에 자체 backend (Memory v3 desktop clone) 구현:

- BYOK keyring (사용자 Anthropic + 옵션: Voyage AI / OpenAI key)
- Anthropic SDK client (Haiku 기본 / Sonnet 옵션)
- Embedding client (Voyage AI 또는 OpenAI text-embedding-3-small)
- sqlite-vec extension + vector store schema
- Entity extraction pipeline (manuscript text → entity card)
- Recall search (vector similarity + entity metadata join)
- Entity 승인 / 수정 / 삭제 (local SQLite)

### 9.2 의존성 (Cargo.toml)

```toml
[dependencies]
reqwest = { version = "0.12", features = ["json", "rustls-tls", "stream"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
keyring = "3"  # OS keyring (Windows Credential Manager / macOS Keychain / Linux Secret Service)
sqlite-vec = "0.1"  # 또는 sqlite-vss. 첫 시도 = sqlite-vec
```

### 9.3 BYOK keyring 설계

사용자 첫 실행 시 wizard:
- Anthropic API key 입력 (필수, Haiku 호출용)
- Voyage AI key 입력 (옵션, embedding 비용 ↓)
- OS keyring 에 저장 (사용자 password 보호)

key 가 없으면 entity 추출 / recall 비활성. 사용자가 wizard 다시 띄울 수 있는 setting 제공.

### 9.4 Anthropic client

```rust
// src-tauri/src/llm/anthropic.rs
pub async fn extract_entities(
    text: &str,
    chunk_size: usize,
) -> Result<Vec<EntityCard>, LlmError> {
    // POST https://api.anthropic.com/v1/messages
    // model: claude-haiku-4-5-20251001 (default) or claude-sonnet-4-6
    // system: '당신은 한국 장편 소설의 등장인물·장소·물건·설정·약속·사건·떡밥을 추출합니다.'
    // 응답: structured JSON (zod-equivalent serde struct)
}
```

### 9.5 Embedding client

기본 = Voyage AI (`voyage-3` 한국어 우수). Fallback = OpenAI `text-embedding-3-small`.

```rust
pub async fn embed(text: &str) -> Result<Vec<f32>, EmbeddingError> {
    // POST https://api.voyageai.com/v1/embeddings
    // input: text, model: voyage-3
}
```

### 9.6 SQLite schema

```sql
-- 기존 snapshots table (Phase 0.5) 유지
-- 추가:
CREATE TABLE entities (
    id TEXT PRIMARY KEY,                -- UUID
    project_id TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    type TEXT NOT NULL,                  -- 인물/장소/물건/설정/약속/사건/떡밥
    first_mention_chapter INTEGER,
    first_mention_offset INTEGER,
    last_mentions_json TEXT,             -- JSON array of {chapter, offset, ts}
    current_state TEXT,
    related_json TEXT,                   -- promises/events/items
    status TEXT NOT NULL,                -- 'ai_suggested' | 'user_approved' | 'archived'
    confidence REAL,
    source_snippet TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX idx_entities_project ON entities(project_id);
CREATE INDEX idx_entities_name ON entities(canonical_name);

-- sqlite-vec virtual table for embedding
CREATE VIRTUAL TABLE entities_vec USING vec0(
    id TEXT PRIMARY KEY,
    embedding FLOAT[1024]               -- voyage-3 dimension
);

CREATE TABLE conflicts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id TEXT NOT NULL,
    chapter_a INTEGER NOT NULL,
    chapter_b INTEGER NOT NULL,
    snippet_a TEXT,
    snippet_b TEXT,
    severity TEXT NOT NULL,              -- 'P1' | 'P2' | 'P3'
    status TEXT NOT NULL,                -- 'open' | 'resolved' | 'ignored'
    created_at INTEGER NOT NULL,
    FOREIGN KEY (entity_id) REFERENCES entities(id)
);
```

### 9.7 Tauri commands (frontend 노출)

```rust
#[tauri::command]
async fn recall(query: String, project_id: String) -> Result<Vec<EntityCard>, String> { ... }

#[tauri::command]
async fn index_manuscript(project_id: String, text: String) -> Result<IndexResult, String> { ... }

#[tauri::command]
async fn approve_entity(entity_id: String) -> Result<(), String> { ... }

#[tauri::command]
async fn edit_entity(entity_id: String, patch: EntityPatch) -> Result<EntityCard, String> { ... }

#[tauri::command]
async fn delete_entity(entity_id: String) -> Result<(), String> { ... }

#[tauri::command]
async fn list_conflicts(project_id: String) -> Result<Vec<ConflictCard>, String> { ... }

#[tauri::command]
async fn save_api_key(provider: String, key: String) -> Result<(), String> { ... }

#[tauri::command]
async fn get_api_key_status() -> Result<KeyStatus, String> { ... }
```

### 9.8 Verify

- 첫 실행 wizard 에서 Anthropic key 입력 → keyring 저장 → 재시작 후에도 보존
- 1만 자 manuscript text → `index_manuscript` → 5~20 entity 추출 (Haiku 호출) → SQLite + embedding 저장 → 5~10초 이내
- `recall("서윤")` → vector similarity + name match → top 5 entity card
- 네트워크 끊겨도 SQLite 검색은 작동 (LLM 호출만 실패)
- API key 비용 추적 (call count + token usage)

### 9.9 Commit

```
feat(memory): self-hosted backend - BYOK Anthropic + sqlite-vec + entity store

Phase: 0.7
Verify: 1만자 → 5~20 entity 추출 ≤10초, recall vector search ≤100ms, BYOK keyring 보존
```

---

## 10. Phase 0.8 — Global hotkey recall (Day 15-16)

### 10.1 Scope

- Tauri `@tauri-apps/plugin-global-shortcut` 으로 시스템 전역 단축키
- 기본 단축키 = `Ctrl+Shift+Space` (사용자 설정 가능)
- 단축키 누름 → small popup window 띄움
- popup 안에 search input + recall result list

### 10.2 Popup window

- frameless (Tauri config)
- always-on-top
- center on active monitor
- ESC 또는 blur 시 자동 닫힘

### 10.3 Verify

- 다른 앱 (Word, 메모장) 에서 `Ctrl+Shift+Space` 누름 → popup 즉시 띄움
- search input 자동 포커스
- 검색 후 결과 카드 (entity card UI = Phase 0.9 lead-in)
- popup 닫힘 후 원래 앱 포커스 복귀

### 10.4 Commit

```
feat(recall): global shortcut popup window (Ctrl+Shift+Space)

Phase: 0.8
Verify: cross-app focus, ESC dismiss, popup centers on active monitor
```

---

## 11. Phase 0.9 — Recall card UI + entity 승인 (Day 17-19)

### 11.1 Scope

Recall card (entity card) 8 elements rendering + 승인/수정/삭제 흐름.

### 11.2 Card 구성 (Track 3 doc § 9.2)

```
┌────────────────────────────────────────┐
│ 서윤  [인물]  • AI 제안 / 작가 승인됨   │
│                                        │
│ 첫 등장: 1화 (3,420자 위치)             │
│ 마지막 언급: 47화 (12,890자 위치)       │
│                                        │
│ 현재 상태:                              │
│   머리 갈색, 24세, 미술학원 강사         │
│                                        │
│ 관련 약속/사건:                          │
│   • 도윤에게 그림 가르치기 약속 (3화)    │
│   • 갤러리 오프닝 참석 예정 (52화 예고) │
│                                        │
│ 잠재 충돌:                              │
│   • 12화: 머리 검은색으로 묘사           │
│                                        │
│ 출처: '서윤은 갈색 단발을 쓸어내렸다.' (47화)│
│                                        │
│ [승인] [수정] [삭제] [충돌 검토]         │
└────────────────────────────────────────┘
```

### 11.3 승인/수정/삭제 흐름

- `[승인]` → status `작가 승인됨` 으로 변경. canonical truth 확정.
- `[수정]` → inline edit 모드. 저장 시 새 fact insert + 이전 fact archive.
- `[삭제]` → tombstone insert. UI 에서 hide.
- `[충돌 검토]` → 충돌 후보 carousel. 작가가 reconcile.

### 11.4 Verify

- popup 안에서 entity 카드 8 elements 모두 렌더링
- 승인 → Track 2 API 호출 → 카드 status 즉시 갱신
- 수정 → inline edit 후 저장 → API 호출 OK
- 삭제 후 새 search 에서 안 보임

### 11.5 Commit

```
feat(recall): entity card UI (8 elements) + approve/edit/delete flow

Phase: 0.9
Verify: card renders correctly, approve/edit/delete all sync to Track 2
```

---

## 12. Phase 0.10 — DOCX import + setting file index (Day 20-21)

### 12.1 Scope

- `.docx` import (`docx-rs` 또는 `mammoth.js`)
- `.csv`, `.xlsx` 설정 파일 인덱스 (project context)
- `.md` 설정 파일 인덱스

### 12.2 의존성

```toml
docx-rs = "0.4"
calamine = "0.24"  # xlsx
csv = "1.3"
```

### 12.3 UI

- `설정 파일 추가` 버튼 → 파일 선택
- 추가된 setting 파일은 sidebar 의 `설정 파일` 섹션 표시
- watcher 자동 등록

### 12.4 Verify

- .docx → 텍스트 + 챕터 marker 인식
- .xlsx 인덱스 → recall 결과에 (1순위가 아니라도) 등장
- .csv 인덱스 → 같음
- 모든 setting 파일도 watcher + snapshot 대상

### 12.5 Commit

```
feat(import): docx + csv/xlsx/md setting file index

Phase: 0.10
Verify: docx text extraction OK, xlsx setting recall returns row context
```

---

## 13. Phase 0.11 — HWP/HWPX read-only import (experimental) (Day 22-23)

### 13.1 Scope

`rhwp` (Rust + WASM) 또는 `@ohah/hwpjs` 로 HWP/HWPX read-only.

### 13.2 의존성 (후보)

```toml
# 후보 1
rhwp = "*"
```

```json
// 후보 2 (frontend)
"@ohah/hwpjs": "^x.x.x"
```

성능 / 안정성 비교 후 lock. 권장: 첫 attempt = `rhwp`, fallback = `@ohah/hwpjs`.

### 13.3 UI

- import dialog 의 `.hwp / .hwpx` 옵션은 `experimental` flag 로 hide. 설정에서 enable.
- 사용자가 enable 시 dialog 에 옵션 표시.

### 13.4 Verify

- 한컴오피스에서 만든 .hwp 1개 sample 정상 read
- .hwpx (XML) sample 정상 read
- 깨진 HWP 는 graceful error (앱 crash X)

### 13.5 Commit

```
feat(hwp): HWP/HWPX read-only import (experimental flag)

Phase: 0.11
Verify: hwp + hwpx samples read OK, corrupt HWP graceful error
```

---

## 14. Phase 0.12 — Zip export (Day 24)

### 14.1 Scope

- 프로젝트 단위 zip export
- 포함: 원고 파일 latest snapshot + setting 파일 + entity card JSON + snapshot history (optional)
- SHA-256 verify

### 14.2 의존성

```toml
zip = "2"
sha2 = "0.10"  # 이미 Phase 0.5 에서 추가
```

### 14.3 Verify

- 100MB project zip export → 외부 unzip → 무결성 verify
- export paywall X (Free tier 도 가능)
- export 후 진행 indicator 표시

### 14.4 Commit

```
feat(export): project zip export + SHA-256 verify

Phase: 0.12
Verify: 100MB project unzip integrity OK, no paywall
```

---

## 15. Phase 0.13 — DOCX export presets (Day 25, global-first)

### 15.1 Scope

`docx-rs` 로 텍스트 → DOCX. 두 preset:

- **`default`** (EN/JA/ZH/ES locale): generic Word-friendly (Calibri-equivalent fallback, standard Heading 1 / paragraph styles). Opens cleanly in Word 2019+, LibreOffice 7+, Google Docs import.
- **`hangul`** (ko locale, opt-in): 함초롬바탕 font mapping + 한국어 줄바꿈 + chapter marker → Heading 1. Opens cleanly in 한컴오피스 2024/2018.

User chooses preset at export time (default = locale-derived suggestion, override allowed).

### 15.2 Verify

- `default` export → Word 2019 + LibreOffice + Google Docs import OK, chapter outline preserved
- `hangul` export → 한컴오피스 2024 / 2018 opens cleanly, 한국어 자모 unbroken
- Chapter markers (`# 1화` / `## Chapter N` / `Chapter N` line patterns) → Heading 1

### 15.3 Commit

```text
feat(export): DOCX presets (default + hangul opt-in for ko locale)

Phase: 0.13
Verify: Word/LibreOffice/Hangul Office round-trip OK
```

---

## 16. Phase 0.14 — Analytics + data safety test suite (Day 26-28)

### 16.1 Analytics events

- `import.first_manuscript`
- `recall.first_useful` (작가 self-tag: `이거 찾으려던 거다`)
- `snapshot.created`
- `snapshot.restored`
- `entity.approved`
- `entity.modified`
- `export.zip_created`
- `app.opened`
- `app.daily_active`

저장: 로컬 SQLite events table + opt-in cloud sync (Phase 1).

### 16.2 Data safety test suite

```rust
// src-tauri/tests/data_safety.rs
#[test]
fn kill_during_edit_recovers() { ... }

#[test]
fn rapid_edit_100_per_sec_no_loss() { ... }

#[test]
fn corrupt_db_recovers_from_last_snapshot() { ... }

#[test]
fn disk_full_warns_and_safe_stop() { ... }

#[test]
fn watcher_24h_no_memory_leak() { ... }  // 별 long-running test
```

### 16.3 Verify

- 모든 test 통과
- analytics events 가 SQLite 에 정상 기록
- `app.daily_active` 가 1일 1회 fire (daily uniqueness)

### 16.4 Commit

```
feat(safety): data safety test suite + analytics events

Phase: 0.14
Verify: 5 safety tests pass, analytics events recorded
```

---

## 17. Phase 0.15 — Closed alpha 3 writer invite (Day 29-30, REVISED 2026-05-06)

### 17.0 Revision note

- 2026-05-06 (a): 이전 spec = Track 1 Phase -1 retain 작가 cohort transfer. **자체 모집 채택** (master § 5.3 lock). Track 1 의존 무효.
- 2026-05-06 (b, **global-first lock**): 모집 채널 = EN-locale primary + ko-locale secondary. ≥3 writers with **min 1 EN-locale**.

### 17.1 Scope

- `Seizn Desktop alpha 0.1.0` build (Win + Mac)
- ≥3 alpha writers invited — recruit channels:
  - **Self-dogfood** (Saebyeok IP manuscript, first alpha — bilingual EN/KO test)
  - **EN-locale primary:**
    - r/writing, r/Fantasy_Writers, r/selfpublish (Reddit cold post)
    - Twitter writing community (`#WritingCommunity`, `#amwriting`, `#scrivener`)
    - Indie Author Telegram / Discord groups (NaNoWriMo Discord, indie-fiction Slack)
  - **ko-locale secondary:**
    - 나비계곡 cold outreach
    - 작가 Discord servers
    - 트위터 KR dev-author / KR fiction writer accounts
    - r/koreanwebnovel (if active)
- BYOK guide (Anthropic API key issuance link, locale-localized)
- Onboarding doc 1 page per locale (en + ko initial; ja/zh/es Phase 1)
- Outreach channel = writer's familiar place (WhatsApp / Discord / Telegram / Twitter DM)

### 17.2 Onboarding doc — EN (primary)

```markdown
## Get started in 5 minutes

1. Launch Seizn Desktop.
2. Click `Import manuscript` and pick a .txt, .md, or .docx file.
3. Once the word count shows, you're done. Seizn is now backing up beside you.
4. Press `Ctrl + Shift + Space` from anywhere to recall a character, place, or setting.

## Your data, safe

- Every backup lives on your computer only.
- Cloud backup is opt-in; off by default.
- We don't train AI on what you write.
- One-click zip export, anytime.
```

### 17.3 Onboarding doc — ko (secondary, ko locale)

```markdown
## 5분 안에 시작하기

1. Seizn Desktop 을 실행합니다.
2. `원고 가져오기` 를 누르고 .txt 또는 .docx 파일을 선택합니다.
3. 글자 수가 표시되면 끝. 시즌이 옆에서 백업하고 있어요.
4. 어디서든 `Ctrl + Shift + Space` 를 누르면 등장인물·설정 검색이 떠요.

## 데이터 안전

- 모든 백업은 작가님 컴퓨터 안에만 저장됩니다.
- 클라우드 백업은 사용자가 켤 때만 켜집니다.
- 작가님이 만드신 글로 AI 학습을 하지 않습니다.
- 언제든 zip 으로 통째로 가져갈 수 있어요.
```

### 17.4 Verify (Phase 0 final gate, global-first)

- ≥3 writers (min 1 EN-locale) installed alpha + used ≥1 week with their existing editor
- 0 data-loss events
- 100% snapshot restore success
- recall usefulness ≥80% per writer self-report (per locale)
- 0 critical hallucinations

### 17.5 Commit

```text
release(alpha): Seizn Desktop 0.1.0-alpha.1 — closed alpha (≥3 writers, EN+ko)

Phase: 0.15
Verify: alpha build runs, 3 writers onboarded, gate criteria pending 1-week data
```

---

## 18. Phase 0 → Phase 1 transition

Phase 0.15 verify gate 통과 후 (1주일 사용 + 데이터 유실 0 + recall usefulness ≥ 80%):

1. Phase 1 task pack 작성 (`seizn-author-track-3-phase-1-task-pack-2026-05-05.md`)
2. Phase 1 entry: snapshot diff/restore 안정화 + cloud backup opt-in + closed beta 10명 + 가격 검증

미달 시:
- Phase 0 iterate (어느 gate criterion 이 fail 인지에 따라 specific phase 재실행)
- 사용자와 간단 retrospective

---

## 19. Failure modes / mitigations

| Risk | 발생 시 대응 |
|---|---|
| Tauri install on Windows fails (VC Build Tools 부재) | Phase 0.0 의 §2.5 admin command 실행. 안 되면 사용자가 IDE 에서 manual install |
| `notify` crate macOS FSEvents 누락 | Polling fallback 옵션 추가 (notify config) |
| rusqlite native link error | `bundled` feature 사용 (이미 §7.3 에 포함) |
| Track 2 API endpoint 지연 (이 트랙이 Phase 0 완료 전에 Track 2 endpoint 미완) | Track 3 가 mock JSON server (예: msw) 로 우회 + Track 2 owner 와 spec 동기화 |
| HWP read 가 작가 sample 에서 깨짐 | rhwp / @ohah/hwpjs 둘 다 시도 후 둘 다 실패 시 Phase 1 으로 미룸 (experimental flag 유지, 표면 release X) |
| 작가 alpha 사용 중 데이터 유실 (가능성 낮지만 critical) | 즉시 Phase 0 stop, postmortem, root cause 발견 후 patch + rerun gate |
| Rust toolchain admin install 거부 | 사용자와 일정 조율, 다른 PC 사용 검토 |

---

## 20. 다음 액션 (이 cycle 직후)

1. 사용자에게 본 task pack review 요청
2. 사용자가 Phase 0.0 admin command 실행
3. (verify gate 통과 시) AI 가 Phase 0.1 부터 sequential 실행
4. 매 phase 완료 시 사용자에게 verify gate 결과 보고

---

## 21. Build agent handoff (영어, agent-to-agent per CLAUDE.md §7)

```text
You are implementing Seizn Author Studio Track 3 Phase 0 (this task pack).
Repo: C:\Users\admin\Projects\seizn-desktop\
Master: docs/architecture/seizn-author-master-2026-05-05.md
Design: docs/architecture/seizn-author-track-3-program-2026-05-05.md

Sequential execution. Each phase must pass its verify gate before the
next. No parallelism between phases. Branch: main (or phase-0 feature
branch). Local commits only until user approves remote.

Phase 0.0 is admin hand-off (Rust toolchain install). DO NOT attempt to
install Rust yourself - hand off to user with the §2 commands. After
verifying Rust + Tauri CLI + Node.js + (optional) pnpm, proceed to
Phase 0.1.

Stack lock (master / Track 3 § 5):
- Tauri 2.x + Rust + React (TypeScript)
- TipTap + Yjs + y-leveldb (Phase 2 only; not Phase 0)
- notify crate (file watcher)
- rusqlite + zstd + sha2 (snapshot)
- Track 2 REST API client (frontend fetch; no direct Memory v3)

Non-negotiables:
- Never touch C:\Users\admin\Projects\seizn\ (Track 1 + Track 2 territory)
- Never block data export
- Never train on user content
- AI-derived canon stays as suggestion until user-approved
- Local snapshots inspectable + exportable
- Korean public copy: single quotes only
- Git account: litheonhq <litheonhq@gmail.com>

Commit convention: see §1.3.

If a phase's verify gate fails, stop and surface to the user. Do not
push through. If the same root cause produces 3 failures in a row,
search official Tauri docs / GitHub issues / Stack Overflow before the
4th attempt (per global CLAUDE.md §13.1).
```

---

*End of Phase 0 task pack. Phase 1 task pack 은 Phase 0 verify gate 통과 후 작성.*
