---
doc_type: canon-authority-rules
version: v1
generated_at: 2026-05-02
project: KNOT
applies_to: Seizn Author Memory v3 ingestion + review pipeline
---

# Canon Authority Rules

> Seizn이 KNOT 자료를 ingest·extract·review·promote할 때 적용하는 *우선순위·충돌 해결·폐기 룰*.

## 1. 우선순위 계층 (충돌 시 상위가 승)

```text
1순위. 사용자 최근 본문 수정 (stories/short1/**/*.md commit 시각 = 권위)
2순위. decisions.md 최신 블록 (날짜 역순·v버전 lock)
3순위. canon.md 요약 (rolled-up summary)
4순위. worldbuilding/short1-characters.md + glossary/ 카드
5순위. 보조 시트 (day-sheet·scene-sheet·free-slot-catalog)
6순위. 캐릭 페르소나 brief (briefs/character_personas/*.md)
7순위. 인터뷰·아카이브 (artifacts/·archive/) — 폐기 reference only
```

**핵심 룰**:
- *최신 본문이 시트의 옛 표현을 자동 폐기*. 시트가 락 표현이라도 본문에서 새 표현이 박히면 본문이 승.
- *decisions.md가 canon.md와 충돌하면 decisions.md 최신 블록이 승*. canon.md는 rolled-up summary로 stale 가능.
- *날짜·버전 모두 가장 최근이 승*. 같은 날 다중 수정이면 git commit 시각으로 결정.
- *git commit 메시지 + 사용자 직접 인용 (대화 로그)이 충돌 시 사용자 최신 구두 지시가 승*.

## 2. Scope 우선순위 (작품별 설정 격리)

KNOT는 *본편 + 단편 1·2·3 + 소설* 다중 작품. 같은 캐릭·세계관도 작품별로 다른 scope이 적용됨.

| Scope | 식별 토큰 | 적용 범위 |
|---|---|---|
| `global` | (scope 미표시) | 모든 작품 공통 — 차원 구조·천주제국·천주칠금·십장생·13 초월체 등 |
| `main` | `worldbuilding/character-折.md`·`stories/main-episodes.md` | 본편 (KNOT) 한정 — 8동료 여성 확정·헬멧 폐기·결 정체 등 |
| `short1` | `stories/short1-school.md`·`worldbuilding/short1-*.md`·`stories/short1/**/*` | 단편 1 (제3안내문) 한정 — 청학여고·소리·도깨비 첫 만남·허 사서 등 |
| `short2` | `stories/short2-manager.md` | 단편 2 (관리자) 한정 |
| `short3` | `stories/short3-liar.md` | 단편 3 (거짓말쟁이) 한정 |

**핵심 룰**:
- *추출된 fact는 반드시 scope 표시 부착*. scope 누락 시 review queue에서 작가에게 scope 묻기.
- *scope 충돌 = 자동 invalidation X*. 같은 캐릭이라도 단편 1·본편에서 다른 모습일 수 있음 (예: 헬멧 = 본편 폐기·단편 1·2·3에는 적용 가능).
- *현재 KNOT dogfood Phase 1 = short1 scope 한정*. 본편·단편 2·3 자료는 ingest해도 short1 dogfood eval에는 미사용.

## 3. 폐기 / 금지 / 미정 양식

추출된 fact는 다음 4개 상태 중 하나:

| 상태 | 의미 | Seizn status 매핑 |
|---|---|---|
| `current` | 현재 캐논·활성 | `canon` |
| `retired` | 명시적 폐기·이전엔 캐논이었음 | `retired` |
| `forbidden_in_scope` | 본문 노출 금지 (작가 only) | `author_only` + scope 표시 |
| `tbd` | 미정·결정 대기 | `candidate` (보류) |

**폐기 마커 패턴 (canon.md·decisions.md에서 탐지)**:
- "폐기" / "X 폐기" / "v{N} 폐기"
- "구 X / 신 Y"
- "더 이상 사용 X"
- "deprecated"
- "지금은 X"

**금지 마커 패턴 (단편 1 본문 노출 금지)**:
- "본문 노출 금지"
- "본문 X"
- "단편 1 본문에 X 금지"
- "INTERNAL ONLY"
- "Tier 2 (작가 only)"

## 4. 본편/단편 scope 함정 — Critical 룰

다음은 *2026-04-25 헬멧 오독 사건* 같은 실수를 방지하는 룰:

| 설정 | scope | 함정 |
|---|---|---|
| 헬멧 폐기 (대장 맨 얼굴) | `main` 한정 | 단편 1·2·3 캐릭에 자동 적용 X |
| 8동료 전원 여성 | `main` 한정 | 단편 1 7인은 별도 (실제로 단편 1도 7인 모두 여성·우연일 뿐) |
| 대장 = 13번째 초월체·결 | `main` 한정 | 단편 1 소리는 별도 정체 (자서가)·복합 떡밥 |
| 도깨비 삭 조건·청월 사건 | `global` (캐논) but `forbidden_in_scope=short1,2,3` | 본문 노출 금지 |
| 허 사서 = 자허·삼족오위 | `global` (캐논) but `forbidden_in_scope=short1` | 단편 1 본문 X |
| 도서관장 = 월주 | `global` (캐논) but `forbidden_in_scope=short1` | 단편 1 본문 X |

**룰**: scope 표시 없이 "X는 Y이다" 단정 X. *반드시* scope·forbidden_in_scope 명시.

## 5. 충돌 해결 알고리즘 (LLM-driven)

새 fact 추출 시:

```text
1. 같은 entity의 기존 valid edges 가져오기
2. LLM에 prompt:
   "기존 fact: {existing}
    새 fact: {new}
    이 둘은 (a) 보완 (b) 모순 (c) 시점 차이 (d) scope 차이 중 무엇인가?"
3. (a) 보완 = 새 fact를 추가·기존 보존
4. (b) 모순 = 작가에게 surface (review queue 충돌 inbox·자동 invalidate X)
5. (c) 시점 차이 = 기존 fact의 invalid_at = 새 fact의 valid_at (bi-temporal supersession)
6. (d) scope 차이 = 별도 scope 태그 부착·둘 다 보존
```

**자동 invalidate 금지 룰**:
- *어떤 fact도 작가 승인 없이 자동 invalidated 처리 X*. Graphiti의 자동 invalidation은 *제안*만·실제 invalidate는 작가 승인 후.
- 단, decisions.md의 명시적 *"폐기"* 마커 + supersedes 관계는 자동 retired 처리 OK.

## 6. 본문 vs 작가 메타 분리

추출 대상 자료는 두 종류:

| 종류 | 처리 양식 | 예시 |
|---|---|---|
| **Narrative content** | 자동 entity·relationship·event 추출 (D 양식) | stories/short1/prefweek/d1.md 본문·worldbuilding/*.md |
| **Author meta** | raw 보존 (A 양식)·entity 추출 X | decisions.md·planning/*.md·tasks.md |

**판정 룰**:
- 파일에 narrative prose (대사·서술)가 있으면 narrative content
- 파일이 결정 로그·할 일 리스트·메타 토론이면 author meta
- 작가가 본인 의견 표명한 부분 (`<!-- INTERNAL -->`·"내부 결정") = author meta

## 7. Tier 1·2 떡밥 분리 (foreshadowing.md 핵심)

| Tier | 의미 | Seizn 처리 |
|---|---|---|
| **Tier 1** | 작가 + 일부 캐릭터가 알고·플레이어에게 점진 노출 | `character_known` (해당 캐릭) + `canon` |
| **Tier 2** | 작가만 아는 사실·캐릭터 모두 모름 | `author_only` + `character_unknown` (전 캐릭) |

**룰**: Tier 2 fact는 *어떤 캐릭 시즌 메모리에도 추가 X*. simulation에서 캐릭 thought·dialogue로 절대 leak되지 않아야 함.

## 8. 신선도 (Recency) 룰

`updated_at` 기반:

| 신선도 | 가중치 |
|---|---|
| < 24시간 | 1.0 |
| < 7일 | 0.95 |
| < 30일 | 0.85 |
| < 90일 | 0.7 |
| > 90일 | 0.5 |

* recency × confidence × scope_match = retrieval 점수
* 매우 오래된 fact는 *re-verify* 큐에 자동 등록 (작가가 재확인)

## 9. 사용자 최신 구두 지시 룰

대화 로그·사용자 직접 인용은 *모든 파일보다 우선*. 단:
- *최근 1시간 내* 발화에 한정 (그 이후는 파일 commit 또는 decisions.md에 박힐 거라 가정)
- 모순 시 작가에게 *"이 발화를 캐논으로 박을까요?"* surface

## 10. Re-extraction 트리거

다음 이벤트 시 자동 re-extract:
- 원본 파일 git commit (mtime 변경)
- decisions.md 새 블록 추가
- 작가가 review queue에서 다중 reject (extraction prompt 재튜닝 신호)
- canon.md 갱신 (rolled-up summary 재정합)

## 11. KNOT 특수 룰 요약 (canon-verify hook 정합)

* 본편 8동료 = 본편 한정·단편에 적용 X
* 헬멧 폐기 = 본편 한정
* 도깨비 = 선주민 X·달의 위상 이계 유입
* 초월체 = 정확히 13명
* 천주칠금 = 7개 (제3금 = 하늘을 가르지 말것·제4~7금 미정)
* 단편 1 데모 = D1~D35·5주·D1=2/20금·D11=3/2월 입학식·D29=3/20금 타오 사망·D35=3/26목 보스전
* 자유 슬롯 = 11 Day (D15~D17·D22~D24·D28·D30~D33)
* 큰따옴표 X·외래어 음차 X (엣또·Yes·Ok 등)
* narrative = monologue + dialogue + cue (`[bg/se/show]`). narration은 작가 메타·게임 런타임 X (v4 양식)

---

**핵심 원칙**: *Seizn은 candidate를 추출·작가가 승인할 때만 canon. 자동 promote 금지*.
