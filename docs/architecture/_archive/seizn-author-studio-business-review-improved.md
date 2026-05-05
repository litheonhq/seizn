# Seizn Author Studio — 사업성 판단 및 개선안

**Review date:** 2026-05-05  
**Input doc:** `seizn-author-studio-design-doc.md`  
**Verdict:** 진행 권장. 단, 현재 문서의 `풀 에디터 + 웹 + 데스크톱 + CLI + CRDT + Export + Spellcheck` 동시 MVP는 범위가 과하고, 경쟁 구도 대비 포지셔닝이 넓다. `작가용 올인원 집필툴`이 아니라 `기존 원고 파일을 지키고, 작가가 잊은 설정을 즉시 찾아주는 로컬 우선 Recall Vault`로 시작하는 편이 사업 성공 확률이 높다.

---

## 1. 최종 판단

### 1.1 현재안의 사업성

| 항목 | 판단 | 이유 |
| --- | --- | --- |
| 문제 강도 | 높음 | 데이터 유실, 장문 원고 Ctrl-F, 설정/연속성 기억 실패는 작가가 실제로 비용을 느끼는 문제다. |
| 차별화 가능성 | 중상 | `AI가 써주는 도구`가 아니라 `내 원고를 찾아주는 도구`라는 포지션은 윤리/문체 우려를 피해 간다. |
| 시장 진입 난도 | 높음 | 펜시브, 뮤블, 노벨라가 이미 작가용 에디터·설정 관리·AI·자동저장·내보내기를 말하고 있다. |
| MVP 실현성 | 낮음 | 4–6주에 웹+데스크톱+CLI+CRDT+스냅샷+리콜+검사+내보내기까지 안정적으로 완성하기 어렵다. |
| 수익화 가능성 | 중간 | 월 9,900–14,900원대는 가능성이 있으나, 취미/지망 작가 비중이 높아 무료 사용자가 많을 수 있다. |
| 결론 | Go, but narrow | 에디터 자체보다 `Recall + Backup + 기존 워크플로 보존`으로 시작해야 한다. |

---

## 2. 핵심 수정 방향

### Before

> Seizn Author Studio: writers draft inside Seizn, with local-first CRDT sync and Memory v3 inline recall.

### After

> Seizn Author Studio starts as a local-first **Recall Vault** that watches/imports the writer's existing manuscript, protects versions, and makes canon recall instant. The full editor becomes a later conversion surface, not the first adoption ask.

이 변경이 중요한 이유:

1. 작가에게 새 에디터로 이사하라고 요구하지 않는다.
2. Word, Notepad, Google Docs, Scrivener, Gmail Draft 사용자를 모두 흡수할 수 있다.
3. 데이터 유실과 설정 검색이라는 핵심 pain을 새 에디터 완성 전에도 검증할 수 있다.
4. 경쟁 제품과 정면으로 `올인원 에디터` 대결을 하지 않고, 작가의 기존 작업 파일 옆에 붙는 보조 레이어가 된다.
5. Memory v3의 고유 강점이 더 빨리 드러난다.

---

## 3. 개선된 포지셔닝

### 3.1 추천 메인 카피

**`쓰던 파일은 그대로. 잊은 설정은 시즌이 찾아드립니다.`**

보조 카피:

- **`AI가 대신 쓰지 않습니다. 당신의 원고에서 찾아줍니다.`**
- **`20만 자 원고 속 설정, Ctrl-F 대신 @로 호출하세요.`**
- **`Word·메모장·구글문서·Scrivener 원고를 안전하게 보관하고 기억합니다.`**

### 3.2 피해야 할 카피

- `한 단어도 잃지 않습니다.`  
  - 너무 절대적이다. 데이터 안전을 핵심 가치로 쓰되 법적/평판 리스크가 있다.
- `작가용 올인원 집필툴`  
  - 노벨라·펜시브·뮤블과 정면 충돌한다.
- `AI 집필 보조`  
  - 작가 윤리/문체 우려를 자극한다. Seizn은 생성보다 recall/검증을 전면에 둬야 한다.

### 3.3 추천 포지션 문장

> Seizn Author Studio is a Korean web-novel recall and backup layer for writers who write long manuscripts in one file. It does not replace the author's voice. It remembers the author's own canon and protects the manuscript locally first.

한국어 제품 설명:

> 시즌 오서 스튜디오는 웹소설 작가가 이미 쓰고 있는 원고 파일을 로컬에서 안전하게 보관하고, 등장인물·장소·설정·약속·사건을 즉시 다시 찾아주는 설정 기억 도구입니다. AI가 문장을 대신 쓰지 않고, 작가가 이미 쓴 원고에서 필요한 기억을 꺼내 줍니다.

---

## 4. 개선된 MVP 범위

### 4.1 삭제 또는 후순위로 미룰 것

| 항목 | 결정 | 이유 |
| --- | --- | --- |
| Web + Desktop + CLI 동시 출시 | 삭제 | MVP 범위 과대. 초기 작가에게 CLI 가치는 낮다. |
| CRDT 기반 멀티 디바이스 실시간 편집 | 후순위 | 데이터 안전 검증 전에는 오히려 복잡도/리스크가 크다. |
| 풀 에디터 v1 | 후순위 | 새 에디터 전환은 adoption friction이 크다. |
| 실시간 conflict marker | 후순위 | recall 가치 검증 뒤 붙여도 된다. |
| HWP write 직접 지원 | 베타 전까지 별도 트랙 | 한국 작가용 툴이라면 결국 필요하지만, 불안정한 구현으로 v1을 망치면 안 된다. |
| Spellcheck 직접 API 호출 | 보류 | 부산대/나라인포테크 계열 서비스는 상업 사용 이슈가 있으므로 라이선스 확정 전 금지. |

### 4.2 새 MVP: Recall Vault

**목표:** 작가가 지금 쓰는 방식은 유지하되, Seizn이 원고를 기억하고 백업한다.

#### 필수 기능

1. **원고 가져오기**
   - `.txt`, `.md`, `.docx` 우선
   - `.hwp/.hwpx`는 read-only import부터 실험
   - Google Docs는 v1.5에서 export/import flow로 대응

2. **로컬 우선 Vault**
   - 원고를 로컬 앱 데이터 폴더에 snapshot 저장
   - append-only snapshot log
   - 사용자가 원하면 프로젝트 zip으로 즉시 내보내기
   - 삭제 시 tombstone 유지

3. **파일 감시 모드**
   - 사용자가 Word/메모장/VS Code/Scrivener에서 계속 쓰면, Seizn이 지정 파일을 감시하고 주기적으로 snapshot 생성
   - 파일 변경 감지 후 Memory v3 index refresh

4. **@ Recall 검색**
   - 전역 단축키 또는 앱 내 검색창
   - 인물/장소/물건/설정/약속/사건 검색
   - `마지막 언급`, `첫 등장`, `현재 canon`, `관련 충돌 후보` 제공

5. **설정 카드 자동 생성**
   - Memory v3가 원고에서 추출한 entity를 카드화
   - 작가는 카드 수정/고정/삭제 가능
   - AI 추출 결과는 항상 `제안`으로 표시하고, canonical truth는 작가 승인 후 확정

6. **원클릭 백업/복구**
   - 오늘/어제/지난주 snapshot 보기
   - diff 후 복원
   - 로컬 zip export

7. **DOCX/MD/TXT export**
   - export lock-in 금지
   - 무료 사용자도 export 가능

#### 비필수 기능

- 자체 에디터
- 웹 편집
- CLI
- 실시간 협업
- 모바일
- 풀 conflict detection
- HWP write
- 자동 맞춤법 검사

---

## 5. 개선된 단계 계획

### Phase -1 — 7일짜리 검증 프로토타입

**목표:** 작가가 `@recall`에 돈을 낼 만큼 반응하는지 확인.

- 기존 Author dashboard에 `manuscript import`와 `recall search`만 붙인다.
- writer 5명에게 각자 장문 원고를 가져오게 한다.
- 첫 세션에서 다음을 측정한다.
  - 원고 업로드 → 첫 유용한 recall까지 걸린 시간
  - 작가가 직접 `이거 찾으려고 Ctrl-F 했던 거다`라고 말한 순간 수
  - 잘못된 recall/환각/부정확 canon 수
  - 사용 후 `월 9,900원 이상 지불 의향` 여부

**Gate:** 5명 중 3명 이상이 `다음 원고에도 쓰겠다`, 2명 이상이 유료 의향을 말해야 Phase 0 진입.

### Phase 0 — Recall Vault desktop alpha, 2–3주

- Tauri desktop shell
- local snapshot store
- file watcher
- txt/md/docx import
- Memory v3 recall index
- 전역 단축키 recall
- zip backup/export

**Gate:** 3명의 작가가 기존 편집기를 유지한 채 1주 이상 사용. 데이터 유실 0건. Recall accuracy에 대한 수동 평가 80% 이상.

### Phase 1 — Closed beta, 3–4주

- snapshot diff/restore UI
- entity card 승인/수정 UI
- docx export 개선
- cloud backup opt-in
- founder writer 10명
- 가격 실험

**Gate:** 10명 중 5명 이상이 2주차에도 사용. 3명 이상이 결제 또는 선결제. HWP 부재가 beta blocker인지 확인.

### Phase 2 — Built-in editor, 4–6주

- single-file editor
- chapter marker detection
- sidebar
- on-demand recall panel
- local-first save indicator
- optional cloud sync

**Gate:** 기존 Vault 사용자 중 30% 이상이 자체 에디터를 선택해야 web/CLI 확장.

### Phase 3 — HWP + web parity

- HWP/HWPX read/write 안정화
- web read/write parity
- conflict detection toggle
- team/editor review flow

---

## 6. 개선된 가격안

### Free

- 1 active project
- local snapshot
- txt/md/docx export
- manual recall limited quota
- full data export always available

### Pro — ₩12,900/month or ₩99,000/year

- unlimited projects
- cloud backup/sync
- Memory recall unlimited within fair-use limit
- version history 1 year
- conflict candidate review
- priority indexing

### Pro Plus — ₩24,900/month

- very long manuscripts / large universes
- HWP/HWPX export when stable
- cross-series canon recall
- advanced audit and timeline

### Studio / Publisher — custom or ₩99,000+/month

- editor/reviewer seats
- private workspace
- shared canon bible
- export/audit history
- onboarding support

가격 원칙:

- export paywall 금지
- cancel 후 read-only lock-in 금지
- AI 생성량 기반 과금보다 프로젝트/백업/리콜 가치 기반 과금
- 창작자 윤리 우려를 피하기 위해 `AI prose generation`을 paid feature로 전면 배치하지 않음

---

## 7. 사업 검증 지표

### Activation

- 원고 import 후 첫 유용한 recall까지 10분 이내
- 첫 세션에서 작가가 저장한 entity card 5개 이상
- 첫 세션에서 snapshot/backup 기능을 이해한 비율 80% 이상

### Retention

- 14일 내 3회 이상 재방문
- 30일 내 원고 변경 snapshot 10개 이상
- 기존 편집기 유지 사용자의 파일 watcher 유지율 50% 이상

### Willingness to Pay

- founder cohort 10명 중 3명 이상 유료 전환 또는 선결제
- `HWP 없으면 결제 안 함` 비율 40% 이상이면 HWP를 Phase 1.5로 당김
- `에디터가 없으면 결제 안 함` 비율이 높으면 built-in editor를 Phase 1로 당김

### Product Quality

- recall answer usefulness 80% 이상
- critical hallucination 0건 목표
- snapshot 복구 성공률 100%
- 데이터 유실 0건

---

## 8. 기술 수정 권고

### 8.1 Yjs/CRDT

Yjs 선택 자체는 타당하다. 다만 v1에서 실시간 멀티 디바이스 편집까지 넣을 필요는 없다. 초기에는 다음 순서가 더 안전하다.

1. append-only local snapshot
2. file watcher
3. cloud backup
4. Yjs editor
5. CRDT sync

`No automatic merge`라는 표현은 CRDT와 충돌할 수 있다. 문구를 다음처럼 바꾼다.

> CRDT-level operations may merge automatically, but semantic divergence is never silently resolved. When the same paragraph has meaningfully divergent versions, the user sees a diff and chooses.

### 8.2 HWP

HWP는 한국 작가 포지셔닝에서 중요하다. 다만 직접 write를 안정화하기 어렵다면 beta 전에는 다음 순서로 접근한다.

1. HWP/HWPX read-only import
2. DOCX export optimized for Hancom conversion
3. HWPX export experimental flag
4. HWP/HWPX stable export

### 8.3 Spellcheck

부산대/나라인포테크 계열 검사기는 상업 사용 권리 확인 전 제품 서버에서 호출하면 안 된다. v1에서는 다음 중 하나를 택한다.

- 완전 제거
- 사용자가 직접 외부 검사기로 복사할 수 있는 export flow만 제공
- 상업 라이선스 확보 후 도입
- 오픈소스/자체 모델 기반 오프라인 검사기로 교체

### 8.4 데이터 안전 문구

제품 내부 목표는 `zero data loss`로 유지하되, 외부 카피는 절대 표현을 피한다.

- Bad: `한 단어도 잃지 않습니다.`
- Better: `로컬 우선 백업으로 원고 손실 위험을 줄입니다.`
- Better: `원고 변경 이력을 자동으로 남기고, 언제든 이전 버전으로 돌아갑니다.`

---

## 9. 기존 문서에 적용할 패치 요약

### Executive Summary 교체

기존:

> Seizn Author Studio is a writing surface that runs Memory v3 inline while drafting.

수정:

> Seizn Author Studio starts as a local-first recall and backup layer for Korean long-form fiction writers. It watches or imports the manuscript the writer already uses, snapshots every version locally, and turns Memory v3 into an instant canon recall system. A built-in editor is added only after recall and backup value are validated.

### Wedge 교체

기존:

> A writing tool that does not lose your words and does not forget your own canon.

수정:

> Keep writing where you already write. Seizn remembers your canon and protects your manuscript.

한국어:

> 쓰던 곳에서 계속 쓰세요. 설정과 백업은 시즌이 맡습니다.

### MVP Feature Lock 교체

기존 8개 기능을 다음 6개로 축소한다.

1. Manuscript import/watch
2. Local snapshot vault
3. Memory v3 recall search
4. Entity card approval/edit
5. One-click backup/export
6. Closed beta metrics instrumentation

### Phased Plan 교체

- Phase -1: dashboard import + recall prototype
- Phase 0: desktop Recall Vault alpha
- Phase 1: closed beta + pricing validation
- Phase 2: built-in editor
- Phase 3: HWP + web parity + CLI

---

## 10. 다음 액션

1. 현재 design doc을 바로 build spec으로 넘기지 않는다.
2. 먼저 `Recall Vault` 패치 버전을 반영한다.
3. 5명 founding writer에게 풀 에디터가 아니라 `기존 원고 파일 + recall + backup` 콘셉트로 다시 인터뷰한다.
4. 각 인터뷰에서 다음 세 질문을 반드시 묻는다.
   - 새 에디터로 옮기는 것과, 기존 파일 옆에 recall/backup 앱을 붙이는 것 중 어느 쪽이 더 편한가?
   - HWP export가 v1에 없으면 결제/사용을 보류하는가?
   - 월 9,900원/12,900원/19,900원 중 어디까지 지불 가능한가?
5. 답변 결과에 따라 Editor-first와 Vault-first 중 최종 결정한다.

---

## 11. Build Agent Handoff Prompt

```text
You are implementing the revised Seizn Author Studio MVP. Do not build the full editor-first product from the original design doc yet.

Goal:
Build a local-first Recall Vault alpha for Korean long-form fiction writers.

Primary user problem:
Writers already have long manuscripts in Word, txt, md, Scrivener, Google Docs exports, or HWP. They lose time searching their own canon and fear losing manuscript data. The product must preserve their current workflow, snapshot files locally, and provide fast Memory v3 recall.

Scope:
1. Tauri desktop shell.
2. Import/watch txt, md, docx. HWP/HWPX read-only import may be behind an experimental flag.
3. Local append-only snapshot store.
4. Project zip backup/export.
5. Memory v3 recall index refresh from imported/watched manuscript text.
6. Recall UI: search box, entity cards, last mentions, current canon, conflict candidates.
7. Entity approval/edit/delete UI.
8. Basic analytics events for activation/retention/WTP validation.

Out of scope:
- Built-in manuscript editor.
- Web write surface.
- CLI.
- Real-time CRDT sync.
- AI prose generation.
- HWP write export unless explicitly greenlit.
- Commercial use of 부산대/나라인포테크 spellcheck before licensing is confirmed.

Non-negotiables:
- Never block data export.
- Never train on user content.
- All AI-derived canon must be marked as suggestion until user-approved.
- Local snapshots must be inspectable and exportable.
- Data-loss tests must run before any beta release.
```
