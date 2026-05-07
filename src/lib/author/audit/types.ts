import type { JsonValue } from '@/lib/author/memory-v3/canonical';

export const AUTHOR_AUDIT_EVENT_TYPES = [
  'project.created',
  'import.upload',
  'import.parsed',
  'import.failed',
  'import.retried',
  'import.deleted',
  'candidate.added',
  'candidate.decided',
  'candidate.batch_decided',
  'character.updated',
  'conflict.resolved',
  'simulation.run',
  'simulation.replay',
  'backlog.generated',
  'settings.updated',
  'byok.updated',
] as const;

export type AuthorAuditEventType = typeof AUTHOR_AUDIT_EVENT_TYPES[number];

export interface AuthorAuditLlmMeta {
  provider?: string;
  model?: string;
  tokens_in?: number;
  tokens_out?: number;
  request_id?: string;
  prompt_hash?: string;
  operation?: string;
  mode?: string;
}

export interface AuthorAuditSourceSpan {
  document_id?: string;
  file_path?: string;
  start_line?: number;
  end_line?: number;
  start_char?: number;
  end_char?: number;
}

export interface AuthorAuditLogEntry {
  id: string;
  projectId: string;
  userId: string;
  eventType: AuthorAuditEventType;
  payload: JsonValue;
  llmMeta?: AuthorAuditLlmMeta;
  sourceSpan?: AuthorAuditSourceSpan;
  decisionId: string;
  parentDecisionId?: string;
  createdAt: string;
  /** sha256 hex of the parent's entry_hash. NULL for root entries.
   *  Set by the Supabase store at write time; in-memory entries are NULL. */
  previousHash?: string | null;
  /** sha256 hex of canonical JSON of (previous_hash, project_id, user_id,
   *  event_type, payload, llm_meta, source_span, decision_id,
   *  parent_decision_id, created_at). Set by the store at write time. */
  entryHash?: string | null;
}

export interface AuthorAuditLogInput {
  projectId: string;
  userId: string;
  eventType: AuthorAuditEventType;
  payload: unknown;
  llmMeta?: AuthorAuditLlmMeta;
  sourceSpan?: AuthorAuditSourceSpan;
  decisionId?: string;
  parentDecisionId?: string;
  createdAt?: string;
}

export interface AuthorAuditSearchFilter {
  projectId?: string;
  userId?: string;
  eventTypes?: AuthorAuditEventType[];
  decisionId?: string;
  q?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export interface AuthorAuditReplayResult {
  decisionId: string;
  replayStatus: 'deterministic' | 'not_found' | 'drift_risk' | 'tampered';
  chain: AuthorAuditLogEntry[];
  chainLength: number;
  startCreatedAt?: string;
  replayedAt: string;
  payloadHash?: string;
  llmMetaHash?: string;
  warnings: string[];
  /** Per-entry hash verification result. Populated when the chain has
   *  post-migration entries (with stored entry_hash); null for fully
   *  in-memory replays. */
  hashVerification?: {
    verified: number;
    tampered: number;
    grandfathered: number;
    chainBroken: number;
  };
}

export interface AuthorAuditLogStore {
  log(entry: AuthorAuditLogEntry): void | Promise<void>;
  search(filter: AuthorAuditSearchFilter): AuthorAuditLogEntry[] | Promise<AuthorAuditLogEntry[]>;
  getByDecisionId(decisionId: string): AuthorAuditLogEntry | undefined | Promise<AuthorAuditLogEntry | undefined>;
}
