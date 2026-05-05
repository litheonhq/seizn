# Seizn Author Studio — Track 1: Web

**Cycle date:** 2026-05-05
**Status:** Skeleton. 다른 Claude session 이 본문 작성 예정.
**Owner session:** TBD (별 세션, 사용자가 launch 시 지정)
**Repo:** `C:\Users\admin\Projects\seizn` (기존)
**Master:** `seizn-author-master-2026-05-05.md`
**Companion tracks:**
- Track 2 (Platform): `seizn-author-track-2-platform-2026-05-05.md`
- Track 3 (Program): `seizn-author-track-3-program-2026-05-05.md`

---

> **본 doc 은 skeleton 이다.** master doc (`seizn-author-master-2026-05-05.md`) 의 Track 1 정의 + Phase -1 gate 가 lock 된 frame. 본문은 owner session 이 채운다. 작성 시 master 의 §2/§3/§4/§5 와 충돌하지 않도록 cross-check 필수.

---

## 0. 결론 한 줄 (TODO: owner session)

> Phase -1 dashboard prototype 으로 Track 3/Track 2 진입 gate 를 검증한다. Track 1 자체의 v1 surface 는 founding writer 5명이 `다음 원고에도 쓰겠다` 신호를 준 뒤 본격화한다.

---

## 1. Scope frame

다른 세션이 본문 작성 시 다음 영역을 cover:

### 1.1 Phase -1 — 7일 dashboard import + recall prototype (gate)

`/dashboard/author` 위에 manuscript import + `@recall` 검색만 얹어 founding writer 5명에게 1주 dogfood. Tauri 데스크톱 (Track 3) 진입 *전제*.

**Gate (master §3 / Track 3 doc §13 와 동일):**
- 5명 중 3명 이상 `다음 원고에도 쓰겠다`
- 2명 이상 월 ₩9,900 이상 WTP
- 첫 useful recall ≤ 10분
- critical hallucination 0건

미달 시 Track 1 Phase -1 iterate, Track 3 Phase 0 보류.

### 1.2 Phase 0 — dashboard 강화 (Track 3 desktop alpha 와 병행)

- 기존 dashboard redesign cycle (1차 + 2차) 위에 manuscript import 영구화
- `@recall` 검색 부 진보
- founding writer cohort 의 web 보완 흐름 (모바일 read 등)
- WTP 검증 결과 반영한 가격 split test (Track 3 § 12.2 참조)

### 1.3 Phase 1+ — 협업 / 공유 / web read parity

- shared canon bible (출판사·매니지먼트 view, Track 3 Studio Publisher tier 와 cross-track)
- reviewer seat (Studio Publisher tier)
- public author profile (deferred 후보)
- Track 3 Vault 데이터의 web read parity (Phase 2+)
- Track 3 의 자체 에디터 출시 후 web write parity (Phase 3+)
- mobile read view (반응형 또는 Tauri mobile 별 진입)

---

## 2. 페르소나 (TODO: owner session 이 detail 추가)

master §2 의 Track 1 정의 그대로:

- KR mainstream 작가 (web GUI 선호, 데스크톱 다운로드 대신)
- 출판사·스튜디오·매니지먼트 협업자 (B2B, Studio Publisher tier)
- 모바일 read 작가 (출퇴근/이동 중 read)

---

## 3. Stack (TODO: owner session 이 detail 추가)

기존 그대로:

- Next.js 15 App Router
- React 19 + Tailwind v4
- 기존 dashboard redesign cycle 의 `.dashboard-redesign` warm paper-tone palette
- `useAuthorMemoryV3` SWR hooks
- Vercel auto deploy (preview deploy 금지 per global rule)

신규 (owner session 결정):

- shared canon bible 의 RBAC / sharing 모델
- public author profile 의 SEO 처리
- mobile read view 반응형 또는 PWA

---

## 4. UI / UX (TODO: owner session 이 detail 추가)

- 기존 1차 + 2차 dashboard redesign cycle palette 그대로
- Track 3 의 §10 / §11 (UI / UX 방향) 와 일관성 유지 — 같은 brand
- Toss-tier UX 원칙 (Track 3 § 11.1) 적용

---

## 5. 가격 (KRW, master § 2 / Track 3 § 14 와 통합)

| Plan | 월 | 연 | 포함 |
|---|---|---|---|
| Free | ₩0 | — | (Track 3 와 동일 단일 결제 instrument) |
| Pro | ₩12,900 | ₩99,000 | (Track 3 와 동일) |
| Pro Plus | ₩24,900 | — | (Track 3 와 동일) |
| Studio Publisher | ₩99,000+ | custom | reviewer seat / shared canon bible / web 협업 표면 (Track 1 영역) |

가격 원칙은 Track 3 § 14 와 동일.

---

## 6. Phase plan (TODO: owner session 이 detail 추가)

### Phase -1 (7일)

Phase -1 dashboard prototype task pack. Track 3 Phase 0 진입 gate.

### Phase 0 (Track 3 Phase 0 와 병행, 30일)

dashboard 강화 + founding writer 의 web 보완 흐름.

### Phase 1+ (60일+)

협업 / 공유 / web read parity / mobile read.

---

## 7. Cross-track 의존 / 협업

### 7.1 Track 1 이 Track 2 에 요청

- `/api/v1/projects/{id}/recall?q=<name>` — dashboard 의 `@recall` 검색
- API key 발급 dashboard (`/dashboard/account/api-keys`) 의 web UI
- Stripe metered billing 의 사용자 dashboard view

### 7.2 Track 1 이 Track 3 에 제공

- Phase -1 founding writer cohort → Track 3 Phase 0 alpha tester transfer
- Phase 1 가격 split test 결과 → Track 3 가 적용
- Phase 3 web read parity 표면 → Track 3 Vault 데이터의 web view

### 7.3 Track 1 이 절대 안 하는 것 (master §4.1)

- `seizn-desktop/` 전체 touch X
- `packages/mcp-server/` 내부 touch X
- `engine.seizn.com` (NPC SDK) 영역 touch X

---

## 8. Anti-goals (Track 1)

master § 4.4 의 3-track 공통 anti-goals 그대로 적용.

추가 Track 1 specific:

- 기존 dashboard redesign cycle 의 1차 + 2차 cycle 결과 회귀 X (testing)
- preview 배포 금지 per global rule (production 만)
- Tauri / desktop 영역 touch X (Track 3 영역)
- API endpoint duplicate 정의 X (Track 2 통과)

---

## 9. Open questions (TODO: owner session 이 답변)

1. Phase -1 prototype 의 dashboard 위치 — `/dashboard/author` 위에 직접 vs 별 `/dashboard/author/prototype` 가드?
2. founding writer recruit channel — 나비계곡 외 어디?
3. founding writer 인터뷰 일정 / 형식 (zoom 30분 vs 비동기 google form)?
4. 가격 split test 의 RNG 분기 / metric 정의
5. shared canon bible 의 RBAC 모델 (작가-편집자-PD-기획자 권한 분리)
6. mobile read view 의 반응형 vs PWA vs Tauri mobile (Track 3 와 cross-track) 결정 시점

---

## 10. Build agent handoff (TODO: owner session 이 작성)

owner session 이 본 doc 본문 작성 후 작성. Track 3 doc § 18 의 형식 mirror.

---

## 11. 다음 액션 (owner session)

1. 본 skeleton 의 TODO 영역을 본문으로 채우기
2. master § 2 Track 1 정의와 cross-check
3. Phase -1 prototype task pack (`seizn-author-track-1-phase-minus-1-task-pack-2026-05-05.md`) 작성
4. 사용자에게 launch 메시지 전달 후 implementation cycle 시작

---

*End of Track 1 skeleton. 본문 채움 시 본 frame 변경하지 말고 each section 의 TODO 안만 채울 것. Frame 자체 변경 필요 시 master 갱신 후 진행.*
