---
doc_type: ui-screen-specs
version: v1
generated_at: 2026-05-02
applies_to: Seizn Author 7 핵심 화면
---

# Author UI Screen Specs

> 7 핵심 화면의 *목적·데이터 요구·상태 전이·액션*. Codex 사양 정합.

---

## Screen 1: Project Import Inbox

**경로**: `/project/{project_id}/inbox`

**목적**: 작가가 기존 자료 (md·docx·pdf·notion export·plain text 등)를 업로드하고 추출 진행 상태를 확인.

**핵심 데이터**:
```text
- documents: Array<{
    id: string
    file_name: string
    file_size: number
    file_type: 'md' | 'docx' | 'pdf' | 'txt' | 'json' | 'notion_export' | 'obsidian_md'
    upload_at: timestamp
    parse_status: 'queued' | 'parsing' | 'parsed' | 'failed'
    parse_progress: 0~100
    extract_status: 'queued' | 'extracting' | 'extracted' | 'failed'
    extract_progress: 0~100
    candidate_count: number
    error_message?: string
    source_role: 'canon' | 'character' | 'scene' | 'reference' | 'visual' (선택 가능)
    a_or_d_mode: 'extract' | 'raw_keep'  // A 양식 vs D 양식
  }>
- summary: {
    total_docs: number
    parsing: number
    extracting: number
    ready_for_review: number  // candidate 수 합산
    failed: number
  }
```

**UI 컴포넌트**:
- 상단 drag&drop zone ("자료 끌어다 놓기 또는 클릭하여 업로드")
- 업로드 옵션 토글: 「① AI 자동 분석 (D)」 / 「② 그대로 저장 (A)」
- 진행 중 progress 카드 (각 문서당)
- 완료 문서 list (status·candidate count·"검수하러 가기" 버튼)
- 실패 문서 list (error message·재시도 버튼)
- 일괄 액션: 모두 검수·모두 재추출·모두 삭제

**상태 전이**:
- 업로드 시작 → parsing → parsed → extracting → extracted → "검수 대기 N건"
- 실패 시 error 표시 + 작가 재시도 또는 raw 저장 (A 양식 fallback) 옵션

**Empty state**:
- 첫 진입: "기존 자료를 끌어다 놓으세요. md·docx·pdf·notion 익스포트 모두 OK"
- 업로드 후 모두 검수 완료: "검수 대기 0건. 새 자료 업로드 또는 [Review Queue 종합 보기]"

---

## Screen 2: Review Queue

**경로**: `/project/{project_id}/review`

**목적**: 추출된 candidate를 작가가 검수·승인·거부·병합·분할·태그 부여.

**핵심 데이터**:
```text
- candidates: Array<{
    id: string
    content: string  // 추출된 fact 또는 entity 또는 relationship
    type: 'character' | 'world_rule' | 'event' | 'relationship' | 'voice_sample' | 'fact'
    status: 'candidate' | 'canon' | 'rejected' | 'retired' | 'past_only' | 'contradicted' | 'invalidated' | 'author_only' | 'character_known' | 'character_unknown'
    confidence: 0.0~1.0
    suggested_status: status  // LLM 자동 분류 제안
    tags: string[]  // ['scope:short1', 'tier:1', 'category:event', ...]
    source: {
      document_id: string
      file_path: string
      span: { start_line: number, end_line: number, start_char: number, end_char: number }
      excerpt: string  // 근거 문장
    }
    related_existing: Array<{ entity_id: string, relationship: 'duplicate' | 'similar' | 'conflicts' }>
    extracted_at: timestamp
    reviewed_by?: string
    reviewed_at?: timestamp
  }>
- filters: {
    status: status[]
    scope: scope[]
    tier: tier[]
    confidence_min: 0.0~1.0
    source_id?: string
    date_range?: [date, date]
    type: type[]
  }
- sort: 'priority' | 'date' | 'confidence' | 'source_order'
```

**UI 컴포넌트**:
- 좌측: 필터 + 정렬 패널·검수 진행률 표시
- 중앙: candidate 카드 stack (한 번에 1개 또는 grid·작가 선호)
- 카드 내용: 추출된 텍스트·근거 문장 (highlight)·source 파일·관련 기존 entity·suggested status
- 카드 액션 (10개 버튼·단축키 표시):
  - ✅ 승인 (A) — 캐논 promote
  - ❌ 거부 (R) — 노이즈
  - 🪦 폐기 (T) — retired
  - 📜 과거 (P) — past_only·invalid_at 입력
  - 🔀 병합 (M) — 기존 entity와
  - ✂️ 분할 (S) — 다중 fact로
  - 👤 캐릭 인지 (K) — character_known + 캐릭 선택 모달
  - 🔒 작가 only (O) — author_only
  - 🏷️ scope/tier 변경 (C)
  - ⚠️ 충돌 (X) — Conflict Inbox로 격상
- 우측: source 미리보기 패널 (해당 md 파일 line 범위)
- 다중 선택: shift+클릭·일괄 액션

**키보드 워크플로우**:
- 작가는 한 손은 키보드·다른 손은 마우스
- A·R·T·P·M·S·K·O·C·X 단일 키
- ↑↓ 카드 navigation
- Space = 자세히 보기 expand

**Empty state**:
- 검수 대기 0건: "모두 검수 완료! 새 자료 업로드 또는 본문 작성"
- 첫 검수: 가이드 tutorial overlay

---

## Screen 3: Character Card

**경로**: `/project/{project_id}/characters/{character_id}` (또는 list `/characters`)

**목적**: 캐릭 *현재 상태·인지·페르소나·관계·메모리* 한 화면 통합.

**핵심 데이터**:
```text
- character: {
    id: string
    name: string
    aliases: string[]
    scope: scope[]
    archetype: string
    voice: { speech_pattern: string, vocabulary: string, signature_expressions: string[] }
    persona: { traits: string[], desires: string[], vulnerabilities: string[] }
    appearance: { gender: string, ethnic: string, morphology?: string, age: number }
    background: { backstory: string (author_only 가능), education: string }
    knowledge_state: {
      known_facts: Array<{ fact_id, learned_at, source_event_id }>
      unknown_facts: Array<{ fact_id, reason }>
      hidden_facts: Array<{ fact_id, hidden_from: char_id[] }>  // 비밀
      author_only_facts: Array<{ fact_id }>
      misunderstandings: Array<{ correct_fact_id, what_char_thinks }>
    }
    relationships: Array<{ to: char_id, type, current_dimensions, recent_events }>
    recent_important_memories: Array<{ memory_id, salience, summary, day }>
    voice_samples: Array<{ source_event_id, dialogue_text }>
    current_arc_phase: string  // 단편 1 시점별
  }
```

**UI 레이아웃**:
- 좌 (1/3): 기본 정보·페르소나·외형
- 중 (1/3): 4 패널 stacked (알고 있는 / 모르는 / 비밀 / 작가 only)
- 우 (1/3): 관계 미니그래프·최근 메모리·voice 샘플
- 상단 탭: 정보 / 인지 / 관계 / 메모리 / 사건 timeline / 편집 기록

**액션**:
- 직접 편집 (인라인) → 변경 시 review queue 자동 등록 (작가 본인 변경도 검수 거치는 룰 옵션)
- 인지 비대칭 수정 (캐릭에게 fact 공개/숨김)
- 시뮬레이션 진입 (이 캐릭으로) → /simulate 이동

**Empty state**:
- 캐릭 정보 부족 시: 인터뷰 fallback prompt ("이 캐릭이 가장 두려워하는 것은?·욕망은?·말투는?")

---

## Screen 4: Relationship Graph

**경로**: `/project/{project_id}/graph`

**목적**: 캐릭·조직·장소·사건의 관계망 시각화.

**핵심 데이터**:
```text
- nodes: Array<{
    id: string
    type: 'person' | 'organization' | 'location' | 'event' | 'concept'
    label: string
    importance: 0~1
    color_group: string
    scope: scope
  }>
- edges: Array<{
    from: node_id
    to: node_id
    type: relationship_type
    intensity: -1~1
    valid_at: timestamp
    invalid_at?: timestamp
    sources: source_id[]
  }>
- time_state: timestamp  // 슬라이더로 변경
- filters: { type, scope, tier, intensity_min }
- focused_node?: node_id  // 클릭 시 ego-network 강조
```

**기술**: Cosmos.gl (WebGL2·10K+ nodes 60fps 권장)

**UI 컴포넌트**:
- 메인 캔버스 (풀스크린)
- 우상단: 줌·팬·리셋 컨트롤
- 좌상단: 검색·필터 (캐릭·조직·scope 등)
- 하단: 시간 슬라이더 (D1~D35 또는 unbounded)
- 우측 사이드: 선택 node 정보 패널 (클릭 시 펼침·hover 시 미니 카드)

**상호작용**:
- 클릭 = focus·관련 node·edge 강조·다른 dim
- shift+클릭 = 다중 선택
- 드래그 = node 수동 위치 (레이아웃 freeze 옵션)
- edge 클릭 = 관계 변화 timeline mini

**Empty state**:
- 첫 사용: "검수가 더 진행되면 그래프가 풍부해집니다. 현재 N개 entity·M개 관계."

---

## Screen 5: Timeline

**경로**: `/project/{project_id}/timeline`

**목적**: 사건 시간순 흐름 + 각 사건의 캐릭/관계/세계관 영향.

**핵심 데이터**:
```text
- events: Array<{
    id, day, date, scene_id, where, who, what, knowledge_partition, tags
  }>
- character_lanes: Array<{ char_id, events: event_id[] }>
- phase_markers: Array<{ phase, day_range }>
- selected_event?: event_id  // 클릭 시 영향 분석
```

**UI 레이아웃**:
- 가로 스크롤·D1~D35 column
- 캐릭 lane (참여한 이벤트 색칠)
- Phase 색상 (Phase 1·2·3 구분)
- 마일스톤 강조 (입학식·동아리 합류·타오 사망·보스전)
- 사건 클릭 → 우측 패널: 영향 받은 캐릭 기억·관계 변화·세계관 룰 갱신·source

**필터**:
- 캐릭별·tier별·event type별·phase별

**Empty state**:
- 첫 사용: "Day 1 사건이 추출되면 타임라인이 시작됩니다."

---

## Screen 6: Canon Conflict Inbox

**경로**: `/project/{project_id}/conflicts`

**목적**: 자동 검출된 모순 candidate를 작가가 결정.

**핵심 데이터**:
```text
- conflicts: Array<{
    id: string
    severity: 'critical' | 'high' | 'medium' | 'low'
    detected_at: timestamp
    existing_fact: {
      entity_id, content, valid_at, source, confidence, status
    }
    new_fact: {
      content, source, confidence, suggested_relationship: 'supersedes' | 'contradicts' | 'scope_diff' | 'time_diff'
    }
    llm_analysis: string  // LLM이 제안한 해석
    impact_summary: string  // 이 모순이 영향 주는 다른 fact·캐릭
  }>
- filters: { severity, scope, type }
```

**UI 레이아웃**:
- 충돌 목록 (좌)·선택된 충돌 detail (우)
- detail 패널: 두 패널 side-by-side (기존 vs 새)·diff highlight·LLM 해석·영향 분석
- 액션 버튼:
  - "기존 유지" — 새 fact를 rejected로
  - "새로 갱신" — 기존을 invalidated, 새를 canon
  - "둘 다 보존 + scope 분리" — scope tag 추가
  - "둘 다 보존 + 시점 분리" — past_only 마킹·invalid_at 입력
  - "병합" — 두 fact를 1개로 통합
  - "보류" — 작가 더 고민할 필요

**Empty state**:
- "충돌 없음. 캐논 정합 OK."

**중요**: critical conflict는 알림 (top nav 빨강 뱃지)

---

## Screen 7: Scene Simulation Panel

**경로**: `/project/{project_id}/simulate`

**목적**: 작가가 막힌 씬에 대해 *캐릭별 반응 candidate*를 받아 검수.

**핵심 데이터** (입력):
```text
- scene_input: {
    text: string  // 씬 묘사
    setting: { location, time, weather, mood }
    characters_present: char_id[]
    timepoint: { day: number, scene_position: 'start' | 'middle' | 'end' }
    pressure: string  // "타오 사망 직후"·"명부 회장 빈 줄 정식 발견" 같은 압력
    perspective: char_id  // 시뮬레이션 대상 캐릭 (한 번에 1명)
    candidate_count: number  // 5~10
  }
```

**핵심 데이터** (출력):
- 별도 contract → `author_scene_simulation_output_contract.json`

**UI 레이아웃**:
- 좌: 입력 폼 (스토리텔링)
- 중: candidate 출력 카드 stack (각 5개·thought·dialogue·action·canon_risk·근거)
- 우: 근거 패널 (선택된 candidate의 memory·graph edge 근거)
- 하단: 액션 (선택된 candidate를 canon promote·수정 후 promote·전부 거부)

**상호작용**:
- 시뮬레이션 실행 = LLM 호출 (Opus 4.7·~10~30초)
- 진행 indicator + 토큰 사용량 표시
- 결과 candidate 검토 후 작가가 1~3개 선택·승인 시 review queue 또는 character memory에 직접 등록
- 거부된 candidate는 폐기·재시뮬 가능

**Canon 안전장치**:
- 모든 candidate는 *명확히 'candidate' 라벨* — 자동 canon X
- author_only fact leak 자동 검출 (eval 통과 시)·leak 감지 시 candidate 강조 + 경고
- 작가가 leak candidate 승인 시 별도 confirmation 모달

**Empty state**:
- 첫 사용: gallery (튜토리얼 예시 + KNOT 데모 입력 sample)
- 캐릭 정보 부족: "{캐릭}의 페르소나/관계/기억이 부족합니다. Character Card에서 보강 후 다시 시도."

---

## 화면 간 navigation 매트릭스

| 시작 | 가능 이동 |
|---|---|
| Inbox | → Review Queue (검수)·문서 reload |
| Review Queue | → Character Card (캐릭 관련 검수)·Conflict Inbox (모순)·Timeline (사건 검수)·Inbox |
| Character Card | → Relationship Graph (focused)·Simulate (이 캐릭)·Timeline (이 캐릭 lane) |
| Relationship Graph | → Character Card (node 클릭)·Timeline (edge 변화 시점) |
| Timeline | → Character Card (참여 캐릭)·Relationship Graph (시점 grafico) |
| Conflict Inbox | → Review Queue (관련 candidate)·Character Card·World Rule |
| Simulate | → Review Queue (선택 candidate)·Character Card (등록) |

## 공통 UI 룰

- 모든 fact 표시 시 status badge·confidence·source link 필수
- author_only는 🔒 아이콘 + 색상 강조
- forbidden_in_scope는 🚫 아이콘 + scope 표시
- candidate vs canon 시각적 명확 구분 (색·외곽선)
- 작가 본인 변경도 audit log에 기록 (Replay·Trace 정합)
