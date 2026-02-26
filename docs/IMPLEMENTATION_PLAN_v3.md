# Seizn Implementation Plan v3

> Date: 2026-02-04 | Purpose: 남은 작업 + Intelligent Memory v3 + MindMap 통합 계획

---

## 현재 상태 요약

### 완료된 P0-P3 기능 ✅
- Tool Gating (620+ lines)
- Policy Pack Registry (550+ lines)
- Summer RAG (25 API routes, 1800+ lines)
- OIDC/SSO (PKCE + SAML + SCIM 2.0)
- RTBF Backend (UI 활성화 대기)

### 남은 기존 작업
| 기능 | 상태 | 예상 공수 |
|------|------|-----------|
| RTBF Dashboard UI | BACKEND | 3일 |
| Policy Pack Marketplace UI | PLANNED | 1주 |
| LlamaIndex Adapter | PLANNED | 1주 |
| Vercel AI SDK Adapter | PLANNED | 1주 |

---

## Phase 1: P0 - 기반 정비 (1-2주)

### 1.1 RTBF Dashboard UI 활성화
**파일**: `src/app/(dashboard)/dashboard/settings/settings-client.tsx`

**작업**:
- "Coming Soon" 버튼 → 실제 기능 연결
- RTBF 요청 모달 구현
- 삭제 상태 조회 UI
- 삭제 인증서 다운로드

**API 연동**:
```typescript
POST /api/winter/rtbf           // 삭제 요청
GET  /api/winter/rtbf/status    // 상태 조회
GET  /api/winter/rtbf/certificate // 인증서 다운로드
```

### 1.2 Memory v3 스키마 마이그레이션
**파일**: `supabase/migrations/20260204014_spring_memory_v3.sql`

**테이블 생성**:
```sql
-- v3 메모리 노트 (기존 memories 확장)
CREATE TABLE spring_memory_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES auth.users(id),
  org_id UUID REFERENCES organizations(id),
  workspace_id UUID,

  -- Scope & Type
  scope TEXT NOT NULL DEFAULT 'user' CHECK (scope IN ('user', 'workspace', 'org', 'session', 'agent')),
  note_type TEXT NOT NULL CHECK (note_type IN ('fact', 'preference', 'instruction', 'episode', 'procedure', 'relationship')),

  -- Content
  content TEXT NOT NULL,
  payload_json JSONB DEFAULT '{}',
  embedding vector(1536),

  -- Scoring
  confidence FLOAT DEFAULT 0.8 CHECK (confidence BETWEEN 0 AND 1),
  importance FLOAT DEFAULT 0.5 CHECK (importance BETWEEN 0 AND 1),
  utility_score FLOAT DEFAULT 0.5 CHECK (utility_score BETWEEN 0 AND 1),

  -- Validity
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_to TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,

  -- Status & Privacy
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'active', 'superseded', 'contradicted', 'deleted')),
  privacy_class TEXT NOT NULL DEFAULT 'internal' CHECK (privacy_class IN ('public', 'internal', 'confidential', 'restricted')),

  -- Provenance
  provenance_trace_id UUID,
  provenance_span_id TEXT,
  source_doc_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 그래프 엣지
CREATE TABLE spring_memory_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_note_id UUID NOT NULL REFERENCES spring_memory_notes(id) ON DELETE CASCADE,
  to_note_id UUID NOT NULL REFERENCES spring_memory_notes(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL CHECK (edge_type IN ('similar', 'supersedes', 'contradicts', 'derived_from', 'mentions_entity', 'part_of_cluster')),
  weight FLOAT DEFAULT 0.5 CHECK (weight BETWEEN 0 AND 1),
  evidence JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_note_id, to_note_id, edge_type)
);

-- 후보 큐 (사용자 승인용)
CREATE TABLE spring_memory_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID REFERENCES spring_memory_notes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  extraction_source TEXT NOT NULL, -- 'trace', 'api', 'document'
  raw_content TEXT NOT NULL,
  diff_json JSONB,
  reviewer_action TEXT CHECK (reviewer_action IN ('approved', 'rejected', 'edited')),
  reviewer_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 검증 워크플로우
CREATE TABLE spring_memory_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES spring_memory_notes(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('user_confirm', 'llm_check', 'doc_check', 'usage_signal')),
  result TEXT NOT NULL CHECK (result IN ('verified', 'invalidated', 'uncertain')),
  confidence_delta FLOAT,
  evidence JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_memory_notes_user ON spring_memory_notes(user_id);
CREATE INDEX idx_memory_notes_status ON spring_memory_notes(status);
CREATE INDEX idx_memory_notes_type ON spring_memory_notes(note_type);
CREATE INDEX idx_memory_notes_embedding ON spring_memory_notes USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_memory_edges_from ON spring_memory_edges(from_note_id);
CREATE INDEX idx_memory_edges_to ON spring_memory_edges(to_note_id);

-- RLS
ALTER TABLE spring_memory_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE spring_memory_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE spring_memory_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE spring_memory_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY memory_notes_user_policy ON spring_memory_notes
  FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY memory_edges_user_policy ON spring_memory_edges
  FOR ALL USING (
    EXISTS (SELECT 1 FROM spring_memory_notes WHERE id = from_note_id AND user_id = auth.uid()::text)
  );
CREATE POLICY memory_candidates_user_policy ON spring_memory_candidates
  FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY memory_verifications_user_policy ON spring_memory_verifications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM spring_memory_notes WHERE id = note_id AND user_id = auth.uid()::text)
  );
```

---

## Phase 2: P1 - 핵심 Memory v3 기능 (3-4주)

### 2.1 Typed Memory Notes + Provenance
**파일**: `src/lib/spring/memory-v3/`

```
src/lib/spring/memory-v3/
├── types.ts              # NoteType, MemoryNote, Edge 타입
├── service.ts            # CRUD + provenance 처리
├── extraction.ts         # trace/span/doc에서 노트 추출
├── index.ts
```

**핵심 타입**:
```typescript
// types.ts
export type NoteType = 'fact' | 'preference' | 'instruction' | 'episode' | 'procedure' | 'relationship';
export type NoteStatus = 'candidate' | 'active' | 'superseded' | 'contradicted' | 'deleted';
export type PrivacyClass = 'public' | 'internal' | 'confidential' | 'restricted';
export type EdgeType = 'similar' | 'supersedes' | 'contradicts' | 'derived_from' | 'mentions_entity' | 'part_of_cluster';

export interface MemoryNote {
  id: string;
  userId: string;
  orgId?: string;
  workspaceId?: string;
  scope: 'user' | 'workspace' | 'org' | 'session' | 'agent';
  noteType: NoteType;
  content: string;
  payloadJson?: Record<string, unknown>;
  embedding?: number[];
  confidence: number;
  importance: number;
  utilityScore: number;
  validFrom?: Date;
  validTo?: Date;
  lastVerifiedAt?: Date;
  status: NoteStatus;
  privacyClass: PrivacyClass;
  provenanceTraceId?: string;
  provenanceSpanId?: string;
  sourceDocId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoryEdge {
  id: string;
  fromNoteId: string;
  toNoteId: string;
  edgeType: EdgeType;
  weight: number;
  evidence?: Record<string, unknown>;
  createdAt: Date;
}
```

### 2.2 Candidate Queue + 승인 UX
**파일**:
- `src/lib/spring/memory-v3/candidate-queue.ts`
- `src/app/(dashboard)/dashboard/memories/candidates/page.tsx`
- `src/components/memory/CandidateReviewCard.tsx`

**기능**:
- LLM 추출 결과를 candidate 상태로 저장
- 사용자 승인/거부/수정 UI
- 자동 승인 옵션 (설정 가능)

**API**:
```typescript
GET  /api/spring/memory/candidates        // 후보 목록
POST /api/spring/memory/candidates/:id/approve
POST /api/spring/memory/candidates/:id/reject
POST /api/spring/memory/candidates/:id/edit
```

### 2.3 Contradiction & Supersession Engine
**파일**: `src/lib/spring/memory-v3/contradiction-engine.ts`

**알고리즘**:
1. 새 노트 저장 시 유사 노트 검색 (vector + keyword)
2. LLM으로 관계 판단: `supersedes` | `contradicts` | `duplicates` | `none`
3. 엣지 생성 + 기존 노트 상태 업데이트
4. Retrieval 시 최신/신뢰도 높은 노트 우선

**프롬프트 예시**:
```
Given two memory notes:
A: "{existing_note}"
B: "{new_note}"

Determine the relationship:
- supersedes: B replaces A with updated information
- contradicts: B and A have conflicting information
- duplicates: B is essentially the same as A
- none: A and B are independent

Respond with JSON: { "relation": "...", "reason": "...", "confidence": 0.0-1.0 }
```

### 2.4 Explain API (Why stored / Why recalled)
**파일**: `src/lib/spring/memory-v3/explain.ts`

**API**:
```typescript
GET /api/spring/memory/:id/explain
// Response:
{
  "stored": {
    "source": "trace",
    "traceId": "...",
    "spanId": "...",
    "extractionMethod": "llm",
    "policyApplied": ["auto_extract_facts"],
    "timestamp": "..."
  },
  "recalled": {  // 검색 시
    "query": "...",
    "score": 0.85,
    "scoreBreakdown": {
      "vector": 0.7,
      "keyword": 0.15,
      "graph": 0.1
    },
    "policyFilters": [],
    "excludedByPolicy": false
  }
}

GET /api/spring/memory/:id/provenance
// Response:
{
  "trace": { "id": "...", "name": "...", "timestamp": "..." },
  "span": { "id": "...", "name": "...", "tool": "..." },
  "sourceDocument": { "id": "...", "title": "..." },
  "extractionLog": [...]
}
```

---

## Phase 3: P2 - MindMap 서비스 (2-3주)

### 3.1 Graph Slice API
**파일**: `src/app/api/spring/mindmap/route.ts`

```typescript
// GET /api/spring/mindmap?scope=user&depth=3&types=fact,preference&since=30d
interface MindMapRequest {
  scope?: 'user' | 'workspace' | 'org';
  rootId?: string;  // 특정 노드 중심
  depth?: number;   // 그래프 깊이 (기본 3)
  types?: NoteType[];
  status?: NoteStatus[];
  privacyClass?: PrivacyClass[];
  since?: string;   // 예: '7d', '30d', '1y'
  limit?: number;   // 노드 수 제한
}

interface MindMapResponse {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  clusters?: Cluster[];
  layout?: LayoutHints;
}

interface MindMapNode {
  id: string;
  type: 'note' | 'entity' | 'cluster' | 'source';
  noteType?: NoteType;
  label: string;
  content?: string;
  importance: number;
  status: NoteStatus;
  privacyClass: PrivacyClass;
  isHidden: boolean;  // 민감 캡슐
  createdAt: string;
}

interface MindMapEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  weight: number;
}
```

### 3.2 Incremental Expansion API
**파일**: `src/app/api/spring/mindmap/expand/route.ts`

```typescript
// GET /api/spring/mindmap/expand?nodeId=...&depth=1
// 노드 클릭 시 주변만 로드 (대규모 그래프 대응)
```

### 3.3 MindMap UI (React Flow + ELK)
**파일**:
```
src/app/(dashboard)/dashboard/memories/mindmap/
├── page.tsx
├── MindMapCanvas.tsx       # React Flow 메인 캔버스
├── MindMapNode.tsx         # 커스텀 노드 컴포넌트
├── MindMapEdge.tsx         # 커스텀 엣지 컴포넌트
├── MindMapControls.tsx     # 줌/필터/레이아웃 컨트롤
├── MindMapFilters.tsx      # 시간/타입/상태 필터
├── NodeInspector.tsx       # 우측 상세 패널
└── hooks/
    ├── useMindMapData.ts   # 데이터 페칭/캐싱
    ├── useELKLayout.ts     # ELK.js 레이아웃 계산
    └── useNodeActions.ts   # 노드 액션 (삭제/수정/이동)
```

**의존성 추가**:
```json
{
  "reactflow": "^11.x",
  "elkjs": "^0.9.x",
  "@xyflow/react": "^12.x"
}
```

**레이아웃 전략**:
1. **기본**: ELK layered (계층형) - 읽기 좋음
2. **옵션**: Force-directed - 관계 탐색용
3. **클러스터**: 커뮤니티별 그룹 박스

### 3.4 Node Inspector Panel
**기능**:
- Content + Structured Payload 표시
- Provenance 링크 (Trace로 이동)
- Policy 태그
- **Actions**:
  - Edit (내용 수정)
  - Delete (삭제)
  - Mark Wrong (contradiction 표시)
  - Lock (수정 금지)
  - Move to Sensitive Capsule

### 3.5 Privacy-first "Sensitive Capsule"
**파일**: `src/lib/spring/memory-v3/sensitive-capsule.ts`

- `privacy_class = 'restricted'` 노트는 기본 검색에서 제외
- MindMap에서 기본 숨김 (toggle로 표시)
- 표시 시 2차 인증 또는 명시적 동의 필요

---

## Phase 4: P3 - 고급 기능 (4-6주)

### 4.1 Memory Distillation / Summarization
**파일**: `src/lib/spring/memory-v3/distillation.ts`

**Temporal Worker**: `consolidation-job`
1. 유사 에피소드 클러스터링
2. 클러스터별 요약 (semantic memory) 생성
3. 원본 에피소드 → cold tier 이동 / 가중치 감소
4. MindMap에 클러스터 노드 표시

### 4.2 Utility Scoring (성공/실패 기반)
**파일**: `src/lib/spring/memory-v3/utility-scorer.ts`

**신호 수집**:
- 특정 메모리가 포함된 run의 성공/실패
- 사용자 피드백 (thumbs up/down)
- hallucination 감지 여부

**스코어 업데이트**:
```typescript
utility_score = (success_rate * 0.5) + (feedback_score * 0.3) + (no_hallucination * 0.2)
```

### 4.3 Memory Sandbox (What-if / Fork)
**파일**:
- `src/lib/spring/memory-v3/sandbox.ts`
- `src/app/(dashboard)/dashboard/memories/sandbox/page.tsx`

**기능**:
- 특정 메모리 세트 on/off하고 가상 질문 실행
- "이 기억 없이 답변하면 어떻게 달라지나?" 비교
- Fall의 replay/diff와 연동

### 4.4 Truthiness / Validity (재검증)
**파일**: `src/lib/spring/memory-v3/verification.ts`

**트리거**:
- 일정 주기 (valid_to 도래)
- 실패/오답 신호 발생 시
- 사용자 명시적 요청

**검증 방법**:
1. `user_confirm`: "이게 아직 맞나요?" 질문
2. `llm_check`: 외부 소스로 사실 확인
3. `doc_check`: 원본 문서 재참조
4. `usage_signal`: 사용 패턴 분석

### 4.5 Personalized Context Packing
**파일**: `src/lib/spring/memory-v3/context-packer.ts`

**알고리즘**:
```typescript
function packContext(
  memories: MemoryNote[],
  tokenBudget: number,
  strategy: 'greedy' | 'knapsack' | 'learned'
): MemoryNote[] {
  // 1. importance + recency + utility 기반 정렬
  // 2. token budget 내 최적 선택
  // 3. 중복/모순 정리 (대표 1개 + 요약)
  // 4. diversity 보장 (너무 유사한 것 제외)
}
```

---

## Phase 5: SDK & 통합 (2-3주)

### 5.1 LlamaIndex Adapter
**파일**: `src/lib/integrations/llamaindex/`

```typescript
// SeizNMemoryRetriever - LlamaIndex VectorStoreRetriever 인터페이스 구현
export class SeizNMemoryRetriever extends BaseRetriever {
  constructor(config: SeizNConfig) {}
  async retrieve(query: string, topK?: number): Promise<NodeWithScore[]> {}
}

// SeizNVectorStore - LlamaIndex VectorStore 인터페이스 구현
export class SeizNVectorStore extends VectorStore {
  async add(nodes: BaseNode[]): Promise<string[]> {}
  async query(query: VectorStoreQuery): Promise<VectorStoreQueryResult> {}
}
```

### 5.2 Vercel AI SDK Adapter
**파일**: `src/lib/integrations/vercel-ai/`

```typescript
// 메모리 Provider
export function createSeizNMemoryProvider(config: SeizNConfig) {
  return {
    // AI SDK의 tool 형식으로 메모리 검색
    tools: {
      searchMemory: tool({
        description: 'Search user memories',
        parameters: z.object({ query: z.string() }),
        execute: async ({ query }) => {
          // SeizN Spring API 호출
        }
      }),
      storeMemory: tool({
        description: 'Store new memory',
        parameters: z.object({ content: z.string(), type: z.string() }),
        execute: async ({ content, type }) => {
          // SeizN Spring API 호출
        }
      })
    }
  };
}
```

### 5.3 Policy Pack Marketplace UI
**파일**: `src/app/(dashboard)/dashboard/marketplace/page.tsx`

**기능**:
- 공개 Policy Pack 목록/검색
- 상세 정보 (설명, 버전, 서명 상태)
- 원클릭 설치
- 설치된 팩 관리

---

## 우선순위 요약

| Phase | 작업 | 예상 공수 | 의존성 |
|-------|------|-----------|--------|
| **P0** | RTBF UI 활성화 | 3일 | - |
| **P0** | Memory v3 스키마 | 2일 | - |
| **P1** | Typed Notes + Provenance | 1주 | P0 |
| **P1** | Candidate Queue + UX | 1주 | P1-1 |
| **P1** | Contradiction Engine | 1주 | P1-1 |
| **P1** | Explain API | 3일 | P1-1 |
| **P2** | MindMap Graph API | 1주 | P1 |
| **P2** | MindMap UI (React Flow) | 2주 | P2-1 |
| **P2** | Sensitive Capsule | 3일 | P2-2 |
| **P3** | Memory Distillation | 1주 | P1 |
| **P3** | Utility Scoring | 1주 | P1, Fall |
| **P3** | Memory Sandbox | 1주 | P3-1 |
| **P3** | Verification | 1주 | P1 |
| **P3** | Context Packing | 1주 | P1 |
| **SDK** | LlamaIndex Adapter | 1주 | P1 |
| **SDK** | Vercel AI SDK | 1주 | P1 |
| **UI** | Marketplace | 1주 | Policy Pack |

---

## Definition of Done (DoD)

### Memory v3
- [ ] 새 노트가 typed format으로 저장되고 provenance 추적됨
- [ ] 후보 큐에서 사용자 승인/거부/수정 가능
- [ ] 모순/대체 관계가 자동 감지되고 retrieval에 반영됨
- [ ] "왜 저장/검색됐는지" explain API로 확인 가능

### MindMap
- [ ] 사용자가 30초 내 "내 저장 정보" 이해 가능
- [ ] 노드 클릭 시 provenance/why stored 확인 가능
- [ ] 삭제/수정/민감 캡슐 이동이 즉시 반영되고 audit 기록됨
- [ ] 1k nodes에서 UI 60fps 유지 (또는 허용 가능한 체감)
- [ ] 정책으로 숨겨진 노드는 UI/API 모두에서 노출되지 않음

### SDK
- [ ] LlamaIndex 앱에서 SeizN 메모리 검색/저장 가능
- [ ] Vercel AI SDK 앱에서 SeizN 메모리 tool 사용 가능

---

## 파일 경로 요약

| 영역 | 경로 |
|------|------|
| Memory v3 Service | `src/lib/spring/memory-v3/` |
| Memory v3 API | `src/app/api/spring/memory/` |
| MindMap API | `src/app/api/spring/mindmap/` |
| MindMap UI | `src/app/(dashboard)/dashboard/memories/mindmap/` |
| Candidate UI | `src/app/(dashboard)/dashboard/memories/candidates/` |
| Sandbox UI | `src/app/(dashboard)/dashboard/memories/sandbox/` |
| LlamaIndex | `src/lib/integrations/llamaindex/` |
| Vercel AI SDK | `src/lib/integrations/vercel-ai/` |
| Marketplace UI | `src/app/(dashboard)/dashboard/marketplace/` |
| Migration | `supabase/migrations/20260204014_spring_memory_v3.sql` |

---

*Plan created on 2026-02-04*
