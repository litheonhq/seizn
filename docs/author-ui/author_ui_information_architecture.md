---
doc_type: ui-information-architecture
version: v1
generated_at: 2026-05-02
applies_to: Seizn Author surface (author.seizn.com or seizn.com/author)
---

# Author UI Information Architecture

> Seizn Author 작가용 surface의 *정보 구조 + 화면 위계 + navigation*. Codex 사양 7 화면 정합.

## 1. Surface 구조

```text
author.seizn.com (또는 seizn.com/author)
├── /                                    # 랜딩 (마케팅·로그인)
├── /pricing                              # 가격 (Author $39 / Pro $129 / Studio $399)
├── /dashboard                            # 로그인 후 첫 화면 (프로젝트 목록)
├── /project/{project_id}/                # IP 프로젝트 단일 surface
│   ├── inbox                             # 1. Project Import Inbox
│   ├── review                            # 2. Review Queue
│   ├── characters                        # 3. Character Card 목록
│   │   └── {character_id}                # 캐릭 단일 카드
│   ├── graph                             # 4. Relationship Graph
│   ├── timeline                          # 5. Timeline
│   ├── conflicts                         # 6. Canon Conflict Inbox
│   ├── simulate                          # 7. Scene Simulation Panel
│   ├── settings                          # 프로젝트 설정·sync·BYOK
│   └── exports                           # 옵시디언 sync·다운로드
└── /account                              # 결제·plan·사용량·BYOK key 관리
```

## 2. Navigation 위계

### Top Navigation (전역)

```text
[Logo Seizn Author]  [프로젝트 ▼]  [⚙️ 설정]  [👤 계정]  [💳 사용량]
```

* 프로젝트 dropdown = 다중 IP 작업 시 빠른 전환
* 사용량 = 토큰 cap·overage·BYOK 상태 한 줄 표시

### Project Navigation (프로젝트 진입 후)

```text
[← Dashboard]
─────────────
📥 Inbox            (검수 대기 candidate 수 뱃지)
✅ Review           (Review Queue)
👥 Characters
🕸️ Graph
🕒 Timeline
⚠️ Conflicts        (모순 candidate 수 뱃지)
🎬 Simulate
─────────────
⚙️ Settings
📤 Exports
```

* 사이드바 고정·뱃지로 작업량 시각화
* Conflicts 뱃지가 0이 아니면 빨강·주의 환기

## 3. 화면 간 데이터 흐름

```text
[Import Inbox]
   ↓ 파일 업로드 + LlamaParse + LLM extract
[Review Queue]
   ↓ 작가 승인/거부/병합/분할/scope·tier 부여
[Character Cards] [World Rules] [Relationship Graph] [Timeline]
   ↓ 캐논 promote
[Conflict Inbox] (자동 모순 검출 시)
   ↓ 작가 결정
[Scene Simulation]
   ↓ candidate 생성 + 작가 검수
[캐논 갱신 또는 폐기]
```

## 4. 사용자 모드 분기

| 모드 | 진입 경로 | UI 강조 |
|---|---|---|
| **첫 작가 (Onboarding)** | /dashboard 첫 진입 → 가이드 모달 | "기존 자료 업로드" CTA·설문 fallback |
| **활발히 작성 중** | 매일 작업 흐름 | Inbox·Review·Simulate 강조 |
| **검수 일과** | 본문 작성 후 일괄 검수 | Review·Conflicts 강조 |
| **시각화 모드** | 세계관 review·publishing 준비 | Graph·Timeline·Character 강조 |
| **시뮬레이션 모드** | 막힌 씬 풀이용 | Simulate 단독 풀스크린 |

## 5. 핵심 정보 위계 (각 화면)

### Project Dashboard
- 프로젝트 카드 그리드: title·description·entity 수·last_updated·검수 대기 수·Phase
- 신규 프로젝트 CTA
- 활동 timeline (최근 24h)

### Inbox
- 업로드된 문서 목록 (파일명·크기·파싱 상태·진행률·추출 후보 수·오류)
- 일괄 업로드 zone (drag&drop)
- 진행 중인 파싱 progress bar

### Review Queue
- 후보 카드 stack (한 번에 하나씩 또는 grid)
- 액션 버튼 (승인·거부·폐기·과거·병합·분할·캐릭 인지·작가 only)
- 단축키 안내 (A·R·T·P·M·S·K·O)
- 필터 (status·scope·tier·confidence·source·date)
- 정렬 (priority·date·confidence)

### Character Card
- 좌: 캐릭 정보 (이름·별칭·외형·페르소나·말투)
- 중: 알고 있는 사실 / 모르는 사실 / 비밀 / 작가 only (4 분리 패널)
- 우: 관계 미니그래프·최근 중요 기억·voice sample
- 하: 등장 사건 timeline mini·source provenance

### Relationship Graph
- 캐릭·조직·장소 node + 색·크기로 type·importance 표현
- edge = 관계 type + 강도·hover 시 근거 사건
- 시간 슬라이더 (D1~D35 시점별 그래프 변화)
- 클러스터 (같은 권역·동아리·기숙사)
- 줌·팬·검색

### Timeline
- 가로 스크롤·D1~D35 (또는 풀버전 D1~D140)
- Day별 사건 카드·캐릭 lane·Phase 색상
- 사건 클릭 시 영향 받은 캐릭 기억·관계·세계관 룰 강조
- 필터 (캐릭별·tier별·event 타입별)

### Canon Conflict Inbox
- 충돌 후보 목록·"A invalidates B" 시각화
- 우선순위 정렬 (critical·high·medium·low)
- 각 충돌 = 두 패널 (기존 vs 새 fact)·diff 표시
- 액션: keep_existing·keep_new·both_with_scope·merge·escalate

### Scene Simulation Panel
- 입력 패널 (씬 텍스트·등장 캐릭 multi-select·시점 picker·moods)
- 결과 패널 (각 캐릭별 candidate dialogue·thought·action·canon risk)
- 근거 패널 (어느 memory·graph edge·persona 근거)
- 액션 (승인 → canon promote·거부 → 폐기·수정 후 승인)

## 6. Empty States 룰

- 모든 화면이 *empty 상태에서 다음 액션을 선명하게 안내*
- onboarding tutorial = 첫 프로젝트·첫 업로드·첫 검수·첫 시뮬레이션 4단계

## 7. 반응형 / 디바이스

- *Desktop first* — 작가 워크플로우 데스크톱 중심
- 1280px+ 풀스크린 권장
- iPad/태블릿 = review·timeline 한정 지원
- 모바일 = read-only·검수 light 한정

## 8. 다크 모드

- 작가 야간 작업 흐름 정합
- 시스템 모드 + 수동 toggle
- 컬러 토큰: ivory·ink·dawn (Usan과 차별·Seizn 자체 톤)

## 9. 다국어 (i18n)

- 한국어 (ko) 1순위
- 영어 (en)·일본어 (ja)·중국어 번체/간체 (zh-hant/zh-hans)
- Seizn 기존 22언어 dictionary 인프라 재사용

## 10. 접근성

- WCAG AA 최소
- 키보드 navigation 전 화면
- 스크린리더 정합
- 색맹 친화 (color + icon dual encoding)
- 단축키 안내 모달

## 11. 키 user flow trigger 위치

| 작업 | 시작 위치 | 끝 위치 |
|---|---|---|
| 새 프로젝트 + KNOT 자료 import | Dashboard → Inbox | Review Queue |
| Day별 본문 추출 후 검수 | Inbox 새 candidate 알림 | Review Queue 승인 |
| 캐릭 정보 업데이트 | Character Cards | Review Queue (변경 검수) |
| 모순 해결 | Conflict Inbox 알림 | Review Queue or Conflicts |
| 막힌 씬 풀이 | Simulate (제안 출력) | Review Queue (선택 후) |
| 옵시디언 sync | Settings → Sync | (자동·실시간) |

## 12. KNOT 도그푸드 우선순위

Phase 1 출시 시 최소 화면 (MVP):
1. Dashboard (얇은)
2. Inbox
3. Review Queue
4. Character Card (read-only OK)
5. Conflict Inbox

Phase 2 추가:
- Graph (Cosmos.gl)
- Timeline
- Simulate
- 풀 Settings·Sync

→ KNOT 작업 흐름은 *Phase 1 5 화면*만으로 80% 가치 — *Inbox + Review Queue + Conflict*가 핵심.
