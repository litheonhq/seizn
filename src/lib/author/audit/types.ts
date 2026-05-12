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
  'coach.analysis',
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
  /**
   * Keyset cursor for paginated reads. Results returned are strictly older
   * than `(createdAt, id)` under the canonical sort order
   * (created_at DESC, id DESC).
   */
  before?: { createdAt: string; id: string };
}

export interface AuthorAuditReplayResult {
  decisionId: string;
  replayStatus: 'deterministic' | 'not_found' | 'drift_risk';
  chain: AuthorAuditLogEntry[];
  chainLength: number;
  startCreatedAt?: string;
  replayedAt: string;
  payloadHash?: string;
  llmMetaHash?: string;
  warnings: string[];
}

export interface AuthorAuditLogStore {
  log(entry: AuthorAuditLogEntry): void | Promise<void>;
  search(filter: AuthorAuditSearchFilter): AuthorAuditLogEntry[] | Promise<AuthorAuditLogEntry[]>;
  getByDecisionId(decisionId: string): AuthorAuditLogEntry | undefined | Promise<AuthorAuditLogEntry | undefined>;
}
