import type { JsonValue } from './canonical';

export const AUTHOR_MEMORY_V3_SCHEMA_VERSION = 'seizn.author_memory_v3.v1' as const;
export const KNOT_AUTHOR_EVAL_V1_SCHEMA_VERSION = 'seizn.knot_author_eval.v1' as const;

export type AuthorCanonStatus =
  | 'candidate'
  | 'canon'
  | 'rejected'
  | 'retired'
  | 'contradicted'
  | 'invalidated'
  | 'past_only';

export type AuthorMemoryKind =
  | 'person'
  | 'relationship'
  | 'world_rule'
  | 'event'
  | 'location'
  | 'scene'
  | 'document_chunk'
  | 'author_note';

export interface AuthorSourceSpan {
  sourceId: string;
  start?: number;
  end?: number;
  quote?: string;
}

export interface AuthorMemoryRecord {
  id: string;
  kind: AuthorMemoryKind;
  status: AuthorCanonStatus;
  content: string;
  validAt?: string;
  invalidAt?: string | null;
  source?: AuthorSourceSpan;
  supersedesId?: string;
  invalidatesId?: string;
  confidence?: number;
  entityIds?: string[];
  metadata?: Record<string, JsonValue>;
}

export interface AuthorMemorySnapshot {
  schemaVersion: typeof AUTHOR_MEMORY_V3_SCHEMA_VERSION;
  projectId?: string;
  snapshotHash: string;
  itemCount: number;
  recordHashes: Record<string, string>;
  records: AuthorMemoryRecord[];
  generatedAt?: string;
}

export type AuthorSideEffectKind =
  | 'llm'
  | 'parser'
  | 'embedding'
  | 'reranker'
  | 'tool'
  | 'api';

export type AuthorReplayMode = 'record' | 'replay' | 'off';

export interface AuthorSideEffectRequest {
  kind: AuthorSideEffectKind;
  provider: string;
  model?: string;
  operation: string;
  input: JsonValue;
  params?: Record<string, JsonValue>;
  seed?: number;
}

export interface AuthorSideEffectRecord<TOutput extends JsonValue = JsonValue> {
  key: string;
  request: AuthorSideEffectRequest;
  output: TOutput;
  capturedAt: string;
  metadata?: Record<string, JsonValue>;
}

export type AuthorEvalCaseKind =
  | 'canon_recall'
  | 'invalidated_fact_exclusion'
  | 'relationship_continuity'
  | 'persona_consistency'
  | 'scene_simulation';

export interface AuthorEvalCase {
  schemaVersion: typeof KNOT_AUTHOR_EVAL_V1_SCHEMA_VERSION;
  id: string;
  kind: AuthorEvalCaseKind;
  prompt: string;
  expected: {
    mustInclude?: string[];
    mustExclude?: string[];
    allowedUnknowns?: string[];
  };
  tags?: string[];
  metadata?: Record<string, JsonValue>;
}

export interface AuthorEvalResult {
  schemaVersion: typeof KNOT_AUTHOR_EVAL_V1_SCHEMA_VERSION;
  caseId: string;
  passed: boolean;
  score: number;
  memorySnapshotHash: string;
  sideEffectKeys: string[];
  output: string;
  failures: string[];
  metadata?: Record<string, JsonValue>;
}
