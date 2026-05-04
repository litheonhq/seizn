---
doc_type: architecture-design-spec
version: v1
generated_at: 2026-05-02
status: handoff-ready
applies_to: Seizn Author Memory v3 — fixture mode → real LLM-driven extraction + persistent audit
audience: Codex implementation agents, technical reviewers
pair_with: seizn-author-memory-v3-llm-integration-tasks.md
depends_on:
  - seizn-author-memory-v3.md
  - seizn-author-memory-v3-kickoff-plan.md
  - ../author-ui/author_ui_data_contracts.json
  - ../author-ui/author_ui_query_bindings.json
  - ../author-ui/author_ui_mutation_invalidation_matrix.md
---

# Seizn Author Memory v3 — LLM Integration Design Spec

> 현 fixture mode (정적 KNOT JSON import + 하드코드 1 candidate)을 *실 Anthropic Opus 4.7 호출 + 영속 audit log + 실 file 파싱*으로 교체. KNOT 5명 backlog generation을 첫 dogfood case.

## 1. 현 상태와 갭

`docs/author-ui/` 사양과 `src/lib/author/ui/service.ts`(1588줄) 비교 검증 결과:

| 영역 | 현재 | 갭 |
|---|---|---|
| UI 7 screens | ✓ 빌드 (`src/app/(dashboard)/dashboard/author/`) | — |
| API routes 20개 | ✓ 빌드 (`src/app/api/projects/...`) | — |
| Hooks (SWR) | ✓ 빌드 (`src/hooks/useAuthorMemoryV3.ts`) | — |
| Service layer | ✓ 빌드 — 단 *fixture mode* | 실 LLM 호출 X |
| File upload | ✓ multipart accept | 바이트 무시·파싱 X |
| Candidate generation | ✗ 하드코드 `candidate_count: 1` | 실 추출 X |
| Backlog generation (캐릭별 좋아하는 것 등) | ✗ 미빌드 | 전용 prompt + bible context inject 필요 |
| Audit log | ✓ in-memory state | 휘발·재시작 시 손실 |
| Replay | ✓ 인터페이스만 | 영속 trace 없음 |
| BYOK runtime 적용 | ✓ 등록 모듈 빌드 | 실 호출 시 키 적용 흐름 X |

## 2. 목표 (Definition of Done)

본 통합 완료 시 다음이 작동:

1. 작가가 `.md`·`.docx`·`.pdf`·`.txt` upload → 바이트 영속화 → 텍스트 추출 → LLM 추출 호출 → AuthorUiCandidate 적재
2. Author UI Inbox에서 진행 상태 (parsing·extracting) 실시간 반영 (websocket)
3. Review Queue에서 추출 candidate 검수 가능
4. *Character backlog generation* 전용 흐름 — 작가가 캐릭 선택·"좋아하는 것·싫어하는 것 5~7 후보 generate" 트리거 → LLM이 character bible context 주입 prompt로 후보 생성 → Review Queue에 적재
5. 모든 generation·decision이 Supabase persistent audit log에 기록 — Replay 가능
6. BYOK 키 등록 시 실 generation 호출이 작가 자신 Anthropic 계정으로 결제

## 3. Locked Defaults (사용자 lock 2026-05-02)

| 결정 항목 | 값 |
|---|---|
| LLM provider | Anthropic Opus 4.7 (`claude-opus-4-7`) — 단일 |
| BYOK 키 위치 | Celovin (KNOT 처리·entity 분리 정합·Litheon dev key는 테스트 한정) |
| 파일 저장소 | **Cloudflare R2** (`seizn-author-uploads-temp` bucket·*개인 명의 (iruhana25) 임시·migrate_by=W6 launch 전 Litheon 이전 강제*·zero egress·S3-compatible) |
| Audit log 영속 저장소 | Supabase Postgres (`author_audit_log` 테이블 신규·JSONB 쿼리 효율) |
| `.hwp` 파서 | **제외** — 한국 사용자도 `.docx` 사용 보편 |
| 5명 backlog 작업 순서 | Phase 4 빌드 전 사용자가 manual minimum lock 후 Phase 4 완성 시 audit·확장 |

## 4. 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│ UI Client (existing)                                            │
│  ├─ Inbox (DropZone + DocumentCard)                             │
│  ├─ Review Queue (CandidateCard + 단축키)                       │
│  └─ Character Card (NEW: GenerateBacklog 버튼)                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ SWR hooks
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ API Routes (existing)                                           │
│  POST /api/projects/{id}/imports        ← Phase 1               │
│  POST /api/projects/{id}/candidates     ← Phase 4 (new endpoint)│
│  POST /api/projects/{id}/simulate       ← Phase 3 (replace fixture)│
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Service Layer (existing — refactor)                             │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │ FileStore       │  │ Parser           │  │ LLMClient      │ │
│  │ (Cloudflare R2  │  │ (md/docx/pdf/txt)│  │ (Anthropic     │ │
│  │  Phase 1)       │  │ (Phase 1)        │  │  + BYOK·Phase 2)│ │
│  └────────┬────────┘  └────────┬─────────┘  └───────┬────────┘ │
│           │                    │                    │          │
│           ▼                    ▼                    ▼          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Extraction Pipeline (Phase 3)                           │   │
│  │  ├─ ExtractCandidatesFromText (md·docx·pdf 본문)        │   │
│  │  └─ GenerateBacklogForCharacter (Phase 4 — bible inject)│   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Persistent Store (Phase 5)                              │   │
│  │  ├─ Supabase tables: imports, candidates, audit_log     │   │
│  │  └─ Replay buffer: prompt·model·output·decision_id      │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 5. Phase 분해

각 phase는 독립 dispatch — `feedback_codex_sequential.md` 정합으로 sequential 실행.

### Phase 1 — File Persistence + Parsing

**입력**: multipart upload 바이트
**출력**: 파일 영속화 + 텍스트 본문 추출

**변경 대상**:

```
src/lib/author/ui/service.ts             (uploadImport refactor)
src/lib/author/storage/r2-store.ts       (NEW — Cloudflare R2 adapter, S3 SDK)
src/lib/author/parser/                   (NEW dir)
  ├─ md.ts        (gray-matter + remark)
  ├─ docx.ts      (mammoth or LlamaParse)
  ├─ pdf.ts       (LlamaParse or pdf-parse)
  └─ txt.ts       (passthrough + encoding detect)
src/app/api/projects/[projectId]/imports/route.ts  (refactor — file bytes pass-through)
supabase/migrations/2026MMDD_author_imports_text.sql  (NEW — parsed_text 저장 테이블)
```

**Cloudflare R2 셋업 (개인 명의 임시·W6 이전 Litheon 마이그레이션 강제)**:
- bucket: `seizn-author-uploads-temp` (신규·*개인 iruhana25 명의 임시*·기존 `knot-creative-backup`·`milkypix-assets`와 분리)
- 사유: Litheon 카드 발급 불가 (2026-05-02 lock)·자금 조달 후 W6 외부 launch 전 이전 강제 — 자세히 §11
- region: `apac` (한국·일본 1차)·또는 `wnam` (영어권 GTM 정합)
- access: S3-compatible API·private bucket·signed URL only
- credential: 개인 Cloudflare account access key·env `R2_ACCESS_KEY_ID`·`R2_SECRET_ACCESS_KEY`·`R2_ACCOUNT_ID`·`R2_BUCKET=seizn-author-uploads-temp`·`R2_OWNER=personal_temp`·`R2_MIGRATE_BY=W6`
- key 등록 후: [feedback_no_secrets_in_memory.md](C:/Users/admin/.claude/projects/c--Users-admin--codex/memory/feedback_no_secrets_in_memory.md) 정합·메모리에 raw value 저장 X·`~/.codex/private/consolidated/litheon.env`에 통합 (Litheon 운영 영역으로 분류·개인 명의 단계 메모 명시)

**핵심 동작**:
1. POST `/api/projects/{id}/imports` 라우트가 file 바이트를 service.uploadImport로 전달
2. service가 R2 객체 키 `{project_id}/{import_id}/{filename}` 경로에 PutObject
3. mime/extension에 따라 parser 선택·텍스트 추출 (in-memory 또는 R2에서 다시 GET)
4. 추출 결과를 Supabase `author_imports_text` 테이블에 저장 (parsed_text·heading_structure·page_spans)
5. parse_status 'parsed' → extract_status 'queued' (Phase 3 활성)
6. R2 zero egress = 재읽기·재추출 호출 시 비용 0

**제외**: `.hwp`·`.jtd`·`.scrivx`·옵시디언 vault sync (별 cycle).

**Acceptance criteria**:
- [ ] `.md` 100KB 업로드 → frontmatter 분리·본문 텍스트 추출 ≤ 2초
- [ ] `.docx` 1MB 업로드 → 본문 텍스트 추출 ≤ 5초·heading 구조 보존
- [ ] `.pdf` 5MB 업로드 → 텍스트 + page span 정보 ≤ 30초
- [ ] `.txt` UTF-8/EUC-KR 자동 검출
- [ ] 업로드 실패 (size·MIME·corruption) 시 `parse_status: 'failed'·error_message`

### Phase 2 — Anthropic SDK + BYOK Runtime

**입력**: Anthropic API 호출 요청 (prompt·model·max_tokens 등)
**출력**: 응답 stream 또는 structured JSON

**변경 대상**:

```
src/lib/author/llm/                      (NEW dir)
  ├─ anthropic-client.ts (SDK wrapper)
  ├─ byok-resolver.ts    (BYOK 키 우선·없으면 Litheon dev key fallback·테스트만)
  └─ types.ts            (LLMRequest·LLMResponse·LLMError)
src/lib/byok/index.ts                    (export resolver)
```

**핵심 동작**:
1. `byokResolver(userId, projectId)` → 등록된 작가 자기 키 조회·없으면 production에서 error·dev에서만 Litheon dev key fallback
2. anthropicClient.generate({prompt, model, max_tokens, system, response_format})
3. rate limit (429) 자동 backoff·error 표준화·token usage 카운트
4. 응답에 `provider: 'anthropic'·model·tokens_used·request_id` 메타 포함

**제외**: OpenAI·Bedrock·Vertex (별 provider는 Phase 6+).

**Acceptance criteria**:
- [ ] BYOK 키 등록된 작가 → 자기 계정으로 호출·작가 카드에서 token usage 확인 가능
- [ ] BYOK 미등록 production 사용자 → `LLMError: BYOK_REQUIRED` 명확
- [ ] 429 시 exponential backoff (1s·2s·4s·8s)·max 3 retry
- [ ] response_format: 'json'·'text' 둘 다 지원
- [ ] 토큰 누적 — `model_usage` 테이블에 (project_id·user_id·model·tokens_in·tokens_out·timestamp)

### Phase 3 — Extraction Prompt + Structured Output

**입력**: parsed_text·source 메타 (file_path·document_id)
**출력**: AuthorUiCandidate[] structured array

**변경 대상**:

```
src/lib/author/extraction/               (NEW dir)
  ├─ prompts/
  │   ├─ extract-character.md   (캐릭터 추출 prompt)
  │   ├─ extract-world-rule.md  (세계관 룰)
  │   ├─ extract-event.md       (사건)
  │   ├─ extract-relationship.md
  │   └─ extract-voice-sample.md
  ├─ schemas/
  │   ├─ candidate-character.json (JSON schema)
  │   ├─ candidate-world-rule.json
  │   └─ ... (per type)
  ├─ extractor.ts                (orchestrator)
  └─ validator.ts                (canon_authority_rules.md 머신 enforce)
src/lib/author/ui/service.ts             (replace fixture extract step)
docs/knot-input/canon_authority_rules.md (referenced for validator)
```

**핵심 동작**:
1. parsed_text → text 청크 분할 (~3000 tokens chunks)
2. 각 청크에 대해 5 type extraction prompts 병렬 호출 (Phase 2 anthropicClient)
3. 응답 JSON schema validate
4. `validator.ts`에서 canon authority rules 적용:
   - tier 분류 (1·2·3 자동·confidence score 기반)
   - scope 분류 (global·short1·short2·short3·main — 작가 컨텍스트 기반)
   - forbidden words 차단 (자서가·제3안내문·역천자·호명자 등 v3.7.9 룰)
   - duplicate detection (기존 entity 중복 시 `related_existing` 채움)
5. AuthorUiCandidate 적재·websocket emit `candidate.added`

**Acceptance criteria**:
- [ ] KNOT short1-characters.md (1492줄) 입력 → 7+ character candidate 추출
- [ ] short1-characters-supporting.md → 8+ supporting 추출
- [ ] eval seed v3 100 cases 중 character_knowledge·voice_consistency·forbidden 카테고리 통과율 ≥ 80%
- [ ] forbidden_in_scope 위반 0건 (단편 1 scope에 본편 능력 노출 X)
- [ ] tier 분류 정합 — character_registry.json 기존 entity와 비교 시 일치율 ≥ 85%

### Phase 4 — Character Backlog Generation (special case of Phase 3)

**입력**: character_id + 작가 요청 (예: "좋아하는 것·싫어하는 것 5~7 후보")
**출력**: Backlog candidates (`AuthorUiCandidate[]` with type='persona_attribute')

**변경 대상**:

```
src/lib/author/extraction/prompts/
  └─ generate-backlog.md            (NEW — character bible inject + 운용 원칙)
src/lib/author/extraction/extractor.ts (add generateBacklog method)
src/app/api/projects/[projectId]/characters/[characterId]/backlog/route.ts (NEW endpoint POST)
src/hooks/useAuthorMemoryV3.ts        (add useGenerateBacklog mutation)
src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx
                                      (Character screen에 "Generate backlog" 버튼)
```

**Prompt 사양** (generate-backlog.md):
- character bible §X.3 성격 코어·§X.4 말투·§X.6 모에 포인트 inject
- detail-guide §X.6 기존 좋아하는 것·싫어하는 것 (있으면) inject·없으면 빈 slot
- short1-character-detail-guide.md §0 운용 원칙 inject ("취향은 행동 단서로만"·"과한 펼침 X"·"일러 금지선"·"Tier 2 떡밥 X")
- 출력 JSON: `{candidates: [{category: '좋아하는 것'|'싫어하는 것'|'작은 보상'|'작은 짜증', content: string, rationale: string, tier: 1|2, scope: 'short1'}]}`
- 5~7 항목 per category

**머신 검증** (validator):
- 일러 금지선 위반 단어 차단 (예: 소리에 "고양이 귀"·룰루에 "성인 마녀풍")
- forbidden words 차단 (능력 단어·tier 2 단어)
- 중복 차단 (다른 캐릭 backlog와 동일 항목 시 `conflict.detected`)
- canon_version 정합

**Acceptance criteria**:
- [ ] 소리·레이카·나나·룰루·유이 5명에 대해 generate 호출 → 각자 5~7 후보
- [ ] 운용 원칙 위반 0건 (manual review로 확인)
- [ ] 캐릭 간 중복 후보 0건 (예: 두 캐릭 모두 "옥상 바람" 좋아하면 conflict emit)
- [ ] 작가가 검수 큐에서 단축키로 승인·거부·수정 가능
- [ ] 승인 후 detail-guide §X.6에 자동 sync (선택·또는 수동 export)

### Phase 5 — Persistent Audit Log + Replay

**입력**: 모든 mutation·LLM 호출·작가 결정
**출력**: 영속 trace + Replay 가능 ID

**변경 대상**:

```
supabase/migrations/2026MMDD_author_audit_log.sql  (NEW table)
src/lib/author/audit/                              (NEW dir)
  ├─ logger.ts        (write·search)
  ├─ replay.ts        (replay by decision_id)
  └─ types.ts
src/lib/author/memory-v3/runner.ts                 (refactor — write audit on each step)
src/app/api/projects/[projectId]/audit/route.ts    (NEW endpoint GET·search by date·user·event)
```

**Schema** (`author_audit_log` table):

```sql
CREATE TABLE author_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'import.upload', 'import.parsed', 'import.failed',
    'candidate.added', 'candidate.decided', 'candidate.batch_decided',
    'character.updated', 'conflict.resolved',
    'simulation.run', 'simulation.replay', 'backlog.generated'
  )),
  payload JSONB NOT NULL,
  llm_meta JSONB,        -- {provider, model, tokens_in, tokens_out, request_id, prompt_hash}
  source_span JSONB,     -- {document_id, file_path, start_line, end_line}
  decision_id UUID,      -- audit chain
  parent_decision_id UUID REFERENCES author_audit_log(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- RLS: user_id ownership
);
CREATE INDEX idx_audit_project_event ON author_audit_log(project_id, event_type, created_at DESC);
CREATE INDEX idx_audit_decision ON author_audit_log(decision_id);
```

**핵심 동작**:
1. 모든 mutation·LLM 호출이 `auditLogger.log({event_type, payload, llm_meta?, source_span?, decision_id?})` 호출
2. parent_decision_id로 chain 형성·Replay 시 chain follow
3. RLS — 작가 본인 project_id만 읽기·tenant 격리
4. Replay endpoint — `decision_id` 입력 → 그 시점부터 재현·deterministic mode (LLM seed·temperature 기록 시) 또는 drift 표시

**Acceptance criteria**:
- [ ] 모든 mutation이 audit_log에 기록·in-memory 의존 0
- [ ] LLM 호출 시 prompt hash·tokens·model 모두 기록
- [ ] Replay (decision_id) → 해당 시점 + 이후 chain 재현
- [ ] 30일 후에도 검색·인용 가능
- [ ] RLS 검증 — 다른 작가 데이터 cross-tenant 누설 0

## 6. KNOT Boundary 정합

[feedback_seizn_knot_separation.md](C:/Users/admin/.claude/projects/c--Users-admin--codex/memory/feedback_seizn_knot_separation.md):

- KNOT은 *내부 dogfood* 허용 — 본 통합의 첫 사용 케이스
- 외부 산출물 (마케팅·landing·docs·blog·case study) 노출 0건
- 본 spec의 KNOT 언급은 *내부 검증 use case*만·외부 공개 docs 진입 시 sample IP로 교체

## 7. Cost 추정

5명 backlog generation 1회 (Phase 4 작동 시):
- 입력: character bible (~50K tokens) + detail-guide (~15K tokens) = ~65K tokens × 5명 = ~325K tokens
- 출력: 5명 × 5~7 후보 × ~200 tokens = ~7K tokens
- Opus 4.7 가격: $15/1M input·$75/1M output
- **5명 1회 generation = ~$5~10**

KNOT 단편 1 풀 검수 (모든 35 Day 본문 + 100 case eval):
- ~$200~300 (이전 추산 유지)

Celovin BYOK으로 직접 결제·entity 분리 정합.

## 8. Verification Gates

본 통합 완료 검증 — 다음 모두 통과:

- [ ] Phase 1~5 acceptance criteria 모두 충족
- [ ] eval seed v3 100 case 자동 검증 통과율 ≥ 80%
- [ ] KNOT 5명 backlog (소리·레이카·나나·룰루·유이) generation·작가 검수·detail-guide §X.6 sync까지 풀 흐름 작동
- [ ] BYOK 미등록 production 사용자에 명확 error
- [ ] audit_log 영속·재시작 후 검색 가능
- [ ] forbidden words·tier·scope·일러 금지선 머신 enforce 0 위반
- [ ] KNOT 자료 외부 surface 노출 0건 (`docs/marketing/`·landing·blog 0)

## 9. Non-Goals

다음은 본 통합 *범위 외*·별 cycle:

- `.hwp`·`.jtd`·`.scrivx`·옵시디언 vault sync (Phase 1 Korean·Japanese·Scrivener 입력)
- OpenAI·Bedrock·Vertex provider (Anthropic Opus 4.7 단일)
- 멀티 user 협업·realtime collaboration (단일 작가 단일 세션)
- 이미지·일러 생성·image embedding (텍스트만)
- 외부 작가 베타 모집·case study (W3+ 별 brief)
- engine.seizn.com NPC SDK 측 변경 (별 surface)

## 10. Open Decisions (구현 단계 사용자 결정)

Codex 작업 중 또는 후 결정 필요:

- R2 bucket region (`wnam`·`apac`·`weur` 중)·신규 `seizn-author-uploads-temp` bucket 생성 (개인 iruhana25 임시·자세히 §11)
- Phase 4 generate-backlog prompt 테스트 케이스 — KNOT 외 합성 sample IP 5인 추가 (외부 공개용)
- Replay UI — 단순 list view·또는 timeline·또는 graph
- 작가 backlog 자동 sync to detail-guide.md 옵션 — 기본 OFF (수동 export)·또는 ON
- conflict 검출 시 작가에게 알림 방식 — toast·sidebar 뱃지·email·둘 다

이 문서와 짝 task pack [seizn-author-memory-v3-llm-integration-tasks.md](seizn-author-memory-v3-llm-integration-tasks.md) 참조.

## 11. ⚠️ Litheon Migration Gate (W6 launch 전 강제)

**현 상태 (2026-05-02)**:
- Litheon LLC 카드 발급 불가 — 시작 단계 인프라(R2·Anthropic BYOK·Stripe·Supabase 결제)를 *개인 명의 (iruhana25)*로 임시 운영
- 베타·내부 dogfood 단계 (W0~W5)·외부 작가 가입 X·약관 노출 X
- entity 분리 회계상 *개인 → Litheon 무이자 대여* 또는 *개인 자본 출자* 형식 ([feedback_entity_separation_ip.md](C:/Users/admin/.claude/projects/c--Users-admin--codex/memory/feedback_entity_separation_ip.md))

**강제 룰**:
- 외부 launch (W6 시점) 시 데이터 controller·privacy policy에 *Litheon LLC, Wyoming, USA* 표기 = 실 인프라도 Litheon 명의여야 정합
- 만약 W6까지 이전 못 하면 → **launch 연기**·외부 작가 가입 X·약관·표시광고법 위반 회피
- Celovin 명의 임시 운영 절대 X (KNOT·Seizn entity 분리 위반)

**이전 트리거 (W3~W5)**:

자금 조달 옵션 — 다음 중 하나라도 가능 시 즉시 시작:
- Mercury·Wise Business·Brex·기타 Wyoming LLC 친화 디지털 뱅킹 가입 시도 (EIN 있으면 ~30분)
- Anthropic Claude for Startups·기타 크레딧 프로그램 신청
- 개인 → Litheon 자본금 출자 (~$100~500·문서화)
- 외부 베타 작가 1인 결제 받음 (수익 $39+)·이를 Litheon 첫 매출로 카드 발급 자격 획득

**이전 SOP** (Phase 6·task pack §Phase 6 참조):

```text
1. Litheon Cloudflare 계정 신규 또는 기존 계정에 R2 활성화
2. 신규 bucket: seizn-author-uploads (정식·Litheon 명의)
3. 객체 일괄 복사 (rclone 또는 wrangler r2 object cp)·integrity 검증 (SHA256)
4. R2 endpoint·access key·env 갱신 (.env·Vercel·Supabase Edge)
5. 코드: R2_BUCKET 변수 갱신·재배포
6. 검증 — 신규 업로드·기존 객체 GET 정상
7. 임시 bucket (seizn-author-uploads-temp) 객체 삭제·bucket 폐기
8. Anthropic BYOK 키 — Celovin은 KNOT 처리만·Seizn 인프라 결제는 Litheon 카드 직접 (BYOK 작가 측은 그대로)
9. Supabase 결제 카드·Stripe Atlas 등 Litheon 명의 갱신
10. 회계 — 개인 → Litheon 정산·또는 자본금 처리·문서화
```

**점검**: W3 시점에 carry-over 상태 확인·W5까지 못 하면 W6 launch 연기 결정.
