import { randomUUID } from 'node:crypto';
import {
  createServerClient,
  hasServerSupabaseServiceRoleConfig,
} from '@/lib/supabase';
import {
  canonicalJson,
  canonicalize,
  sha256Hex,
  type JsonValue,
} from '@/lib/author/memory-v3/canonical';
import type {
  AuthorAuditEventType,
  AuthorAuditLogEntry,
  AuthorAuditLogInput,
  AuthorAuditLogStore,
  AuthorAuditSearchFilter,
} from './types';

type SupabaseClientLike = Pick<ReturnType<typeof createServerClient>, 'from'>;

interface AuthorAuditLogRow {
  id: string;
  project_id: string;
  user_id: string;
  event_type: AuthorAuditEventType;
  payload: JsonValue;
  llm_meta: AuthorAuditLogEntry['llmMeta'] | null;
  source_span: AuthorAuditLogEntry['sourceSpan'] | null;
  decision_id: string;
  parent_decision_id: string | null;
  created_at: string;
}

const SECRET_KEY_PATTERN = /(api[_-]?key|authorization|bearer|credential|password|secret|token|private[_-]?key)/i;
const SAFE_KEY_PATTERN = /^(key_last_4|request_id|decision_id|parent_decision_id)$/i;
const SECRET_VALUE_PATTERN = /(sk-[a-zA-Z0-9_-]{8,}|Bearer\s+[a-zA-Z0-9._~+/-]+=*|szn_[a-zA-Z0-9_-]{8,})/;
const MAX_AUDIT_STRING_LENGTH = 4000;

export class InMemoryAuthorAuditLogStore implements AuthorAuditLogStore {
  constructor(private readonly entries: AuthorAuditLogEntry[] = []) {}

  log(entry: AuthorAuditLogEntry): void {
    this.entries.push(entry);
  }

  search(filter: AuthorAuditSearchFilter = {}): AuthorAuditLogEntry[] {
    return searchAuthorAuditEntries(this.entries, filter);
  }

  getByDecisionId(decisionId: string): AuthorAuditLogEntry | undefined {
    return this.entries.find((entry) => entry.decisionId === decisionId);
  }

  all(): AuthorAuditLogEntry[] {
    return [...this.entries].sort(sortAuditEntriesDesc);
  }
}

export class SupabaseAuthorAuditLogStore implements AuthorAuditLogStore {
  private readonly userId: string;
  private readonly client: SupabaseClientLike;

  constructor(options: { userId: string; client?: SupabaseClientLike }) {
    this.userId = options.userId;
    this.client = options.client ?? createServerClient();
  }

  async log(entry: AuthorAuditLogEntry): Promise<void> {
    const { error } = await this.client
      .from('author_audit_log')
      .insert({
        id: entry.id,
        project_id: entry.projectId,
        user_id: entry.userId,
        event_type: entry.eventType,
        payload: entry.payload,
        llm_meta: entry.llmMeta ?? null,
        source_span: entry.sourceSpan ?? null,
        decision_id: entry.decisionId,
        parent_decision_id: entry.parentDecisionId ?? null,
        created_at: entry.createdAt,
      });

    if (error) {
      throw new Error(`Failed to write author audit log: ${error.message}`);
    }
  }

  async search(filter: AuthorAuditSearchFilter = {}): Promise<AuthorAuditLogEntry[]> {
    let query = this.client
      .from('author_audit_log')
      .select('id, project_id, user_id, event_type, payload, llm_meta, source_span, decision_id, parent_decision_id, created_at')
      .eq('user_id', filter.userId ?? this.userId);

    if (filter.projectId) query = query.eq('project_id', filter.projectId);
    if (filter.decisionId) query = query.eq('decision_id', filter.decisionId);
    if (filter.eventTypes?.length) query = query.in('event_type', filter.eventTypes);
    if (filter.since) query = query.gte('created_at', filter.since);
    if (filter.until) query = query.lte('created_at', filter.until);

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(500, filter.limit ?? 100)));

    if (error) {
      throw new Error(`Failed to search author audit log: ${error.message}`);
    }

    return searchAuthorAuditEntries(((data ?? []) as AuthorAuditLogRow[]).map(rowToEntry), filter);
  }

  async getByDecisionId(decisionId: string): Promise<AuthorAuditLogEntry | undefined> {
    const { data, error } = await this.client
      .from('author_audit_log')
      .select('id, project_id, user_id, event_type, payload, llm_meta, source_span, decision_id, parent_decision_id, created_at')
      .eq('user_id', this.userId)
      .eq('decision_id', decisionId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load author audit log decision: ${error.message}`);
    }

    return data ? rowToEntry(data as AuthorAuditLogRow) : undefined;
  }
}

export class AuthorAuditLogStoreConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorAuditLogStoreConfigError';
  }
}

export function createAuthorAuditLogEntry(input: AuthorAuditLogInput): AuthorAuditLogEntry {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const llmMeta = input.llmMeta
    ? sanitizeAuthorAuditJson(input.llmMeta) as AuthorAuditLogEntry['llmMeta']
    : undefined;
  return {
    id: randomUUID(),
    projectId: input.projectId,
    userId: input.userId,
    eventType: input.eventType,
    payload: sanitizeAuthorAuditJson(input.payload),
    llmMeta,
    sourceSpan: input.sourceSpan,
    decisionId: input.decisionId ?? randomUUID(),
    parentDecisionId: input.parentDecisionId,
    createdAt,
  };
}

export function searchAuthorAuditEntries(
  entries: AuthorAuditLogEntry[],
  filter: AuthorAuditSearchFilter = {}
): AuthorAuditLogEntry[] {
  const q = filter.q?.trim().toLowerCase();
  const sinceTime = filter.since ? Date.parse(filter.since) : undefined;
  const untilTime = filter.until ? Date.parse(filter.until) : undefined;
  const limit = Math.max(1, Math.min(500, filter.limit ?? 100));

  return entries
    .filter((entry) => !filter.userId || entry.userId === filter.userId)
    .filter((entry) => !filter.projectId || entry.projectId === filter.projectId)
    .filter((entry) => !filter.decisionId || entry.decisionId === filter.decisionId)
    .filter((entry) => !filter.eventTypes?.length || filter.eventTypes.includes(entry.eventType))
    .filter((entry) => !Number.isFinite(sinceTime) || Date.parse(entry.createdAt) >= Number(sinceTime))
    .filter((entry) => !Number.isFinite(untilTime) || Date.parse(entry.createdAt) <= Number(untilTime))
    .filter((entry) => {
      if (!q) return true;
      return [
        entry.eventType,
        entry.decisionId,
        entry.parentDecisionId ?? '',
        canonicalJson(entry.payload),
        canonicalJson(entry.llmMeta ?? {}),
      ].join('\n').toLowerCase().includes(q);
    })
    .sort(sortAuditEntriesDesc)
    .slice(0, limit);
}

export function sanitizeAuthorAuditJson(value: unknown, depth = 0): JsonValue {
  if (depth > 8) return '[MaxDepth]';
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.slice(0, 200).map((item) => sanitizeAuthorAuditJson(item, depth + 1));
  }
  if (typeof value === 'object') {
    const sanitized: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).sort()) {
      if (SECRET_KEY_PATTERN.test(key) && !SAFE_KEY_PATTERN.test(key)) {
        sanitized[key] = '[redacted]';
      } else {
        sanitized[key] = sanitizeAuthorAuditJson(item, depth + 1);
      }
    }
    return sanitized;
  }
  if (typeof value === 'string') {
    if (SECRET_VALUE_PATTERN.test(value)) return '[redacted]';
    return value.length > MAX_AUDIT_STRING_LENGTH
      ? `${value.slice(0, MAX_AUDIT_STRING_LENGTH)}...[truncated]`
      : value;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

export function hashAuthorAuditPrompt(prompt: unknown): string {
  return sha256Hex(canonicalize(prompt));
}

export function createAuthorAuditLogStoreForUser(options: {
  userId: string;
  entries?: AuthorAuditLogEntry[];
  client?: SupabaseClientLike;
}): AuthorAuditLogStore {
  if (process.env.AUTHOR_AUDIT_LOG_STORE === 'supabase') {
    if (!options.client && !hasServerSupabaseServiceRoleConfig()) {
      throw new AuthorAuditLogStoreConfigError(
        'AUTHOR_AUDIT_LOG_STORE=supabase requires Supabase service-role configuration'
      );
    }
    return new SupabaseAuthorAuditLogStore(options);
  }

  return new InMemoryAuthorAuditLogStore(options.entries);
}

function rowToEntry(row: AuthorAuditLogRow): AuthorAuditLogEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    eventType: row.event_type,
    payload: row.payload,
    llmMeta: row.llm_meta ?? undefined,
    sourceSpan: row.source_span ?? undefined,
    decisionId: row.decision_id,
    parentDecisionId: row.parent_decision_id ?? undefined,
    createdAt: row.created_at,
  };
}

function sortAuditEntriesDesc(a: AuthorAuditLogEntry, b: AuthorAuditLogEntry): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}
