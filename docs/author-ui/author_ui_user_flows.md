---
doc_type: ui-user-flows
version: v1
generated_at: 2026-05-02
applies_to: Seizn Author 핵심 사용자 흐름
---

# Author UI User Flows

> 작가의 *핵심 워크플로우 8개*. 각 flow는 trigger·step·decision·outcome.

---

## Flow 1: 신규 작가 — KNOT 자료 일괄 import (D 양식)

**Trigger**: 첫 가입 + 30일 trial 시작

```text
1. 신용카드 등록 → trial activate
2. /dashboard 진입 → "+ 새 프로젝트" CTA
3. 프로젝트 생성 모달:
   - 프로젝트 이름: "KNOT 단편 1"
   - 설명: "청학여고 미스터리"
   - 첫 스코프: short1
4. 프로젝트 진입 → /project/{id}/inbox
5. 가이드 모달: "기존 자료를 끌어다 놓으세요"
6. 작가가 옵시디언 폴더 zip 업로드 (canon.md·INDEX.md·worldbuilding/·stories/·briefs/ 포함)
7. 옵션 모달:
   - 「① AI 자동 분석 (권장)」 vs 「② 그대로 저장」
   - 작가 ① 선택
8. LlamaParse 파싱 + Opus 4.7 entity·relationship·event 추출
9. 진행률 표시 + 추출 candidate 수 누적
10. 추출 완료 → "검수 대기 N건. 검수하러 가기" 버튼
11. → /project/{id}/review
```

**Outcome**: 프로젝트 + 추출 candidate 수백 건 ready·작가 검수 모드 진입.

**예상 시간**: 5~15분 (파일 크기·candidate 수에 따라)

---

## Flow 2: 검수 일과 (Review Queue 작업)

**Trigger**: Inbox에서 신규 candidate N건 알림

```text
1. /project/{id}/review 진입
2. 필터 설정: status=candidate · scope=short1 · sort=priority
3. 첫 카드 로드:
   - "허 사서는 도서관 4시 메모를 D4에 노출했다"
   - 근거: stories/short1/prefweek/d4.md L120~125
   - LLM 제안: status=canon·tier:1·category:event
4. 작가 키 입력:
   - A (승인) → 캐논 promote → 다음 카드
5. 다음 카드:
   - "허 사서는 자허이며 삼족오위 OB이다"
   - 근거: canon.md §허 사서 INTERNAL ONLY
   - LLM 제안: status=author_only + forbidden_in_scope:short1
6. 작가 키 입력:
   - O (작가 only) → 자동 forbidden_in_scope:short1 tag 부여 → 다음
7. 다음 카드:
   - "타오 과장은 여성이다" (어디선가 추출된 옛 표현)
   - LLM 제안: status=contradicted (v3.7.9x 남성 lock과 모순)
8. 작가 키 입력:
   - X (충돌 격상) → Conflict Inbox로 → 다음
... (반복)
9. 50~80 카드 검수 후 "오늘 검수 완료" 알림
```

**Outcome**: candidate → canon/rejected/retired/author_only/contradicted 분류 완료. 캐릭·세계관 그래프·timeline 자동 갱신.

**예상 시간**: 50건 × 8초 = ~7분 (작가 키보드 워크플로우 정합 시)

---

## Flow 3: 모순 해결 (Conflict Inbox)

**Trigger**: critical conflict 알림 (top nav 빨강 뱃지)

```text
1. /project/{id}/conflicts 진입
2. critical 충돌 1건 표시:
   - 기존: "타오 과장 = 여성" (canon, valid_at 2026-04-15)
   - 새 fact: "타오 과장 = 남성" (extracted from canon.md v3.7.9x lock)
   - LLM 해석: "v3.7.9x에서 남성 확정·기존 여성 표기 정정"
   - 영향: 단편 1 본문 D29 묘사·관계 매트릭스 4건
3. 작가 결정 모달:
   - 옵션 ④ "기존을 invalidated·새를 canon" 선택
4. 시스템 동작:
   - 기존 fact: status = invalidated·invalidates_id = 새 fact id
   - 새 fact: status = canon
   - supersedes/invalidates 그래프 edge 자동
   - 영향 받은 본문 D29 묘사 검수 큐 추가
5. → /project/{id}/review (영향 본문 검수)
```

**Outcome**: 모순 해결·이력 보존·영향 본문 자동 검수 큐 등록.

---

## Flow 4: 일일 본문 작성 후 추출·검수

**Trigger**: 작가가 D21 본문 (외부 옵시디언) 작성 완료

```text
1. 옵시디언 ↔ Seizn sync (Yjs·실시간 또는 파일 변경 감지)
2. Seizn이 D21 본문 신규 detect
3. 자동 LLM extract → 신규 candidate 등록
4. Inbox 알림 (top nav 뱃지)
5. 작가 → /inbox → 검수 진입
6. (Flow 2 반복)
7. 새로 추출된 캐릭 인지 (예: "룰루는 D21에 명부 회장 이름이 비어 있음을 처음 알게 됨")
   - 작가 K (캐릭 인지 부여) → character_known:lulu·learned_at:D21
8. timeline·graph 자동 갱신
```

**Outcome**: D21 본문 → candidates → 검수 → 캐논 promote → timeline·graph·character knowledge state 모두 갱신.

---

## Flow 5: 막힌 씬 시뮬레이션

**Trigger**: 작가가 D29 (타오 사망 직후) 룰루 반응 모름

```text
1. /project/{id}/simulate 진입
2. 씬 입력:
   - 텍스트: "타오 과장이 어제 저녁 죽었다는 소식이 동아리실에 퍼졌다."
   - setting: 동아리실·D30 아침·우중충
   - characters_present: [sori, nari, lulu, aoi, reika, nana, yui]
   - timepoint: D30·morning
   - pressure: "타오 사망 직후·동아리원 첫 반응"
   - perspective: 룰루
   - candidate_count: 5
3. "시뮬레이션 실행" 클릭
4. Opus 4.7 호출 + memory/graph context 주입:
   - 룰루 페르소나 (호기심·친근 침범·말 빠름)
   - 룰루 D1~D29 시즌 메모리 (타오 과장 직접 만남 X·소식만)
   - 룰루 ↔ 타오 관계 (없음)
   - 룰루 voice signature (외래어 X·큰따옴표 X)
5. 5 candidate 출력:
   - candidate 1: dialogue "어, 진짜? 사야카 다음에 또?·..."
     - thought: "...명부 회장 자리 비어 있는 거랑 관련 있나?"
     - action: 짧은 정적 후 다른 사람들 표정 살핌
     - canon_risk: low (사야카 명명 D25 이미 노출·OK)
     - 근거: D25 사야카 사건·룰루 호기심 페르소나·룰루 D21 명부 빈 줄 인지
   - candidate 2~5: variations
6. 작가 검토:
   - candidate 1·3 마음에 듬 → 둘 다 review queue 등록·"수정 후 본문 작성"
   - candidate 2·4·5 거부
7. 작가가 옵시디언에 D30 본문 작성 → candidate 1 톤 차용
```

**Outcome**: 작가 막힘 풀림·candidate 2개 review queue·본문 작성 가속.

**예상 시간**: 시뮬레이션 30초 + 작가 검토 2~3분.

---

## Flow 6: 캐릭 정보 직접 편집

**Trigger**: 작가가 룰루 페르소나에 새 디테일 추가하고 싶음 (예: 좋아하는 음식)

```text
1. /project/{id}/characters/lulu 진입
2. "페르소나" 탭 → "취향" 섹션
3. 인라인 편집: "좋아하는 음식: 도깨비 어묵 (특히 단단한 어묵)"
4. 저장 클릭
5. 시스템:
   - 기존 fact와 모순 검사 → 모순 X
   - 작가 직접 입력 = candidate 단계 skip 옵션 (작가 신뢰)
   - 또는 review queue에 등록 (audit 정합·옵션)
6. 캐릭 카드 즉시 갱신
```

**Outcome**: 룰루 카드에 음식 취향 추가·simulation 시 활용 가능.

---

## Flow 7: 옵시디언 양방향 sync 설정

**Trigger**: 첫 프로젝트 생성 후

```text
1. /project/{id}/settings 진입
2. "Sync" 탭 → "옵시디언 연결"
3. 옵션:
   - Vault 경로 (로컬 패스 입력 또는 cloud 경로)
   - Sync 방향: 양방향·옵시디언→Seizn only·Seizn→옵시디언 only
   - 충돌 해결: soft (사본 보존) / hard (작가 결정 모달)
   - 동기화 주기: 실시간 (Yjs)·N분마다·수동
4. 인증·권한 (옵시디언 plugin 또는 desktop bridge)
5. 첫 sync: vault → Seizn 일괄 import (Flow 1과 유사)
6. 이후: 변경 자동 감지·반영
```

**Outcome**: 작가가 옵시디언에서 작업해도 Seizn 자동 갱신·반대 방향도 가능.

---

## Flow 8: Replay·trace 검증 (QA·Eval)

**Trigger**: 작가가 어제 시뮬레이션 결과를 재생산 가능한지 확인

```text
1. /project/{id}/simulate → "최근 실행" 패널
2. 어제 시뮬레이션 클릭
3. "Replay" 버튼
4. 시스템:
   - 동일 입력·동일 memory snapshot hash·동일 provider metadata
   - LLM 호출 X (cache hit 강제)
   - 동일 candidate 5개 출력 (output hash 검증)
5. 결과:
   - "Replay 성공·deterministic" 또는 "Replay 실패·{원인}"
6. 작가가 *예상한 동작*을 확인·QA 정합
```

**Outcome**: provider drift 없이 reproducibility 보장·eval 케이스에 활용 가능.

---

## 시간 budget

각 flow 작가 시간:
- Flow 1 (첫 import): 5~15분 (1회)
- Flow 2 (검수 일과): 5~10분/day
- Flow 3 (모순 해결): 1~5분 (간헐)
- Flow 4 (일일 추출): 5~10분/day
- Flow 5 (시뮬레이션): 2~5분/씬·필요 시
- Flow 6 (직접 편집): 30초~2분
- Flow 7 (sync 설정): 5분 (1회)
- Flow 8 (replay): 1분/검증

→ *전형적 작가 일과 = 검수 + 본문 + 시뮬레이션*에 ~30분/day 투자 (Sudowrite·NovelCrafter 활용 작가의 시간 budget과 비슷).

## 핵심 UX 원칙

1. **검수가 작가 작업 흐름에 끼지 않게** — 키보드 단축키·일괄·skip 가능
2. **작가 결정이 항상 우선** — LLM 제안은 *제안*·자동 canon 0
3. **모든 candidate에 근거 표시** — source·excerpt·confidence
4. **모순은 surfacing·자동 해결 0** — 작가만 결정 권한
5. **author_only 보호** — leak 자동 검출·warning
