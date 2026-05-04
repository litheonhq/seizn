import type {
  AuthorUiCandidate,
  AuthorUiCharacterDetail,
  AuthorUiCharacterSummary,
  AuthorUiImport,
} from './service';
import type { AuthorUiStore } from './store';
import type {
  AuthorCandidateFilter,
  AuthorCandidateRow,
  AuthorCharacterRow,
  AuthorConflictFilter,
  AuthorConflictRow,
  AuthorImportRow,
  AuthorSimulationRow,
} from './store-types';

export class InMemoryAuthorUiStore implements AuthorUiStore {
  private readonly importsByProject = new Map<string, AuthorImportRow[]>();
  private readonly candidatesByProject = new Map<string, AuthorCandidateRow[]>();
  private readonly charactersByProject = new Map<string, Map<string, AuthorCharacterRow>>();
  private readonly conflictsByProject = new Map<string, Map<string, AuthorConflictRow>>();
  private readonly simulationsByProject = new Map<string, Map<string, AuthorSimulationRow>>();

  async listImports(userId: string, projectId: string): Promise<AuthorUiImport[]> {
    return this.importRows(userId, projectId)
      .map(importRowToUi)
      .sort((a, b) => b.upload_at.localeCompare(a.upload_at) || b.id.localeCompare(a.id));
  }

  async getImport(userId: string, projectId: string, importId: string): Promise<AuthorUiImport | undefined> {
    const row = this.importRows(userId, projectId).find((item) => item.id === importId);
    return row ? importRowToUi(row) : undefined;
  }

  async insertImport(row: AuthorImportRow): Promise<void> {
    const rows = this.importRows(row.user_id, row.project_id);
    this.importsByProject.set(
      projectKey(row.user_id, row.project_id),
      [cloneImportRow(row), ...rows.filter((item) => item.id !== row.id)]
    );
  }

  async updateImport(
    userId: string,
    projectId: string,
    importId: string,
    patch: Partial<AuthorImportRow>
  ): Promise<void> {
    const rows = this.importRows(userId, projectId).map((item) =>
      item.id === importId ? cloneImportRow({ ...item, ...patch, updated_at: patch.updated_at ?? nowIso() }) : item
    );
    this.importsByProject.set(projectKey(userId, projectId), rows);
  }

  async deleteImport(userId: string, projectId: string, importId: string): Promise<void> {
    const rows = this.importRows(userId, projectId).filter((item) => item.id !== importId);
    this.importsByProject.set(projectKey(userId, projectId), rows);
  }

  async listCandidates(
    userId: string,
    projectId: string,
    filter: AuthorCandidateFilter = {}
  ): Promise<AuthorUiCandidate[]> {
    let rows = this.candidateRows(userId, projectId);
    if (filter.statuses?.length) {
      rows = rows.filter((item) => filter.statuses?.includes(item.status));
    }
    if (filter.kinds?.length) {
      rows = rows.filter((item) => filter.kinds?.includes(item.kind));
    }
    if (Number.isFinite(filter.confidenceMin) && Number(filter.confidenceMin) > 0) {
      rows = rows.filter((item) => item.confidence >= Number(filter.confidenceMin));
    }

    let candidates = rows.map(candidateRowToUi);
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
    const row = this.candidateRows(userId, projectId).find((item) => item.id === candidateId);
    return row ? candidateRowToUi(row) : undefined;
  }

  async insertCandidates(rows: AuthorCandidateRow[]): Promise<void> {
    for (const row of rows) {
      const key = projectKey(row.user_id, row.project_id);
      const existing = this.candidatesByProject.get(key) ?? [];
      this.candidatesByProject.set(key, [cloneCandidateRow(row), ...existing.filter((item) => item.id !== row.id)]);
    }
  }

  async updateCandidate(
    userId: string,
    projectId: string,
    candidateId: string,
    patch: Partial<AuthorCandidateRow>
  ): Promise<void> {
    const rows = this.candidateRows(userId, projectId).map((item) =>
      item.id === candidateId ? cloneCandidateRow({ ...item, ...patch, updated_at: patch.updated_at ?? nowIso() }) : item
    );
    this.candidatesByProject.set(projectKey(userId, projectId), rows);
  }

  async listCharacterSummaries(userId: string, projectId: string): Promise<AuthorUiCharacterSummary[]> {
    return [...this.characterRows(userId, projectId).values()]
      .map(characterRowToUi)
      .map(({ id, name, aliases, scope, summary }) => ({ id, name, aliases, scope, summary }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getCharacter(
    userId: string,
    projectId: string,
    characterKey: string
  ): Promise<AuthorUiCharacterDetail | undefined> {
    const row = this.characterRows(userId, projectId).get(characterKey);
    return row ? characterRowToUi(row) : undefined;
  }

  async upsertCharacter(row: AuthorCharacterRow): Promise<void> {
    const rows = new Map(this.characterRows(row.user_id, row.project_id));
    rows.set(row.character_key, cloneCharacterRow({ ...row, updated_at: row.updated_at ?? nowIso() }));
    this.charactersByProject.set(projectKey(row.user_id, row.project_id), rows);
  }

  async listConflicts(
    userId: string,
    projectId: string,
    filter: AuthorConflictFilter = {}
  ): Promise<AuthorConflictRow[]> {
    let rows = [...this.conflictRows(userId, projectId).values()];
    if (filter.severity) {
      rows = rows.filter((item) => item.severity === filter.severity);
    }
    if (filter.status) {
      rows = rows.filter((item) => item.status === filter.status);
    }
    return rows.map(cloneConflictRow);
  }

  async upsertConflict(row: AuthorConflictRow): Promise<void> {
    const rows = new Map(this.conflictRows(row.user_id, row.project_id));
    rows.set(row.conflict_key, cloneConflictRow({ ...row, updated_at: row.updated_at ?? nowIso() }));
    this.conflictsByProject.set(projectKey(row.user_id, row.project_id), rows);
  }

  async resolveConflict(
    userId: string,
    projectId: string,
    conflictKey: string,
    resolution: AuthorConflictRow['resolution'],
    status: AuthorConflictRow['status'] = 'resolved'
  ): Promise<void> {
    const rows = new Map(this.conflictRows(userId, projectId));
    const row = rows.get(conflictKey);
    if (!row) return;
    rows.set(conflictKey, cloneConflictRow({
      ...row,
      status,
      resolution,
      resolved_at: nowIso(),
      updated_at: nowIso(),
    }));
    this.conflictsByProject.set(projectKey(userId, projectId), rows);
  }

  async listSimulations(userId: string, projectId: string): Promise<AuthorSimulationRow[]> {
    return [...this.simulationRows(userId, projectId).values()]
      .map(cloneSimulationRow)
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  }

  async getSimulation(
    userId: string,
    projectId: string,
    simulationKey: string
  ): Promise<AuthorSimulationRow | undefined> {
    const row = this.simulationRows(userId, projectId).get(simulationKey);
    return row ? cloneSimulationRow(row) : undefined;
  }

  async upsertSimulation(row: AuthorSimulationRow): Promise<void> {
    const rows = new Map(this.simulationRows(row.user_id, row.project_id));
    rows.set(row.simulation_key, cloneSimulationRow({ ...row, updated_at: row.updated_at ?? nowIso() }));
    this.simulationsByProject.set(projectKey(row.user_id, row.project_id), rows);
  }

  async countAll(userId: string, projectId: string): Promise<{
    imports: number;
    candidates: number;
    characters: number;
    conflicts: number;
    simulations: number;
  }> {
    return {
      imports: this.importRows(userId, projectId).length,
      candidates: this.candidateRows(userId, projectId).length,
      characters: this.characterRows(userId, projectId).size,
      conflicts: this.conflictRows(userId, projectId).size,
      simulations: this.simulationRows(userId, projectId).size,
    };
  }

  resetForTests(userId: string): void {
    for (const key of [
      ...this.importsByProject.keys(),
      ...this.candidatesByProject.keys(),
      ...this.charactersByProject.keys(),
      ...this.conflictsByProject.keys(),
      ...this.simulationsByProject.keys(),
    ]) {
      if (key.startsWith(`${userId}:`)) {
        this.importsByProject.delete(key);
        this.candidatesByProject.delete(key);
        this.charactersByProject.delete(key);
        this.conflictsByProject.delete(key);
        this.simulationsByProject.delete(key);
      }
    }
  }

  private importRows(userId: string, projectId: string): AuthorImportRow[] {
    return this.importsByProject.get(projectKey(userId, projectId))?.map(cloneImportRow) ?? [];
  }

  private candidateRows(userId: string, projectId: string): AuthorCandidateRow[] {
    return this.candidatesByProject.get(projectKey(userId, projectId))?.map(cloneCandidateRow) ?? [];
  }

  private characterRows(userId: string, projectId: string): Map<string, AuthorCharacterRow> {
    return new Map(this.charactersByProject.get(projectKey(userId, projectId)) ?? []);
  }

  private conflictRows(userId: string, projectId: string): Map<string, AuthorConflictRow> {
    return new Map(this.conflictsByProject.get(projectKey(userId, projectId)) ?? []);
  }

  private simulationRows(userId: string, projectId: string): Map<string, AuthorSimulationRow> {
    return new Map(this.simulationsByProject.get(projectKey(userId, projectId)) ?? []);
  }
}

function projectKey(userId: string, projectId: string): string {
  return `${userId}:${projectId}`;
}

function nowIso(): string {
  return new Date().toISOString();
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

function cloneImportRow(row: AuthorImportRow): AuthorImportRow {
  return { ...row };
}

function cloneCandidateRow(row: AuthorCandidateRow): AuthorCandidateRow {
  return { ...row, tags: [...row.tags] };
}

function cloneCharacterRow(row: AuthorCharacterRow): AuthorCharacterRow {
  return {
    ...row,
    aliases: [...row.aliases],
    scope: [...row.scope],
  };
}

function cloneConflictRow(row: AuthorConflictRow): AuthorConflictRow {
  return { ...row };
}

function cloneSimulationRow(row: AuthorSimulationRow): AuthorSimulationRow {
  return { ...row };
}
