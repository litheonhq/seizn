import { createServerClient } from '@/lib/supabase';
import { sanitizeAuthorAuditJson } from '@/lib/author/audit/logger';
import type { JsonValue } from '@/lib/author/memory-v3/canonical';
import type {
  AuthorUiCandidate,
  AuthorUiCharacterDetail,
  AuthorUiCharacterSummary,
  AuthorUiImport,
} from './service';
import type { AuthorUiStore, SupabaseClientLike } from './store';
import type {
  AuthorCandidateFilter,
  AuthorCandidateRow,
  AuthorCharacterRow,
  AuthorConflictFilter,
  AuthorConflictRow,
  AuthorImportRow,
  AuthorSimulationRow,
} from './store-types';

type SupabaseError = { message: string };

export class SupabaseAuthorUiStore implements AuthorUiStore {
  private readonly userId: string;
  private readonly client: SupabaseClientLike;

  constructor(options: { userId: string; client?: SupabaseClientLike }) {
    this.userId = options.userId;
    this.client = options.client ?? createServerClient();
  }

  async listImports(userId: string, projectId: string): Promise<AuthorUiImport[]> {
    const { data, error } = await this.client
      .from('author_imports')
      .select('*')
      .eq('user_id', scopedUserId(this.userId, userId))
      .eq('project_id', projectId)
      .order('upload_at', { ascending: false });
    throwOnError('list', 'author_imports', error);
    return ((data ?? []) as AuthorImportRow[]).map(importRowToUi);
  }

  async getImport(userId: string, projectId: string, importId: string): Promise<AuthorUiImport | undefined> {
    const { data, error } = await this.client
      .from('author_imports')
      .select('*')
      .eq('user_id', scopedUserId(this.userId, userId))
      .eq('project_id', projectId)
      .eq('id', importId)
      .maybeSingle();
    throwOnError('load', 'author_imports', error);
    return data ? importRowToUi(data as AuthorImportRow) : undefined;
  }

  async insertImport(row: AuthorImportRow): Promise<void> {
    const { error } = await this.client
      .from('author_imports')
      .insert(row);
    throwOnError('insert', 'author_imports', error);
  }

  async updateImport(
    userId: string,
    projectId: string,
    importId: string,
    patch: Partial<AuthorImportRow>
  ): Promise<void> {
    const { error } = await this.client
      .from('author_imports')
      .update(patch)
      .eq('user_id', scopedUserId(this.userId, userId))
      .eq('project_id', projectId)
      .eq('id', importId);
    throwOnError('update', 'author_imports', error);
  }

  async deleteImport(userId: string, projectId: string, importId: string): Promise<void> {
    const { error } = await this.client
      .from('author_imports')
      .delete()
      .eq('user_id', scopedUserId(this.userId, userId))
      .eq('project_id', projectId)
      .eq('id', importId);
    throwOnError('delete', 'author_imports', error);
  }

  async listCandidates(
    userId: string,
    projectId: string,
    filter: AuthorCandidateFilter = {}
  ): Promise<AuthorUiCandidate[]> {
    let query = this.client
      .from('author_candidates')
      .select('*')
      .eq('user_id', scopedUserId(this.userId, userId))
      .eq('project_id', projectId);

    if (filter.statuses?.length) query = query.in('status', filter.statuses);
    if (filter.kinds?.length) query = query.in('kind', filter.kinds);
    if (Number.isFinite(filter.confidenceMin) && Number(filter.confidenceMin) > 0) {
      query = query.gte('confidence', Number(filter.confidenceMin));
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    throwOnError('list', 'author_candidates', error);

    let candidates = ((data ?? []) as AuthorCandidateRow[]).map(candidateRowToUi);
    if (filter.scopes?.length) {
      candidates = candidates.filter((item) => matchesCandidateScope(item, filter.scopes ?? []));
    }
    if (filter.tiers?.length) {
      candidates = candidates.filter((item) => matchesCandidateTier(item, filter.tiers ?? []));
    }
    if (filter.sourceId) {
      candidates = candidates.filter((item) => matchesSourceId(item, filter.sourceId ?? ''));
    }
    candidates.sort((a, b) => sortCandidates(a, b, filter.sort ?? 'priority'));
    return candidates;
  }

  async getCandidate(userId: string, projectId: string, candidateId: string): Promise<AuthorUiCandidate | undefined> {
    const { data, error } = await this.client
      .from('author_candidates')
      .select('*')
      .eq('user_id', scopedUserId(this.userId, userId))
      .eq('project_id', projectId)
      .eq('id', candidateId)
      .maybeSingle();
    throwOnError('load', 'author_candidates', error);
    return data ? candidateRowToUi(data as AuthorCandidateRow) : undefined;
  }

  async insertCandidates(rows: AuthorCandidateRow[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.client
      .from('author_candidates')
      .insert(rows.map(sanitizeCandidateRow));
    throwOnError('insert', 'author_candidates', error);
  }

  async updateCandidate(
    userId: string,
    projectId: string,
    candidateId: string,
    patch: Partial<AuthorCandidateRow>
  ): Promise<void> {
    const { error } = await this.client
      .from('author_candidates')
      .update(sanitizeCandidatePatch(patch))
      .eq('user_id', scopedUserId(this.userId, userId))
      .eq('project_id', projectId)
      .eq('id', candidateId);
    throwOnError('update', 'author_candidates', error);
  }

  async listCharacterSummaries(userId: string, projectId: string): Promise<AuthorUiCharacterSummary[]> {
    const { data, error } = await this.client
      .from('author_characters')
      .select('*')
      .eq('user_id', scopedUserId(this.userId, userId))
      .eq('project_id', projectId)
      .order('name', { ascending: true });
    throwOnError('list', 'author_characters', error);
    return ((data ?? []) as AuthorCharacterRow[])
      .map(characterRowToUi)
      .map(({ id, name, aliases, scope, summary }) => ({ id, name, aliases, scope, summary }));
  }

  async getCharacter(
    userId: string,
    projectId: string,
    characterKey: string
  ): Promise<AuthorUiCharacterDetail | undefined> {
    const { data, error } = await this.client
      .from('author_characters')
      .select('*')
      .eq('user_id', scopedUserId(this.userId, userId))
      .eq('project_id', projectId)
      .eq('character_key', characterKey)
      .maybeSingle();
    throwOnError('load', 'author_characters', error);
    return data ? characterRowToUi(data as AuthorCharacterRow) : undefined;
  }

  async upsertCharacter(row: AuthorCharacterRow): Promise<void> {
    const { error } = await this.client
      .from('author_characters')
      .upsert(sanitizeCharacterRow(row), { onConflict: 'user_id,project_id,character_key' });
    throwOnError('upsert', 'author_characters', error);
  }

  async listConflicts(
    userId: string,
    projectId: string,
    filter: AuthorConflictFilter = {}
  ): Promise<AuthorConflictRow[]> {
    let query = this.client
      .from('author_conflicts')
      .select('*')
      .eq('user_id', scopedUserId(this.userId, userId))
      .eq('project_id', projectId);
    if (filter.severity) query = query.eq('severity', filter.severity);
    if (filter.status) query = query.eq('status', filter.status);
    const { data, error } = await query.order('created_at', { ascending: false });
    throwOnError('list', 'author_conflicts', error);
    return (data ?? []) as AuthorConflictRow[];
  }

  async upsertConflict(row: AuthorConflictRow): Promise<void> {
    const { error } = await this.client
      .from('author_conflicts')
      .upsert(sanitizeConflictRow(row), { onConflict: 'user_id,project_id,conflict_key' });
    throwOnError('upsert', 'author_conflicts', error);
  }

  async resolveConflict(
    userId: string,
    projectId: string,
    conflictKey: string,
    resolution: JsonValue
  ): Promise<void> {
    const { error } = await this.client
      .from('author_conflicts')
      .update({
        status: 'resolved',
        resolution: sanitizeAuthorAuditJson(resolution),
        resolved_at: new Date().toISOString(),
      })
      .eq('user_id', scopedUserId(this.userId, userId))
      .eq('project_id', projectId)
      .eq('conflict_key', conflictKey);
    throwOnError('resolve', 'author_conflicts', error);
  }

  async listSimulations(userId: string, projectId: string): Promise<AuthorSimulationRow[]> {
    const { data, error } = await this.client
      .from('author_simulations')
      .select('*')
      .eq('user_id', scopedUserId(this.userId, userId))
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    throwOnError('list', 'author_simulations', error);
    return (data ?? []) as AuthorSimulationRow[];
  }

  async getSimulation(
    userId: string,
    projectId: string,
    simulationKey: string
  ): Promise<AuthorSimulationRow | undefined> {
    const { data, error } = await this.client
      .from('author_simulations')
      .select('*')
      .eq('user_id', scopedUserId(this.userId, userId))
      .eq('project_id', projectId)
      .eq('simulation_key', simulationKey)
      .maybeSingle();
    throwOnError('load', 'author_simulations', error);
    return data ? data as AuthorSimulationRow : undefined;
  }

  async upsertSimulation(row: AuthorSimulationRow): Promise<void> {
    const { error } = await this.client
      .from('author_simulations')
      .upsert(sanitizeSimulationRow(row), { onConflict: 'user_id,project_id,simulation_key' });
    throwOnError('upsert', 'author_simulations', error);
  }

  async countAll(userId: string, projectId: string): Promise<{
    imports: number;
    candidates: number;
    characters: number;
    conflicts: number;
    simulations: number;
  }> {
    const scoped = scopedUserId(this.userId, userId);
    const [imports, candidates, characters, conflicts, simulations] = await Promise.all([
      countTable(this.client, 'author_imports', scoped, projectId),
      countTable(this.client, 'author_candidates', scoped, projectId),
      countTable(this.client, 'author_characters', scoped, projectId),
      countTable(this.client, 'author_conflicts', scoped, projectId),
      countTable(this.client, 'author_simulations', scoped, projectId),
    ]);
    return { imports, candidates, characters, conflicts, simulations };
  }
}

async function countTable(
  client: SupabaseClientLike,
  table: string,
  userId: string,
  projectId: string
): Promise<number> {
  const { count, error } = await client
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('project_id', projectId);
  throwOnError('count', table, error);
  return count ?? 0;
}

function scopedUserId(storeUserId: string, requestedUserId: string): string {
  return requestedUserId || storeUserId;
}

function throwOnError(op: string, table: string, error: SupabaseError | null | undefined): void {
  if (error) {
    throw new Error(`Failed to ${op} ${table}: ${error.message}`);
  }
}

function importRowToUi(row: AuthorImportRow): AuthorUiImport {
  return {
    id: row.id,
    file_name: row.file_name,
    file_size: row.file_size,
    file_type: row.file_type,
    upload_at: row.upload_at,
    parse_status: row.parse_status,
    parse_progress: row.parse_progress,
    extract_status: row.extract_status,
    extract_progress: row.extract_progress,
    candidate_count: row.candidate_count,
    error_message: row.error_message,
    storage_key: row.storage_key,
    parsed_text_preview: row.parsed_text_preview,
    parser_version: row.parser_version,
    source_role: row.source_role,
    a_or_d_mode: row.a_or_d_mode,
  };
}

function candidateRowToUi(row: AuthorCandidateRow): AuthorUiCandidate {
  return {
    id: row.id,
    content: row.content,
    type: row.kind,
    status: row.status,
    confidence: row.confidence,
    suggested_status: row.suggested_status,
    tags: [...row.tags],
    source: row.source as AuthorUiCandidate['source'],
    related_existing: row.related_existing as AuthorUiCandidate['related_existing'],
    extracted_at: row.extracted_at,
    target_entity_id: row.target_entity_id ?? undefined,
  };
}

function characterRowToUi(row: AuthorCharacterRow): AuthorUiCharacterDetail {
  return {
    id: row.character_key,
    name: row.name,
    aliases: [...row.aliases],
    scope: [...row.scope],
    summary: row.summary,
    archetype: row.archetype,
    voice: row.voice as AuthorUiCharacterDetail['voice'],
    persona: row.persona as AuthorUiCharacterDetail['persona'],
    appearance: row.appearance as AuthorUiCharacterDetail['appearance'],
    background: row.background as AuthorUiCharacterDetail['background'],
    knowledge_state: row.knowledge_state as AuthorUiCharacterDetail['knowledge_state'],
    relationships: row.relationships as AuthorUiCharacterDetail['relationships'],
    recent_important_memories: row.recent_important_memories as AuthorUiCharacterDetail['recent_important_memories'],
    voice_samples: row.voice_samples as AuthorUiCharacterDetail['voice_samples'],
    current_arc_phase: row.current_arc_phase,
  };
}

function sanitizeCandidateRow(row: AuthorCandidateRow): AuthorCandidateRow {
  return {
    ...row,
    source: sanitizeAuthorAuditJson(row.source),
    related_existing: sanitizeAuthorAuditJson(row.related_existing),
  };
}

function sanitizeCandidatePatch(patch: Partial<AuthorCandidateRow>): Partial<AuthorCandidateRow> {
  return {
    ...patch,
    source: patch.source === undefined ? undefined : sanitizeAuthorAuditJson(patch.source),
    related_existing: patch.related_existing === undefined
      ? undefined
      : sanitizeAuthorAuditJson(patch.related_existing),
  };
}

function sanitizeCharacterRow(row: AuthorCharacterRow): AuthorCharacterRow {
  return {
    ...row,
    voice: sanitizeAuthorAuditJson(row.voice),
    persona: sanitizeAuthorAuditJson(row.persona),
    appearance: sanitizeAuthorAuditJson(row.appearance),
    background: sanitizeAuthorAuditJson(row.background),
    knowledge_state: sanitizeAuthorAuditJson(row.knowledge_state),
    relationships: sanitizeAuthorAuditJson(row.relationships),
    recent_important_memories: sanitizeAuthorAuditJson(row.recent_important_memories),
    voice_samples: sanitizeAuthorAuditJson(row.voice_samples),
  };
}

function sanitizeConflictRow(row: AuthorConflictRow): AuthorConflictRow {
  return {
    ...row,
    payload: sanitizeAuthorAuditJson(row.payload),
    resolution: row.resolution === null ? null : sanitizeAuthorAuditJson(row.resolution),
  };
}

function sanitizeSimulationRow(row: AuthorSimulationRow): AuthorSimulationRow {
  return {
    ...row,
    input: sanitizeAuthorAuditJson(row.input),
    context_used: sanitizeAuthorAuditJson(row.context_used),
    candidates: sanitizeAuthorAuditJson(row.candidates),
    trace_metadata: sanitizeAuthorAuditJson(row.trace_metadata),
    diagnostics: sanitizeAuthorAuditJson(row.diagnostics),
    llm_meta: row.llm_meta === null ? null : sanitizeAuthorAuditJson(row.llm_meta),
  };
}

function sortCandidates(a: AuthorUiCandidate, b: AuthorUiCandidate, sort: string): number {
  switch (sort) {
    case 'confidence':
      return b.confidence - a.confidence;
    case 'date':
      return b.extracted_at.localeCompare(a.extracted_at);
    case 'source_order':
      return a.source.file_path.localeCompare(b.source.file_path) || a.id.localeCompare(b.id);
    case 'priority':
    default:
      return statusPriority(a.status) - statusPriority(b.status) || b.confidence - a.confidence;
  }
}

function statusPriority(status: AuthorUiCandidate['status']): number {
  return status === 'candidate' ? 0 : 1;
}

function matchesCandidateScope(candidate: AuthorUiCandidate, scopes: string[]): boolean {
  return candidate.tags.some((tag) => scopes.includes(tag));
}

function matchesCandidateTier(candidate: AuthorUiCandidate, tiers: string[]): boolean {
  return candidate.tags.some((tag) => tiers.includes(tag) || tiers.some((tier) => tag === `tier:${tier}`));
}

function matchesSourceId(candidate: AuthorUiCandidate, sourceId: string): boolean {
  return [candidate.source.document_id, candidate.source.file_path].some((source) =>
    source === sourceId || source.endsWith(`/${sourceId}`) || source.endsWith(`\\${sourceId}`)
  );
}
