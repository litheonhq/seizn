---
doc_type: ui-empty-error-states
version: v1
generated_at: 2026-05-02
applies_to: Seizn Author 7 화면 + 일반 상태
---

# Author UI Empty / Error States

> 각 화면의 *empty·error·loading·partial 상태 + 복구 액션*. UX의 "있는 화면" 만큼 중요한 "없는 화면".

## 0. 일반 상태 룰

- **모든 empty state 는 *다음 액션*을 명확히** — "지금 뭐 해야 하지?" 답을 제공
- **모든 error 는 *원인 + 복구 방법*을 표시** — 최소 1개 액션
- **loading 은 *언제 끝날지* 표시** — progress·estimated time·현재 진행 단계
- **partial 은 *왜 부분이고 무엇이 누락*인지 표시**

## 1. Project Dashboard

### Empty (첫 가입)
```text
🌱 첫 프로젝트를 시작하세요

기존 작품·세계관·캐릭터 자료를 가져오거나 처음부터 만들 수 있습니다.

[+ 새 프로젝트 만들기]    [샘플 프로젝트 둘러보기]

도움이 필요하면 [가이드 보기]
```

### Loading
- 프로젝트 카드 skeleton (3~6개)·상단 메트릭 skeleton

### Error
```text
⚠️ 프로젝트를 불러올 수 없습니다

원인: 네트워크 오류 또는 서버 응답 없음

[다시 시도]    [상태 페이지 보기]    [지원 문의]
```

---

## 2. Inbox (Project Import Inbox)

### Empty (첫 진입)
```text
📥 자료를 끌어다 놓으세요

지원 포맷: .md  .docx  .pdf  .txt  .json  Notion 익스포트  Obsidian Vault

       ┌───────────────────────┐
       │  드래그 & 드롭         │
       │  또는 [파일 선택]      │
       └───────────────────────┘

처음이라면 [샘플 KNOT 프로젝트 import] 로 빠르게 체험
```

### Empty (모두 검수 완료)
```text
✅ 모든 자료 검수 완료

새 자료 업로드 또는 본문 작성 후 자동 추출이 진행됩니다.

[+ 새 자료 업로드]    [Review Queue 종합 보기]
```

### Loading (파싱 중)
```text
📄 {파일명} 파싱 중...
   ▓▓▓▓▓▓▓░░░░░░░░ 47% · 예상 30초 더

📄 {다른 파일} 추출 중 ...
   ▓░░░░░░░░░░░░░░ 5% · 예상 2분 더

[모두 취소]
```

### Error (파싱 실패)
```text
❌ {파일명} 파싱 실패

원인: 손상된 파일 또는 지원하지 않는 포맷

복구:
[다시 시도]   [수동 텍스트 붙여넣기]   [그대로 저장 (A 양식)]   [건너뛰기]
```

### Error (LLM extract 실패)
```text
⚠️ {파일명} 추출 실패

원인: API 토큰 한도 초과 또는 LLM 일시 오류

복구:
[다시 시도]   [BYOK 키 등록]   [그대로 저장 (A 양식)]   [Plan 업그레이드]
```

### Partial (일부만 추출 완료)
```text
🟡 {파일명} 부분 추출

✅ 47/82 섹션 완료
⚠️ 35/82 섹션 실패 (token 한도 초과)

[이어서 진행 + 추가 토큰 사용]   [현재까지 검수]   [건너뛰기]
```

---

## 3. Review Queue

### Empty (검수 대기 0건)
```text
🎉 검수 완료!

오늘 N건 처리 완료.

[+ 새 자료 업로드]   [본문 작성 시작]   [다른 프로젝트로 이동]
```

### Empty (필터로 0건)
```text
필터에 일치하는 후보가 없습니다.

[필터 초기화]   [필터 조정]
```

### Loading (LLM 호출 진행 중)
```text
🔄 candidate 분석 중...
```

### Error (네트워크)
```text
⚠️ 검수 큐 동기화 실패

마지막 검수 시점: 14:22

[재연결]   [오프라인 모드로 진행]
```

오프라인 모드: 작가 결정은 로컬 캐시·복귀 시 sync.

---

## 4. Character Card

### Empty (캐릭 없음)
```text
👤 등록된 캐릭터가 없습니다

[+ 캐릭 직접 추가]   [Review Queue에서 추출하러 가기]   [인터뷰 fallback 시작]
```

### Empty (특정 캐릭 정보 부족)
```text
"{캐릭}"의 정보가 부족합니다.

부족한 항목:
- 페르소나 (말투·취향·동기)
- 관계 (다른 캐릭과의 관계 0건)
- 메모리 (등장 사건 0건)

[인터뷰 fallback 시작]   [관련 자료 업로드]   [수동 입력]
```

**인터뷰 fallback prompts**:
- 이 캐릭이 가장 두려워하는 것은?
- 가장 원하는 것은?
- 말투의 특징은?
- 좋아하는 것·싫어하는 것은?
- 다른 어떤 캐릭과 관계가 있나요?
- 비밀은?

### Error (시뮬레이션 시 페르소나 부족)
```text
⚠️ "{캐릭}"의 페르소나 정보가 부족해 시뮬레이션 결과가 불안정할 수 있습니다.

권고: Character Card에서 다음 항목 보강 후 재시도
- 말투 시그니처
- 욕망·동기
- 관계 (최소 2~3 캐릭)

[그대로 진행 (낮은 정확도)]   [인터뷰로 보강]   [취소]
```

---

## 5. Relationship Graph

### Empty (entity 없음)
```text
🕸️ 관계 그래프가 비어 있습니다

검수가 진행되면 그래프가 자동으로 풍부해집니다.
현재 0개 entity · 0개 관계.

[Review Queue로 이동]   [수동 entity 추가]
```

### Empty (필터로 0개)
```text
필터 조건에 맞는 entity가 없습니다.

[필터 초기화]
```

### Partial (entity 적음)
```text
N개 entity · M개 관계

📌 그래프가 더 풍부해지려면 검수를 N건 더 진행하세요.
```

### Error (Cosmos.gl 렌더 실패)
```text
⚠️ 그래프 렌더링 실패

원인: 브라우저 GPU 미지원 또는 메모리 부족

[CPU 모드 (Sigma.js)로 전환]   [브라우저 새로고침]   [작은 부분 그래프만 표시]
```

---

## 6. Timeline

### Empty (사건 없음)
```text
🕒 timeline이 비어 있습니다

검수된 사건이 추가되면 자동 표시됩니다.

[Review Queue로 이동]   [+ 사건 직접 추가]
```

### Empty (특정 시점에 사건 없음)
```text
{Day 범위}에 추출된 사건 없음.

[전체 timeline 보기]   [본문 추가 또는 검수]
```

---

## 7. Conflict Inbox

### Empty (충돌 없음)
```text
✨ 충돌 없음. 캐논 정합 OK!

검수가 진행될수록 자동 모순 검출이 활성됩니다.

[Review Queue로 이동]   [Canon Authority Rules 보기]
```

### Critical Alert (강조)
```text
🔴 critical 충돌 1건

타오 과장 성별 모순 (canon vs new fact)

[즉시 결정하기]
```

---

## 8. Scene Simulation Panel

### Empty (첫 사용)
```text
🎬 씬 시뮬레이션

막힌 씬에 캐릭 반응 candidate를 받아보세요.

[샘플 시뮬레이션 보기]   [KNOT D29 데모]   [씬 입력 시작]
```

### Loading (실행 중)
```text
🤖 시뮬레이션 실행 중...

   ▓▓▓▓▓▓▓░░░░░░ 60% · 예상 15초 더

   현재 단계: 룰루 시즌 메모리 컨텍스트 구성 중
   사용 토큰: ~12,000 / 15M (이번 달)

[실행 취소]
```

### Error (LLM 실패)
```text
⚠️ 시뮬레이션 실행 실패

원인: API 토큰 한도 초과

복구:
[BYOK 키 등록 (무제한)]   [Pro tier 업그레이드]   [Sonnet 4.6 fallback (단일 모델 룰 위반·관리자 옵션)]
```

### Empty (캐릭 정보 부족)
```text
{캐릭}의 페르소나 정보가 부족해 시뮬레이션이 신뢰할 수 없습니다.

[Character Card 보강하러 가기]   [그대로 진행 (낮은 정확도)]
```

### Partial (일부 candidate 만 통과)
```text
5개 후보 생성·3개만 canon-safe

⚠️ 2개는 author_only fact leak 의심:
- candidate 2: 'D8 콜드 오픈에서 자서가가 발현됨' (Tier 2 leak·자서가 미공개)
- candidate 4: '허 사서가 삼족오위와 관련' (Tier 2 leak)

[3개 안전한 candidate 보기]   [경고 무시하고 5개 모두 보기]
```

---

## 9. Account / Settings

### Empty (BYOK 미등록)
```text
🔑 자기 API 키 등록 (BYOK)

자기 Anthropic API 키를 등록하면:
- Seizn 가격 50% 할인
- 토큰 무제한 사용

[Anthropic 키 등록]   [건너뛰기 (Seizn 토큰 사용)]
```

### Error (BYOK 키 invalid)
```text
⚠️ Anthropic API 키 확인 실패

원인: 키 형식 오류 또는 만료·권한 부족

[다시 입력]   [Anthropic Console 열기]   [지원 문의]
```

---

## 10. Sync (옵시디언·노션)

### Empty (sync 미설정)
```text
🔗 옵시디언·노션 연결

옵시디언 vault 또는 노션 페이지를 연결하면 양방향 sync.

[옵시디언 vault 연결]   [노션 워크스페이스 연결]   [건너뛰기]
```

### Loading (sync 진행)
```text
🔄 sync 진행 중...
last sync: 5분 전 · 변경 detect: 12건
```

### Error (sync 실패)
```text
⚠️ 옵시디언 sync 실패

원인: vault 경로 변경 또는 권한 부족

[경로 다시 설정]   [권한 재요청]   [수동 sync]
```

### Conflict (sync 충돌)
```text
⚠️ {파일명}에 sync 충돌

옵시디언 변경 시각: 14:32
Seizn 변경 시각: 14:35

[옵시디언 변경 수용]   [Seizn 변경 수용]   [둘 다 보존 (사본 생성)]   [수동 merge]
```

---

## 11. 일반 시스템 상태

### Offline
```text
🌐 오프라인 모드

저장은 로컬에·복귀 시 자동 sync.

[연결 재시도]
```

### 만료 (trial 종료 임박)
```text
⏰ 30일 무료 체험·앞으로 3일 남음

[지금 결제]   [Trial 연장 요청]
```

### 유지보수
```text
🔧 시스템 점검 중

예상 종료: 2026-05-15 03:00 KST

[상태 페이지]
```

## 12. 메시지 톤 룰

- 한국어: 친절·간결·존댓말
- 부정적 메시지: 원인 + 해결책 동시 표시·작가 비난 X
- 액션 버튼: 동사 first ("다시 시도"·"검수하러 가기")
- 이모지: 화면 첫 인상에 1개·과용 X
- 색상 stress: 빨강 (error·destruct)·노랑 (warning·partial)·녹색 (success)·파랑 (info)·회색 (neutral·empty)
