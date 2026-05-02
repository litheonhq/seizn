---
doc_type: review-taxonomy
version: v1
generated_at: 2026-05-02
applies_to: Seizn Author Memory v3 review queue + state machine
---

# Review Taxonomy

> Seizn 검수 큐의 *상태 vocabulary + 전이 룰 + UI 액션*. Codex 사양 정합.

## 1. 핵심 상태 (Status)

| Status | 의미 | UI 표시 | 다음 가능 상태 |
|---|---|---|---|
| `candidate` | 추출 직후·작가 검수 대기 | 🟡 검수 대기 | canon, rejected, retired, past_only, contradicted, invalidated |
| `canon` | 작가 승인·현재 캐논 | ✅ 캐논 | retired, contradicted, past_only |
| `rejected` | 작가 거부·noise | ❌ 거부 | candidate (재추출 시) |
| `retired` | 명시적 폐기·이전엔 캐논이었음 | 🪦 폐기 | (terminal — 영구 보존, 추출 후보로 재사용 X) |
| `past_only` | 과거 캐논·현 시점엔 invalid·시점 query 시 retrieval | 📜 과거 한정 | retired, canon (재활성 시) |
| `contradicted` | 다른 fact와 모순·작가 결정 대기 | ⚠️ 모순 | canon, retired, invalidated, past_only |
| `invalidated` | 새 fact가 supersede·자동 invalidate | 🔄 대체됨 | (terminal — supersedes 관계 보존) |
| `author_only` | 작가만 아는 사실·캐릭 simulation에서 leak 금지 | 🔒 작가 only | canon, retired |
| `character_known` | 특정 캐릭이 아는 사실 (인지 비대칭) | 👤 캐릭 인지 | character_unknown, canon (전 캐릭에게 공개 시) |
| `character_unknown` | 특정 캐릭이 모르는 사실 | ❓ 캐릭 미인지 | character_known (학습 시) |

## 2. 보조 태그 (Tags)

| Tag | 의미 | 예시 |
|---|---|---|
| `scope:global` | 모든 작품 공통 | 차원 구조·천주제국 |
| `scope:short1` | 단편 1 한정 | 청학여고·소리·도깨비 첫 만남 |
| `scope:short2` | 단편 2 한정 | 세드릭·영지 제약·5 팀장 |
| `scope:short3` | 단편 3 한정 | 아린·저항군 |
| `scope:main` | 본편 한정 | 8동료·헬멧 폐기·결 정체 |
| `forbidden_in_scope:short1` | 단편 1 본문 노출 금지 | 허 사서 정체·도서관장 정체·도깨비 삭 조건 |
| `tier:1` | 작가 + 일부 캐릭 인지·점진 노출 | 명부 회장 빈 줄 |
| `tier:2` | 작가만·캐릭 모두 모름 | 13번째 초월체 정체 |
| `confidence:high` | 추출 신뢰도 ≥ 0.9 | — |
| `confidence:medium` | 0.7~0.9 | — |
| `confidence:low` | < 0.7 | — |
| `category:fact` | 객관 사실 | 권역·언어·면적 |
| `category:identity` | 캐릭 정체성 | 아키타입·말투·취향 |
| `category:event` | 사건 | D5 동아리실 발견 |
| `category:impression` | 캐릭 인상·해석 | "수상해" |
| `category:rumor` | 검증 안 된 전언 | "허 사서가 누구를 의심한다더라" |
| `decay:λ_0.05` | canonical fact·~75일+ 보존 | — |
| `decay:λ_0.08` | identity·~50일 | — |
| `decay:λ_0.15` | event·~25일 | — |
| `decay:λ_0.25` | impression·~15일 | — |
| `decay:λ_0.40` | rumor·~10일 | — |

## 3. 상태 전이 다이어그램

```text
[추출] → candidate
            ├──→ canon ──┬──→ retired (작가 명시 폐기)
            │            ├──→ contradicted ──┬──→ canon (작가 결정)
            │            │                   ├──→ past_only (시점 봉인)
            │            │                   ├──→ invalidated (supersede)
            │            │                   └──→ retired
            │            └──→ past_only ──→ retired
            ├──→ rejected (작가 거부)
            ├──→ retired (즉시 폐기)
            └──→ author_only / character_known / character_unknown (인지 비대칭 부여)
```

## 4. UI 버튼 룰 (Review Queue 화면)

각 candidate 카드에 다음 액션:

| 버튼 | 효과 | 단축키 |
|---|---|---|
| **승인 (Approve as canon)** | candidate → canon·valid_at = now | A |
| **거부 (Reject)** | candidate → rejected·noise·트레이닝 신호 | R |
| **폐기 (Mark retired)** | candidate or canon → retired | T |
| **과거 한정 (Mark past-only)** | candidate or canon → past_only·invalid_at 입력 | P |
| **병합 (Merge)** | 두 candidate 또는 candidate+canon 병합·중복 제거 | M |
| **분할 (Split)** | 한 candidate를 여러 fact로 분할 | S |
| **캐릭 인지 부여 (Assign character knowledge)** | character_known + 캐릭 선택 | K |
| **작가 only 마킹** | author_only | O |
| **scope 변경** | scope tag 수정 | C |
| **신뢰도 부스트** | confidence:low → high | B |
| **충돌로 격상** | candidate → contradicted (검수 보류) | X |

**다중 선택 가능**: 작가가 여러 candidate 동시 선택·일괄 승인/거부.

## 5. 자동 분류 룰 (LLM-driven 초기 status)

추출 직후 LLM이 *제안*하는 초기 status:

| 패턴 | 제안 status | 신뢰도 |
|---|---|---|
| canon.md·decisions.md에 *명시적 lock* 마커 | `candidate` (high confidence·승인 권장) | high |
| `폐기` / `deprecated` / `구 X` 마커 동반 | `retired` (즉시 폐기 권장) | high |
| `INTERNAL ONLY` / `Tier 2` / `작가 only` 마커 | `author_only` | high |
| `본문 노출 금지` 마커 | `forbidden_in_scope:{scope}` tag | high |
| 본문 (stories/) 에서 캐릭 시점 서술 | `character_known:{캐릭}` | medium |
| 기존 canon과 모순 검출 | `contradicted` | medium |
| 추출 신뢰도 < 0.6 | `candidate` + `confidence:low` | low |

* 모든 자동 분류는 *작가 승인 후* canon promote.

## 6. 검수 우선순위 (Inbox Sort)

검수 큐 표시 순서:

1. **Critical**: contradicted·confidence:high
2. **High**: 새 candidate (24시간 이내·priority 1 source)
3. **Medium**: tier:1·event·identity
4. **Low**: rumor·impression·confidence:low
5. **Background**: 자동 retired 후보 (decisions.md *폐기* 마커)

## 7. 검수 SLA

작가 작업 흐름 정합:

| 작업 | 예상 검수 시간 |
|---|---|
| candidate 1개 (단순 fact) | 5~10초 |
| contradicted 1개 (모순 해결) | 30~60초 |
| 병합 1쌍 | 15~30초 |
| 분할 1개 | 30~60초 |

→ Day 1 본문 추출 후 검수 = 평균 50 candidate × 8초 = ~7분. 작가 작업 흐름에 부담 없는 범위.

## 8. Eval 정합

KNOT eval seed (knot_author_eval_seed_v1.json)에서 status·tag 정합 검증:
- `forbidden_in_scope:short1` fact가 단편 1 본문 simulation에 leak되지 않는지
- `author_only` fact가 어떤 캐릭 thought에도 등장하지 않는지
- `character_known:룰루`인 fact만 룰루 시점 retrieve되는지

---

**핵심 원칙**: *Status는 작가 승인의 결과이지 LLM 자동 결정의 결과 X*. Seizn은 *제안*하고 작가가 *결정*.
