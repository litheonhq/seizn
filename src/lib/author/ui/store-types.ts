import type { JsonValue } from '@/lib/author/memory-v3/canonical';

export type AuthorImportFileType =
  | 'md'
  | 'docx'
  | 'pdf'
  | 'txt'
  | 'json'
  | 'notion_export'
  | 'obsidian_md';

export type AuthorImportSourceRole =
  | 'canon'
  | 'character'
  | 'scene'
  | 'reference'
  | 'visual';

export type AuthorImportMode = 'extract' | 'raw_keep';
export type AuthorImportParseStatus = 'queued' | 'parsing' | 'parsed' | 'failed';
export type AuthorImportExtractStatus = 'queued' | 'extracting' | 'extracted' | 'failed';

export type AuthorCandidateKind =
  | 'character'
  | 'world_rule'
  | 'event'
  | 'relationship'
  | 'voice_sample'
  | 'fact';

export type AuthorCandidateStatus =
  | 'candidate'
  | 'canon'
  | 'rejected'
  | 'retired'
  | 'past_only'
  | 'contradicted'
  | 'invalidated'
  | 'author_only'
  | 'character_known'
  | 'character_unknown';

export type AuthorConflictSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AuthorConflictStatus = 'open' | 'resolved' | 'deferred';
export type AuthorSimulationStatus = 'queued' | 'running' | 'complete' | 'failed';

export interface AuthorImportRow {
  id: string;
  user_id: string;
  project_id: string;
  file_name: string;
  file_size: number;
  file_type: AuthorImportFileType;
  source_role: AuthorImportSourceRole;
  a_or_d_mode: AuthorImportMode;
  parse_status: AuthorImportParseStatus;
  parse_progress: number;
  extract_status: AuthorImportExtractStatus;
  extract_progress: number;
  candidate_count: number;
  error_message: string | null;
  storage_key: string | null;
  parsed_text_preview: string | null;
  parser_version: string | null;
  upload_at: string;
  created_at: string;
  updated_at: string;
}

export interface AuthorCandidateRow {
  id: string;
  user_id: string;
  project_id: string;
  content: string;
  kind: AuthorCandidateKind;
  status: AuthorCandidateStatus;
  suggested_status: AuthorCandidateStatus;
  confidence: number;
  tags: string[];
  source: JsonValue;
  related_existing: JsonValue;
  target_entity_id: string | null;
  decision_id: string | null;
  promoted_entity_id: string | null;
  extracted_at: string;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthorCharacterRow {
  id: string;
  user_id: string;
  project_id: string;
  character_key: string;
  name: string;
  aliases: string[];
  scope: string[];
  summary: string;
  archetype: string;
  voice: JsonValue;
  persona: JsonValue;
  appearance: JsonValue;
  background: JsonValue;
  knowledge_state: JsonValue;
  relationships: JsonValue;
  recent_important_memories: JsonValue;
  voice_samples: JsonValue;
  current_arc_phase: string;
  created_at: string;
  updated_at: string;
}

export interface AuthorConflictRow {
  id: string;
  user_id: string;
  project_id: string;
  conflict_key: string;
  severity: AuthorConflictSeverity;
  status: AuthorConflictStatus;
  payload: JsonValue;
  resolution: JsonValue | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthorSimulationRow {
  id: string;
  user_id: string;
  project_id: string;
  simulation_key: string;
  status: AuthorSimulationStatus;
  progress: number;
  input: JsonValue;
  context_used: JsonValue;
  candidates: JsonValue;
  trace_metadata: JsonValue;
  diagnostics: JsonValue;
  llm_meta: JsonValue | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthorCandidateFilter {
  statuses?: AuthorCandidateStatus[];
  kinds?: AuthorCandidateKind[];
  confidenceMin?: number;
  scopes?: string[];
  tiers?: string[];
  sourceId?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export interface AuthorConflictFilter {
  severity?: AuthorConflictSeverity;
  status?: AuthorConflictStatus;
}
