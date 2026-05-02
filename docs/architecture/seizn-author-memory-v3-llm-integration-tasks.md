---
doc_type: codex-task-pack
version: v1
generated_at: 2026-05-02
status: handoff-ready
applies_to: Seizn Author Memory v3 LLM integration — Codex sequential dispatch
audience: Codex CLI implementation agents
pair_with: seizn-author-memory-v3-llm-integration.md
dispatch_rule: Sequential only (per feedback_codex_sequential_execution.md). Each phase = separate Codex run.
---

# Seizn Author Memory v3 LLM Integration — Codex Task Pack

> Phase 1~5 sequential dispatch. 한 phase 완료 + verify 통과 후 다음 phase 시작. 병렬 X.

## 디스패치 표준 양식 ([feedback_codex_dispatch_template.md](C:/Users/admin/.claude/projects/c--Users-admin--codex/memory/feedback_codex_dispatch_template.md) 정합)

각 phase별로 다음 3 줄 형식 사용:

```text
작업 디렉토리: C:/Users/admin/Projects/seizn
실행 대상: <phase 별 task 명시>
지침 분리 문서: docs/architecture/seizn-author-memory-v3-llm-integration.md (design spec) + 본 task pack §<phase>
```

## 사전 준비 (Phase 1 시작 전)

사용자가 직접 처리 (Codex 권한 외):

1. **Cloudflare R2 셋업** (Litheon 계정):
   - Cloudflare Dashboard → R2 → `seizn-author-uploads` bucket 신규 생성
   - region 선택 (`wnam` 또는 `apac` 권장)
   - API token 발급: Object Read·Write 권한·해당 bucket scope
   - 토큰을 `~/.codex/private/consolidated/litheon.env`에 등록 ([feedback_no_secrets_in_memory.md](C:/Users/admin/.claude/projects/c--Users-admin--codex/memory/feedback_no_secrets_in_memory.md)·메모리 raw value X):
     ```
     R2_ACCOUNT_ID=...
     R2_ACCESS_KEY_ID=...
     R2_SECRET_ACCESS_KEY=...
     R2_BUCKET=seizn-author-uploads
     R2_REGION=auto
     ```

2. **Anthropic BYOK 키 (Celovin 명의)**:
   - Celovin Anthropic 계정 생성 (이미 있으면 OK)
   - API key 발급
   - `~/.codex/private/consolidated/celovin.env`에 `ANTHROPIC_API_KEY_CELOVIN_BYOK=sk-ant-...` 등록
   - 또는 Seizn DB에 BYOK 등록 흐름으로 (Phase 2가 만든 후) 등록

3. **Supabase 마이그레이션 검증**:
   - 기존 Supabase 프로젝트 (Seoul region) 연결 확인·`supabase db push` 권한
   - 새 마이그레이션 파일 추가 권한

4. **테스트 환경 변수**:
   ```
   AUTHOR_UI_ENABLED=1
   AUTHOR_UI_ALLOWED_EMAILS=iruhana25@gmail.com
   ```
   `.env.local`·dev 환경에 설정 (production 배포는 추후)

## Phase 1 — File Persistence + Parsing

**디스패치 prompt**:

```text
작업 디렉토리: C:/Users/admin/Projects/seizn
실행 대상:
  1. src/lib/author/storage/r2-store.ts 신규 — Cloudflare R2 S3-compatible adapter
     (PutObject·GetObject·DeleteObject·signed URL 발급·error 표준화)
  2. src/lib/author/parser/ 신규 dir — md.ts·docx.ts·pdf.ts·txt.ts
  3. src/lib/author/ui/service.ts uploadImport refactor — file 바이트 받아 R2 업로드 + parser 호출
  4. src/app/api/projects/[projectId]/imports/route.ts refactor — multipart file pass-through
  5. supabase/migrations/<NEXT_TIMESTAMP>_author_imports_text.sql 신규
지침 분리 문서: docs/architecture/seizn-author-memory-v3-llm-integration.md §5 Phase 1 +
                docs/architecture/seizn-author-memory-v3-llm-integration-tasks.md §Phase 1
```

**구체 변경 파일**:

```
NEW   src/lib/author/storage/r2-store.ts
NEW   src/lib/author/parser/md.ts
NEW   src/lib/author/parser/docx.ts
NEW   src/lib/author/parser/pdf.ts
NEW   src/lib/author/parser/txt.ts
NEW   src/lib/author/parser/index.ts (router by mime/extension)
EDIT  src/lib/author/ui/service.ts (uploadImport: 라인 298~329 refactor)
EDIT  src/app/api/projects/[projectId]/imports/route.ts (file bytes pass-through)
NEW   supabase/migrations/<TS>_author_imports_text.sql
EDIT  package.json (deps: @aws-sdk/client-s3·gray-matter·remark·mammoth·pdf-parse)
EDIT  .env.example (R2 변수)
```

**의존성 추가** (package.json):

- `@aws-sdk/client-s3` (R2 S3-compatible)
- `gray-matter` (md frontmatter)
- `remark` + `remark-parse` (md AST)
- `mammoth` (docx → html/text)
- `pdf-parse` (pdf 텍스트 + page span)
- `iconv-lite` (UTF-8/EUC-KR 검출·변환)

**Migration SQL 골격**:

```sql
CREATE TABLE author_imports_text (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  parsed_text TEXT NOT NULL,
  heading_structure JSONB,
  page_spans JSONB,
  parser_version TEXT NOT NULL,
  parsed_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_import UNIQUE (import_id)
);
CREATE INDEX idx_imports_text_project ON author_imports_text(project_id);
ALTER TABLE author_imports_text ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user own imports text" ON author_imports_text
  FOR ALL USING (user_id = auth.uid());
```

**Acceptance criteria** (Codex 자체 검증):

- [ ] `npm test` 통과 (parser 단위 테스트 5종 추가·각 mime 1+ fixture)
- [ ] 로컬 dev `npm run dev` → `/dashboard/author` Inbox에 .md 업로드 → 본문 텍스트 추출 확인
- [ ] R2 콘솔에서 객체 적재 확인 (key: `{project_id}/{import_id}/{filename}`)
- [ ] `author_imports_text` 테이블에 parsed_text 1행 추가 확인
- [ ] 업로드 실패 (size > 50MB·MIME 미지원) 시 `parse_status: 'failed'·error_message` 명확
- [ ] `.hwp`·`.jtd`·`.scrivx` 업로드 시 `error_message: 'unsupported_format'` 반환

**dispatch 후 Claude 검증**:

- 변경 파일 diff 검토
- R2 객체 키·SQL schema·parser 동작 sample 확인
- 통과 시 Phase 2 dispatch

## Phase 2 — Anthropic SDK + BYOK Runtime

**디스패치 prompt**:

```text
작업 디렉토리: C:/Users/admin/Projects/seizn
실행 대상:
  1. src/lib/author/llm/ 신규 dir — anthropic-client.ts·byok-resolver.ts·types.ts
  2. src/lib/byok/index.ts에 byokResolver export 추가
  3. 기존 BYOK API endpoint와 통합 — etrieved 키를 LLM 호출에 적용
  4. model_usage 테이블 마이그레이션 (token usage 누적)
  5. 단위 테스트 (mock Anthropic API + BYOK 분기)
지침 분리 문서: docs/architecture/seizn-author-memory-v3-llm-integration.md §5 Phase 2 +
                docs/architecture/seizn-author-memory-v3-llm-integration-tasks.md §Phase 2
```

**구체 변경 파일**:

```
NEW   src/lib/author/llm/anthropic-client.ts
NEW   src/lib/author/llm/byok-resolver.ts
NEW   src/lib/author/llm/types.ts
NEW   src/lib/author/llm/index.ts
EDIT  src/lib/byok/index.ts (export resolver)
NEW   supabase/migrations/<TS>_model_usage.sql
NEW   src/__tests__/author/llm/anthropic-client.test.ts
NEW   src/__tests__/author/llm/byok-resolver.test.ts
EDIT  package.json (deps: @anthropic-ai/sdk)
```

**Migration SQL**:

```sql
CREATE TABLE model_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  provider TEXT NOT NULL CHECK (provider IN ('anthropic')),
  model TEXT NOT NULL,
  tokens_in INT NOT NULL,
  tokens_out INT NOT NULL,
  cost_usd NUMERIC(10, 6),
  byok BOOLEAN NOT NULL DEFAULT FALSE,
  request_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_model_usage_user_date ON model_usage(user_id, created_at DESC);
```

**Acceptance criteria**:

- [ ] BYOK 등록된 사용자 → 자기 키로 호출·response 정상
- [ ] BYOK 미등록 production → `LLMError: BYOK_REQUIRED` 명확
- [ ] dev 환경 (NODE_ENV !== 'production') → Litheon dev key fallback 작동
- [ ] 429 rate limit → exponential backoff 1·2·4·8s·max 3 retry
- [ ] response_format JSON 강제 시 schema 검증 통과
- [ ] model_usage 테이블에 호출당 1행 누적
- [ ] BYOK 키 raw value 로그·trace에 노출 0 ([feedback_no_secrets_in_memory.md](C:/Users/admin/.claude/projects/c--Users-admin--codex/memory/feedback_no_secrets_in_memory.md))

## Phase 3 — Extraction Prompt + Structured Output

**디스패치 prompt**:

```text
작업 디렉토리: C:/Users/admin/Projects/seizn
실행 대상:
  1. src/lib/author/extraction/ 신규 dir — prompts/·schemas/·extractor.ts·validator.ts
  2. src/lib/author/ui/service.ts extract step refactor (fixture → real LLM 호출)
  3. canon authority rules validator (forbidden words·tier·scope)
  4. eval seed v3 100 case로 자동 검증 harness
지침 분리 문서: docs/architecture/seizn-author-memory-v3-llm-integration.md §5 Phase 3 +
                docs/architecture/seizn-author-memory-v3-llm-integration-tasks.md §Phase 3
```

**구체 변경 파일**:

```
NEW   src/lib/author/extraction/prompts/extract-character.md
NEW   src/lib/author/extraction/prompts/extract-world-rule.md
NEW   src/lib/author/extraction/prompts/extract-event.md
NEW   src/lib/author/extraction/prompts/extract-relationship.md
NEW   src/lib/author/extraction/prompts/extract-voice-sample.md
NEW   src/lib/author/extraction/schemas/candidate-character.json
NEW   src/lib/author/extraction/schemas/candidate-world-rule.json
NEW   src/lib/author/extraction/schemas/candidate-event.json
NEW   src/lib/author/extraction/schemas/candidate-relationship.json
NEW   src/lib/author/extraction/schemas/candidate-voice-sample.json
NEW   src/lib/author/extraction/extractor.ts (orchestrator)
NEW   src/lib/author/extraction/validator.ts (canon authority enforce)
NEW   src/lib/author/extraction/index.ts
EDIT  src/lib/author/ui/service.ts (라인 ~903 fixture 영역 → extractor 호출)
NEW   src/__tests__/author/extraction/eval-seed-v3.test.ts
NEW   docs/knot-input/canon_authority_rules_machine.json (validator 머신 룰)
```

**Validator 룰 출처** (`docs/knot-input/canon_authority_rules.md` → JSON 변환):

- forbidden words: `자서가·제3안내문·역천자·호명자·말소·잔향` (v3.7.9)
- tier 분류: confidence + scope 조합
- scope: `global·short1·short2·short3·main`·작가 컨텍스트 기반 자동 추론
- duplicate detection: character_registry·world_rule_registry 기존 entity와 비교 (cosine similarity ≥ 0.85)

**Acceptance criteria**:

- [ ] KNOT short1-characters.md 입력 → 7+ character candidate 추출·기존 character_registry와 일치율 ≥ 85%
- [ ] short1-characters-supporting.md → 8+ supporting 추출
- [ ] eval seed v3 100 case 자동 검증 통과율 ≥ 80%
- [ ] forbidden_in_scope 위반 0건
- [ ] tier 분류 정합 ≥ 85%
- [ ] candidate JSON schema validate 100%
- [ ] 호출 비용 1 chunk (~3K tokens) ≤ $0.10

## Phase 4 — Character Backlog Generation

**디스패치 prompt**:

```text
작업 디렉토리: C:/Users/admin/Projects/seizn
실행 대상:
  1. src/lib/author/extraction/prompts/generate-backlog.md 신규
  2. src/lib/author/extraction/extractor.ts에 generateBacklog() 추가
  3. src/app/api/projects/[projectId]/characters/[characterId]/backlog/route.ts 신규
  4. src/hooks/useAuthorMemoryV3.ts에 useGenerateBacklog mutation 추가
  5. UI: src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx Character screen에
     "Generate backlog" 버튼·생성 결과 inline preview·Review Queue에 적재
  6. KNOT 5명 (소리·레이카·나나·룰루·유이) 풀 generation E2E 테스트
지침 분리 문서: docs/architecture/seizn-author-memory-v3-llm-integration.md §5 Phase 4 +
                docs/architecture/seizn-author-memory-v3-llm-integration-tasks.md §Phase 4
```

**generate-backlog.md prompt 골격** (Codex가 풀 작성):

```
You are an internal authoring assistant for a long-running fiction IP. You receive
a character bible and a detail guide for one character, and propose 5~7 candidate
items for one of these categories: 좋아하는 것 / 싫어하는 것 / 작은 보상 / 작은 짜증.

Strict rules (machine-enforced):
- Each candidate must be a *behavior cue*, not a list of facts (per detail-guide §0).
- Do not introduce mascot/animal traits beyond what is canonical.
- Do not reveal Tier 2 (author_only) facts.
- Do not use forbidden words: <list>.
- Do not duplicate items already present in other characters' lists.

Output JSON: {candidates: [{category, content, rationale, tier, scope}]}

Character bible (§X.3·§X.4·§X.6 inject):
<character_bible>

Existing detail guide §X.6 (current entries to avoid duplicating):
<existing_entries>

Operating principles (§0):
<principles>

Forbidden words list:
<forbidden>
```

**구체 변경 파일**:

```
NEW   src/lib/author/extraction/prompts/generate-backlog.md
EDIT  src/lib/author/extraction/extractor.ts (generateBacklog method)
NEW   src/app/api/projects/[projectId]/characters/[characterId]/backlog/route.ts
EDIT  src/hooks/useAuthorMemoryV3.ts (useGenerateBacklog)
EDIT  src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx (Character screen UI)
NEW   src/__tests__/author/extraction/generate-backlog.test.ts (KNOT 5명 e2e)
```

**Acceptance criteria**:

- [ ] 5명 모두 generate 호출 → 각자 5~7 후보 (4 카테고리)
- [ ] 운용 원칙 위반 manual review 0 (사용자 검수 후 재확인)
- [ ] 캐릭 간 중복 후보 0건 (validator가 conflict.detected emit)
- [ ] 작가가 검수 큐에서 단축키 작동
- [ ] 호출 비용 5명 1회 = ~$5~10 (이전 추산 정합)
- [ ] generation 결과를 detail-guide.md §X.6에 export 옵션 작동 (CLI 또는 API)

## Phase 5 — Persistent Audit Log + Replay

**디스패치 prompt**:

```text
작업 디렉토리: C:/Users/admin/Projects/seizn
실행 대상:
  1. supabase/migrations/<TS>_author_audit_log.sql 신규
  2. src/lib/author/audit/ 신규 dir — logger.ts·replay.ts·types.ts
  3. src/lib/author/memory-v3/runner.ts refactor — 모든 step에 audit.log() 호출
  4. src/app/api/projects/[projectId]/audit/route.ts 신규 (GET·search)
  5. UI: 작가용 Audit Log viewer (간단 list view·Phase 5 한정·timeline·graph는 별 cycle)
  6. Replay E2E 테스트 (decision_id 입력 → 재현 deterministic check)
지침 분리 문서: docs/architecture/seizn-author-memory-v3-llm-integration.md §5 Phase 5 +
                docs/architecture/seizn-author-memory-v3-llm-integration-tasks.md §Phase 5
```

**구체 변경 파일**:

```
NEW   supabase/migrations/<TS>_author_audit_log.sql
NEW   src/lib/author/audit/logger.ts
NEW   src/lib/author/audit/replay.ts
NEW   src/lib/author/audit/types.ts
NEW   src/lib/author/audit/index.ts
EDIT  src/lib/author/memory-v3/runner.ts (모든 step audit.log 호출)
EDIT  src/lib/author/ui/service.ts (mutation들에 audit.log)
NEW   src/app/api/projects/[projectId]/audit/route.ts
NEW   src/app/(dashboard)/dashboard/author/audit-log-view.tsx (UI 컴포넌트)
EDIT  src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx (Audit screen 추가·8th screen 또는 모달)
NEW   src/__tests__/author/audit/replay.test.ts
```

**Migration SQL**:

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
  llm_meta JSONB,
  source_span JSONB,
  decision_id UUID,
  parent_decision_id UUID REFERENCES author_audit_log(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_project_event ON author_audit_log(project_id, event_type, created_at DESC);
CREATE INDEX idx_audit_decision ON author_audit_log(decision_id);
ALTER TABLE author_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user own audit log" ON author_audit_log
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "service role insert" ON author_audit_log
  FOR INSERT WITH CHECK (true);  -- service role only
```

**Acceptance criteria**:

- [ ] 모든 mutation·LLM 호출이 audit_log에 기록·in-memory 의존 0
- [ ] LLM 호출 시 prompt hash·tokens·model 모두 llm_meta에 기록
- [ ] Replay (decision_id) → 그 시점·이후 chain 재현
- [ ] 재시작 후에도 검색·인용 가능
- [ ] RLS 검증 — 다른 작가 cross-tenant 누설 0
- [ ] payload·llm_meta·source_span에 secret 키 raw value 노출 0

## 통합 검증 (5 phase 완료 후)

내가 진행:

1. KNOT 5명 (소리·레이카·나나·룰루·유이) backlog generation E2E
2. 작가 검수 (단축키) → canon promote
3. detail-guide.md §X.6 sync (수동 또는 자동)
4. audit_log에 chain 풀 기록 확인
5. Replay (어제 결정) → 동일 결과 검증
6. eval seed v3 100 case 자동 검증 통과율 측정

통과 시:
- decisions.md에 `2026-MM-DD: Author Memory v3 LLM 통합 완료` 결정 블록
- canon_version bump (v3.7.9azay 또는 다음 식별자)
- `seizn-pivot-creative-writing-2026-05.md` 메모리에 PMF 검증 진척 기록

## 시간 추정

| Phase | Codex 시간 (working) |
|---|---|
| Phase 1 (file·parser) | 0.5~1 day |
| Phase 2 (LLM·BYOK) | 0.5~1 day |
| Phase 3 (extraction·validator) | 1~1.5 day |
| Phase 4 (backlog generation) | 0.5~1 day |
| Phase 5 (audit·replay) | 0.5~1 day |
| **합계** | **3~5.5 working days** |

순차 실행이라 calendar 시간 ~1주~10일. 사용자 검증·결정 시간 추가 가능.

## 주의 사항

- **Codex 병렬 dispatch X** ([feedback_codex_sequential_execution.md](C:/Users/admin/.claude/projects/c--Users-admin--codex/memory/feedback_codex_sequential_execution.md))
- 각 phase 완료 후 commit·push·내 검증 통과 후 다음 phase
- 도중 SQL migration 실패·타입 깨짐 등 발생 시 *즉시 stop*·내가 받아서 진단
- KNOT 자료 외부 surface 노출 0 ([feedback_seizn_knot_separation.md](C:/Users/admin/.claude/projects/c--Users-admin--codex/memory/feedback_seizn_knot_separation.md))
- BYOK·R2 키 raw value 메모리 저장 X ([feedback_no_secrets_in_memory.md](C:/Users/admin/.claude/projects/c--Users-admin--codex/memory/feedback_no_secrets_in_memory.md))
- 의존성 추가 시 license 검토 (mammoth·pdf-parse·gray-matter 모두 MIT·OK)
