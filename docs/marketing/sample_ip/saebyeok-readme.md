---
doc_type: sample-ip-readme
version: v1
generated_at: 2026-05-02
ip_label: Sample IP — Synthetic Demo Data
ip_title: Saebyeok Academy / 새벽 학원
status: handoff-ready (Codex live demo widget input)
applies_to: seizn.com landing live demo (§02·§03·§05·§06), Author UI demo data, marketing assets
pair_with:
  - ../seizn_author_landing_brief.md (§2·§3·§6)
  - ../dual_surface_positioning.md
  - ../../knot-input/ (schema reference — DO NOT import any data)
---

# Saebyeok IP — README

> Seizn Author landing live demo의 source IP. 합성·익명·KNOT과 무관. 본 README는 사용 룰·라벨링 규약·KNOT 분리 정합 검증 절차를 정의한다.

## 1. 정체성

| 항목 | 값 |
|---|---|
| Title | Saebyeok Academy / 새벽 학원 |
| Genre | Korean coming-of-age light SF mystery (soft SF) |
| Tone | 잔잔·관찰형·미스터리 풍·저예산 SF·청춘 |
| Duration | D1~D30 (2026-04-02 ~ 2026-05-01·봄학기 첫 한 달) |
| Characters | 8명 (학생 7 + 어른 사서 1) |
| World rules | 22개 |
| Timeline events | 30개 (D1~D30) |
| Review cases | 50개 |
| Simulation cases | 8개 |
| Ending branches | 3 (A 공개·B 비공개·C 계속) |

## 2. 사용 목적

- seizn.com landing live demo 위젯 (§2 hero·§5 conflict·§6 simulation) 데이터 source
- Author UI Inbox·Review·Characters·Graph·Timeline·Simulate 7 screens demo content
- 외부 데모 (Show HN·Reddit·YouTube) 시 시연 자료
- Codex 빌드 입력 (정적 JSON snapshot·CDN edge cache)

## 3. 라벨링 규약

모든 외부 노출 시 다음 라벨 중 하나를 명시한다 ([feedback_synthetic_persona_labeling.md](../../../C:/Users/admin/.claude/projects/c--Users-admin--codex/memory/feedback_synthetic_persona_labeling.md) 정합):

- 단어 레벨: `Sample IP`
- 문장 레벨: `Sample IP — Synthetic Demo Data`
- 풋노트: `본 데모는 Seizn 기능 시연용 합성 자료입니다. 실제 작가 작품·실존 인물과 무관합니다.`
- en master: `Demo data is a synthetic Sample IP designed for Seizn. Not affiliated with any author or studio.`

라벨 누락 시 외부 노출 X — Codex 빌드 acceptance 항목.

## 4. 산출물 7종

`docs/marketing/sample_ip/` 아래:

| 파일 | 내용 | 매핑 schema |
|---|---|---|
| `saebyeok_canon_v1.json` | 캐릭 8명 풀 cast | `knot-input/character_registry.json` 1:1 |
| `saebyeok_world_rules_v1.json` | 세계관 룰 22개 | `knot-input/world_rule_registry.json` 1:1 |
| `saebyeok_timeline_v1.json` | D1~D30 사건 30개 | `knot-input/timeline_event_ledger.json` 1:1 |
| `saebyeok_relationships_v1.json` | 관계 매트릭스 | `knot-input/relationship_matrix.json` 1:1 |
| `saebyeok_review_cases_v1.json` | 검수 case 50개 | `knot-input/knot_author_eval_seed_v3.json` 변형 |
| `saebyeok_simulation_cases_v1.json` | Scene Simulation 8 case | landing brief §6.1 `<HeroSimulationDemo>` 입력 |
| `saebyeok-readme.md` | 본 문서·사용 룰·KNOT 분리 검증 | — |

## 5. KNOT 분리 룰 검증 (필수)

[feedback_seizn_knot_separation.md](../../../C:/Users/admin/.claude/projects/c--Users-admin--codex/memory/feedback_seizn_knot_separation.md) 정합:

> Seizn 외부 산출물 (마케팅·landing·docs·blog·case study)에 KNOT 자료·캐릭·세계관 노출 0건. demo source = 합성 sample IP·공개 도메인·외부 작가 (KNOT은 내부 QA dogfood로만 허용).

### 5.1 검증 grep

본 폴더에서 다음 명령으로 KNOT 누설 0 검증:

```bash
# Windows bash (이 프로젝트의 default shell)
rg -i '(소리|나리|레이카|아오이|나나|룰루|유이|허\s|타오|코우|토라|도리|치비|절\(|나루\s|아린\s|세드릭|청학여고|천주제국|Worldspire|무공권|마법권|사펑권|위상폭풍|테게오스|관상감|예조\b|선학|십장생|13초월체|자서가|장도|8덕목|戒童戒女|神齡|天柱|항하사|대장|결\(13)' \
  docs/marketing/sample_ip/

# 결과 = 0건이어야 함
```

본 README의 `5.1` 섹션 자체는 검증 명령에 패턴 문자열이 들어있어 self-match가 발생할 수 있음 — 검증 시 본 README 1개 파일을 제외 (`-g '!saebyeok-readme.md'`).

### 5.2 정합 확인 (2026-05-02 검증)

| 카테고리 | KNOT 항목 | Saebyeok 항목 | 분리 정합 |
|---|---|---|---|
| 캐릭터 주인공 | 소리 | 한이슬 | ✓ |
| 캐릭터 듀오 | 나리 (룸메) | 정세린 (반장·짝꿍) | ✓ |
| 캐릭터 사진/시니컬 | 레이카 (오컬트 동아리) | 윤하나 (사진부) | ✓ |
| 캐릭터 과묵 남성 | (해당 없음·KNOT 단편1는 여성 7+조연 8) | 박지오 (기상부) | ✓ (역할 자체 신설) |
| 캐릭터 야망/정보 | 나나 (학생회 의무 X) | 김민채 (학생회 서기) | ✓ |
| 캐릭터 따뜻 남성 | 코우 (교장 어른) | 최도윤 (학생) | ✓ (학년·관계 다름) |
| 캐릭터 수수께끼 전학생 | (해당 없음) | 강예린 | ✓ |
| 캐릭터 도서관 | 허 (집사 톤·600년) | 임선재 (51세 사서·17년차) | ✓ (정체성 완전 다름) |
| 학교 | 청학여고 | 새벽고등학교 | ✓ |
| 도시 | 천주제국·22km 수직 | 다온시·평지 신도시 | ✓ |
| 권역 | 무공권/마법권/사펑권 | 한국 표준 도시 (권역 X) | ✓ |
| 능력 | 자서가·장도·13초월체 | 능력 0건 (soft SF) | ✓ |
| 조직 | 십장생·관상감·예조·선학 | 여명재단 (가상 준공공) | ✓ |
| 세계 사건 | 위상폭풍·테게오스 | 여명 진동 (시간 미세 결손) | ✓ |
| 시간대 | 22km 수직 결계 | 11분 결손 룰 | ✓ |
| Day 캘린더 | D1=2/20 금 (KNOT) | D1=2026-04-02 목 | ✓ |
| Phase 분배 | Phase 1~3 (D1~D35) | Phase 1~3 (D1~D30) | △ schema 동일·내용 무관·문제 X |

### 5.3 schema 패턴 재사용 = 정합

`knot-input/`의 schema (graph_entities·tags·tier·valid_at·forbidden_in_scope 등) 패턴은 Seizn primitive 정의의 일부이므로 *재사용 정합*. KNOT 데이터 자체 (`소리`·`자서가`·`청학여고` 등 구체 값)는 0건.

## 6. Author UI 시연 매핑

| Author UI 화면 | Saebyeok 데이터 source | 시연 포인트 |
|---|---|---|
| Inbox | `saebyeok_review_cases_v1.json` 50건 | 검수 카드 흐름 데모 |
| Review | `saebyeok_review_cases_v1.json` + 단축키 (A·R·T·P·M·S·K·O·C·X) | 단축키 한 손 검수 |
| Characters | `saebyeok_canon_v1.json` 8명 | 캐릭 카드·voice·desire·secret 시연 |
| Graph | `saebyeok_relationships_v1.json` + canon 캐릭 | Cosmos.gl ego-network |
| Timeline | `saebyeok_timeline_v1.json` 30 Day | Day lane + 캐릭 lane |
| Simulate | `saebyeok_simulation_cases_v1.json` 8 case | candidate 5 + leak 자동 검출 |
| World | `saebyeok_world_rules_v1.json` 22 룰 | tier 분리·forbidden_in_scope 시연 |

## 7. landing live demo 매핑

`seizn_author_landing_brief.md` §1·§2·§3 정합:

| Landing 섹션 | Saebyeok 데이터 |
|---|---|
| §2.2 단계 1 — Canon Graph | 8 캐릭 + 22 룰 + 30 사건 = 합성 ego-network |
| §2.2 단계 2 — Review Queue | `simulations.001.c1` 또는 `cases.001~050`에서 발췌 |
| §2.2 단계 3 — Conflict + Simulation | `simulations.003.c4` (leak 검출 시연·Doyun father), `simulations.004.c4` (1958 매설 leak), `cases.043~046` (모순) |
| §3.5 §06 Scene Simulation 카드 | `simulations.001`·`004`·`005` 그대로 |
| §3.4 §05 Conflict 카드 3개 | `cases.044` (도윤 아버지 모순)·`cases.045` (예린 출신 모순)·`cases.046` (하나 학년 모순) |

## 8. 작업 우선순위 (변경 시)

1. 본 폴더 변경 시 §5.2 표 갱신
2. KNOT 분리 grep (§5.1) 실행 — 0건 확증 후 commit
3. 새 캐릭/룰 추가 시 KNOT name-catalog 대조 (`Projects/knot/worldbuilding/name-catalog.md` Read·정합 확인)
4. 라벨링 규약 (§3) 변경 X — 외부 노출 라벨 lock

## 9. Decision history

- 2026-05-02 v1 — 7 산출물 풀 빌드·KNOT 분리 검증 완료
- 2026-05-02 v1 — landing brief §1·§2·§3 정합·Author UI 7 screens 시연 가능 확인
- 2026-05-02 v1 — Codex 빌드 입력 handoff (정적 JSON snapshot·CDN edge cache)

## 10. 다음 cycle TODO (별 cycle)

- [ ] 영어 번역판 (`saebyeok_*_v1.en.json`) — landing en master 정합 — W3~W4
- [ ] 일본어·중문 번역 — secondary GTM 시점 (W7+)
- [ ] simulation case 추가 (D7·D14 음악실·D24 학생회실 등) — 위젯 다양성 + 데모 풀 페이지
- [ ] case study 1편 (Saebyeok IP를 Seizn에 입력해서 빌드한 30분 walkthrough 영상 스크립트)
- [ ] Author UI demo seed 자동 생성 스크립트 — `scripts/seed-saebyeok.ts`

---

*본 README는 Seizn Author launch runbook §3 P0-3 산출물·landing brief §6 정합·KNOT 분리 룰 자동 검증 가이드 정합. 작업 변경 시 본 README 갱신 + grep 검증 필수.*
