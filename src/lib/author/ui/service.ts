import sourceManifest from '../../../../docs/knot-input/source_manifest.json';
import characterRegistry from '../../../../docs/knot-input/character_registry.json';
import worldRuleRegistry from '../../../../docs/knot-input/world_rule_registry.json';
import relationshipMatrix from '../../../../docs/knot-input/relationship_matrix.json';
import timelineEventLedger from '../../../../docs/knot-input/timeline_event_ledger.json';
import { randomUUID } from 'node:crypto';
import { canonicalJson, canonicalize, type JsonValue } from '@/lib/author/memory-v3/canonical';
import { createAuthorMemorySnapshot } from '@/lib/author/memory-v3/snapshot';
import {
  createAuthorAuditLogStoreForUser,
  createAuthorAuditLogEntry,
  hashAuthorAuditPrompt,
  replayAuthorAuditChain,
  type AuthorAuditEventType,
  type AuthorAuditLogEntry,
  type AuthorAuditLogStore,
  type AuthorAuditSearchFilter,
} from '@/lib/author/audit';
import {
  knotInputBundleToAuthorRecords,
  type KnotInputBundle,
} from '@/lib/author/memory-v3/knot-input';
import {
  AuthorDocumentParseError,
  parseAuthorDocument,
} from '@/lib/author/parser';
import { saveAuthorImportText } from '@/lib/author/storage/import-text-store';
import {
  AuthorR2ConfigError,
  buildAuthorR2ObjectKey,
  putAuthorImportObject,
} from '@/lib/author/storage/r2-store';
import {
  extractAuthorCandidates,
  generateBacklogForCharacter,
  type AuthorBacklogCandidate,
  type AuthorBacklogCategory,
  type ExtractedAuthorCandidate,
} from '@/lib/author/extraction';
import { checkFeatureGate, recordFeatureUsage } from '@/lib/author/billing/feature-gate';
import { recordFirstFunnelEvent } from '@/lib/analytics/funnel';
import { InMemoryAuthorUiStore } from './in-memory-store';
import { conflictStatusForDecision, normalizeConflictResolution } from './conflict-resolution';
import { seedAuthorUiProject, type AuthorUiSeedRows } from './seed-project';
import { createAuthorUiStoreForUser, type AuthorUiStore } from './store';
import type {
  AuthorCandidateFilter,
  AuthorCandidateKind,
  AuthorCandidateRow,
  AuthorCandidateStatus,
  AuthorCharacterRow,
  AuthorConflictFilter,
  AuthorConflictSeverity,
  AuthorConflictStatus,
  AuthorConflictRow,
  AuthorImportRow,
  AuthorSimulationRow,
} from './store-types';

type JsonRecord = Record<string, unknown>;

type FactStatus =
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

type CandidateType =
  | 'character'
  | 'world_rule'
  | 'event'
  | 'relationship'
  | 'voice_sample'
  | 'fact';

export interface AuthorUiProject {
  id: string;
  name: string;
  description: string;
  scope: string[];
  entity_count: number;
  candidate_count: number;
  conflict_count: number;
  last_updated: string;
  phase: string;
  trial_status: { is_trial: boolean; days_remaining: number };
}

export interface AuthorUiImport {
  id: string;
  file_name: string;
  file_size: number;
  file_type: 'md' | 'docx' | 'pdf' | 'txt' | 'json' | 'notion_export' | 'obsidian_md';
  upload_at: string;
  parse_status: 'queued' | 'parsing' | 'parsed' | 'failed';
  parse_progress: number;
  extract_status: 'queued' | 'extracting' | 'extracted' | 'failed';
  extract_progress: number;
  candidate_count: number;
  error_message?: string | null;
  storage_key?: string | null;
  parsed_text_preview?: string | null;
  parser_version?: string | null;
  source_role: 'canon' | 'character' | 'scene' | 'reference' | 'visual';
  a_or_d_mode: 'extract' | 'raw_keep';
}

export interface AuthorUiCandidate {
  id: string;
  content: string;
  type: CandidateType;
  status: FactStatus;
  confidence: number;
  suggested_status: FactStatus;
  tags: string[];
  source: {
    document_id: string;
    file_path: string;
    span: {
      start_line: number;
      end_line: number;
      start_char: number;
      end_char: number;
    };
    excerpt: string;
  };
  related_existing: Array<{
    entity_id: string;
    entity_type?: string;
    relationship: 'duplicate' | 'similar' | 'conflicts';
  }>;
  extracted_at: string;
  target_entity_id?: string;
}

export interface AuthorUiCharacterSummary {
  id: string;
  name: string;
  aliases: string[];
  scope: string[];
  summary: string;
}

export interface AuthorUiCharacterDetail extends AuthorUiCharacterSummary {
  archetype: string;
  voice: {
    speech_pattern: string;
    vocabulary: string;
    signature_expressions: string[];
    taboo_words: string[];
  };
  persona: {
    traits: string[];
    desires: string[];
    vulnerabilities: string[];
  };
  appearance: JsonRecord;
  background: JsonRecord;
  knowledge_state: {
    known_facts: Array<{
      fact_id: string;
      content_summary: string;
      learned_at: string;
      source_event_id: string;
    }>;
    unknown_facts: Array<{ fact_id: string; reason: string }>;
    hidden_facts: Array<{ fact_id: string; hidden_from: string[] }>;
    author_only_facts: Array<{ fact_id: string }>;
    misunderstandings: Array<{ correct_fact_id: string; what_char_thinks: string }>;
  };
  relationships: Array<{
    to_character_id: string;
    type: string;
    current_dimensions: JsonRecord;
    recent_events: string[];
  }>;
  recent_important_memories: Array<{
    memory_id: string;
    salience: number;
    summary: string;
    day: string;
  }>;
  voice_samples: Array<{ source_event_id: string; dialogue_text: string }>;
  current_arc_phase: string;
}

export interface AuthorUiSimulation {
  simulation_id: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  progress: number;
  started_at: string;
  completed_at?: string;
  input: { echo: JsonRecord };
  context_used: JsonRecord;
  candidates: Array<{
    candidate_id: string;
    rank: number;
    current_known_facts: Array<{ fact_id: string; content: string; tier: string }>;
    unknown_or_forbidden_facts: Array<{
      fact_id: string;
      content_summary: string;
      reason_unknown: string;
      is_author_only: boolean;
    }>;
    internal_thought_candidates: Array<{
      thought_id: string;
      text: string;
      tone: string;
      voice_consistency_score: number;
    }>;
    dialogue_candidates: Array<{
      dialogue_id: string;
      text: string;
      tone: string;
      voice_consistency_score: number;
    }>;
    action_candidates: Array<{
      action_id: string;
      description: string;
      physicality: string;
    }>;
    canon_risk: {
      level: 'low' | 'medium' | 'high' | 'leak';
      reasoning: string;
      leak_warnings: Array<{
        type:
          | 'author_only_leak'
          | 'forbidden_in_scope_leak'
          | 'tier_2_leak'
          | 'character_unknown_violation';
        severity: 'critical' | 'high' | 'medium';
        fact_at_risk: string;
        explanation: string;
      }>;
    };
    supporting_memories: Array<{ memory_id: string; weight: number; reason: string }>;
    supporting_graph_edges: Array<{ edge_id: string; weight: number }>;
    supporting_persona_traits: Array<{ trait: string; match_strength: number }>;
    contradiction_warnings: Array<{ warning_id: string; conflicts_with_fact: string; explanation: string }>;
  }>;
  trace_metadata: JsonRecord;
  diagnostics: JsonRecord;
}

interface AuthorUiState {
  userId: string;
  lastAccessedAt: number;
  projects: Map<string, AuthorUiProject>;
  importsByProject: Map<string, AuthorUiImport[]>;
  candidatesByProject: Map<string, AuthorUiCandidate[]>;
  characterDetailsByProject: Map<string, Map<string, AuthorUiCharacterDetail>>;
  conflictsByProject: Map<string, ReturnType<typeof buildSeedConflicts>>;
  simulationsByProject: Map<string, Map<string, AuthorUiSimulation>>;
  settingsByProject: Map<string, ReturnType<typeof buildDefaultSettings>>;
  auditLog: AuthorAuditLogStore;
  auditLogWrites: Set<Promise<void>>;
  uiStore?: AuthorUiStore;
  byok: {
    enabled: boolean;
    provider: 'anthropic' | 'google' | 'openai' | null;
    key_last_4?: string | null;
    verified_at?: string | null;
    status: 'active' | 'invalid' | 'revoked' | 'missing' | null;
  };
}

const DEFAULT_PROJECT_ID = 'knot';
export const AUTHOR_IMPORT_MAX_BYTES = 50 * 1024 * 1024;
const FORBIDDEN_FIELD_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const AUTHOR_UI_STATE_TTL_MS = 30 * 60 * 1000;
const AUTHOR_UI_MAX_STATES = 100;
const statesByUser = new Map<string, AuthorUiState>();

const seedBundle: KnotInputBundle = {
  characterRegistry: characterRegistry as KnotInputBundle['characterRegistry'],
  worldRuleRegistry: worldRuleRegistry as KnotInputBundle['worldRuleRegistry'],
  relationshipMatrix: relationshipMatrix as KnotInputBundle['relationshipMatrix'],
  timelineEventLedger: timelineEventLedger as KnotInputBundle['timelineEventLedger'],
};

export function getAuthorUiService(userId: string): AuthorUiService {
  pruneAuthorUiStates();
  let state = statesByUser.get(userId);
  if (!state) {
    state = createSeedState(userId);
    statesByUser.set(userId, state);
  }
  state.lastAccessedAt = Date.now();

  const store = process.env.AUTHOR_UI_STORE === 'supabase'
    ? createAuthorUiStoreForUser({ userId })
    : state.uiStore ?? createInMemoryStoreFromState(state);
  state.uiStore = store;
  return new AuthorUiService(state, store, userId);
}

export function resetAuthorUiServiceForTests(userId = 'test-user'): AuthorUiService {
  const state = createSeedState(userId);
  state.lastAccessedAt = Date.now();
  const store = createInMemoryStoreFromState(state);
  state.uiStore = store;
  statesByUser.set(userId, state);
  return new AuthorUiService(state, store, userId);
}

function pruneAuthorUiStates(): void {
  const now = Date.now();
  for (const [userId, state] of statesByUser.entries()) {
    if (now - state.lastAccessedAt > AUTHOR_UI_STATE_TTL_MS) {
      statesByUser.delete(userId);
    }
  }

  if (statesByUser.size <= AUTHOR_UI_MAX_STATES) {
    return;
  }

  const staleFirst = [...statesByUser.entries()]
    .sort(([, left], [, right]) => left.lastAccessedAt - right.lastAccessedAt);
  for (const [userId] of staleFirst.slice(0, statesByUser.size - AUTHOR_UI_MAX_STATES)) {
    statesByUser.delete(userId);
  }
}

function newAuthorUiId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function newPersistedAuthorUiId(prefix: string): string {
  return process.env.AUTHOR_UI_STORE === 'supabase' ? randomUUID() : newAuthorUiId(prefix);
}

export class AuthorUiService {
  constructor(
    private readonly state: AuthorUiState,
    private readonly store: AuthorUiStore,
    private readonly userId: string,
  ) {}

  listProjects(): { projects: AuthorUiProject[] } {
    this.refreshProjectCounts();
    return { projects: [...this.state.projects.values()].sort((a, b) => a.id.localeCompare(b.id)) };
  }

  createProject(input: { name?: unknown; description?: unknown; initial_scope?: unknown }): { project_id: string } {
    const name = readString(input, 'name')?.trim();
    if (!name) {
      throw new AuthorUiValidationError('name is required');
    }

    const id = slugify(name) || `project-${this.state.projects.size + 1}`;
    const now = nowIso();
    this.state.projects.set(id, {
      id,
      name,
      description: readString(input, 'description') ?? '',
      scope: [readString(input, 'initial_scope') ?? 'global'],
      entity_count: 0,
      candidate_count: 0,
      conflict_count: 0,
      last_updated: now,
      phase: 'draft',
      trial_status: { is_trial: true, days_remaining: 14 },
    });
    this.state.importsByProject.set(id, []);
    this.state.candidatesByProject.set(id, []);
    this.state.characterDetailsByProject.set(id, new Map());
    this.state.conflictsByProject.set(id, []);
    this.state.simulationsByProject.set(id, new Map());
    this.state.settingsByProject.set(id, buildDefaultSettings());
    this.logAudit(id, 'project.created', {
      project_id: id,
      name,
      scope: [readString(input, 'initial_scope') ?? 'global'],
    });
    return { project_id: id };
  }

  async listImports(projectId: string) {
    this.ensureProject(projectId);
    await this.seedProjectIfNeeded(projectId);
    const imports = await this.store.listImports(this.userId, projectId);
    return {
      imports,
      summary: {
        total: imports.length,
        parsing: imports.filter((item) => item.parse_status === 'parsing').length,
        extracting: imports.filter((item) => item.extract_status === 'extracting').length,
        ready_for_review: imports.filter((item) => item.extract_status === 'extracted').length,
        failed: imports.filter((item) => item.parse_status === 'failed' || item.extract_status === 'failed').length,
      },
    };
  }

  async uploadImport(
    projectId: string,
    input: {
      fileName?: string;
      fileSize?: number;
      fileType?: string;
      fileBytes?: Buffer;
      sourceRole?: string;
      aOrDMode?: string;
    }
  ): Promise<{ import_id: string }> {
    this.ensureProject(projectId);
    // Reconcile declared vs actual file size BEFORE writing any DB row or
    // audit-log entry. Pre-audit, the inverted guard let a client send
    // `fileSize: 999_000_000` with no body — the row got inserted with the
    // bogus declared size, audit-log got polluted, then the > MAX branch
    // marked it `failed` and returned 200. Equally, a client could claim
    // `fileSize: 1024` but ship 50MB to R2 since the actual bytes were
    // never compared to the declaration.
    //
    // Now: if both are present, they must match within 1 byte (defensive
    // wiggle for transport quirks). If only `fileBytes` is present, trust
    // its length. If only `fileSize` is present (oversized declared
    // upload, no body shipped), allow the route's "too-large" path to
    // record the failed attempt — but reject other zero-body cases.
    const declaredFileSize = input.fileSize ?? null;
    const actualByteLength = input.fileBytes?.length ?? null;
    if (declaredFileSize != null && actualByteLength != null) {
      if (Math.abs(declaredFileSize - actualByteLength) > 1) {
        throw new AuthorUiValidationError(
          `declared fileSize (${declaredFileSize}) does not match actual bytes (${actualByteLength})`,
        );
      }
    }
    const fileSize = actualByteLength ?? declaredFileSize ?? 0;
    if (fileSize <= AUTHOR_IMPORT_MAX_BYTES && (!input.fileBytes || input.fileBytes.length === 0)) {
      throw new AuthorUiValidationError('file is required');
    }

    // v9 W2 (2026-05-08): chapter cap enforced as ~600KB upload size proxy
    // (≈ 100K English words / 200K Korean characters / ~20 chapters).
    // Charter tiers have no per-upload cap (up to AUTHOR_IMPORT_MAX_BYTES).
    // The gate also counts as 'extract' feature for the funnel.
    const FREE_TIER_UPLOAD_MAX_BYTES = 600 * 1024;
    const extractGate = await checkFeatureGate({
      userId: this.userId,
      feature: 'extract',
      // Use byte-size as a chapter/word proxy. checkExtractScope reports
      // by chapter or word — neither is precisely known here, so we set a
      // synthetic chapter count derived from size to land in the right
      // failure mode for the alert messaging.
      chapterCount: fileSize > FREE_TIER_UPLOAD_MAX_BYTES ? 21 : 1,
      wordCount: fileSize > FREE_TIER_UPLOAD_MAX_BYTES ? 100_001 : 1,
    });
    if (!extractGate.allowed) {
      throw new AuthorUiValidationError(
        'Free tier upload cap reached (~100K words / 20 chapters). Upgrade to Charter for full novels.',
      );
    }

    const id = newPersistedAuthorUiId('import');
    const fileName = input.fileName ?? 'untitled.md';
    const contentType = input.fileType;
    // Magic-number sniff: refuse uploads where the first bytes don't match
    // the declared file_type. Pre-audit a client could name a .docx with
    // .txt extension and the parser would feed zip bytes to iconv —
    // garbage in, garbage out at best, parser-confusion bug at worst.
    if (input.fileBytes && input.fileBytes.length >= 4) {
      const declaredType = normalizeFileType(contentType ?? fileName);
      const sniffedType = sniffFileType(input.fileBytes);
      if (sniffedType && sniffedType !== declaredType) {
        throw new AuthorUiValidationError(
          `file_type mismatch: declared ${declaredType}, content magic-number suggests ${sniffedType}`,
        );
      }
    }
    const item: AuthorUiImport = {
      id,
      file_name: fileName,
      file_size: fileSize,
      file_type: normalizeFileType(contentType ?? fileName),
      upload_at: nowIso(),
      parse_status: 'parsing',
      parse_progress: 10,
      extract_status: 'queued',
      extract_progress: 0,
      candidate_count: 0,
      error_message: null,
      storage_key: null,
      parsed_text_preview: null,
      parser_version: null,
      source_role: normalizeSourceRole(input.sourceRole),
      a_or_d_mode: input.aOrDMode === 'raw_keep' ? 'raw_keep' : 'extract',
    };

    await this.store.insertImport(authorImportToRow(item, this.userId, projectId));
    this.touchProject(projectId);
    const uploadAudit = this.logAudit(projectId, 'import.upload', {
      import_id: id,
      file_name: fileName,
      file_size: fileSize,
      file_type: item.file_type,
      source_role: item.source_role,
      a_or_d_mode: item.a_or_d_mode,
    });

    if (fileSize > AUTHOR_IMPORT_MAX_BYTES) {
      markImportFailed(item, 'file_too_large');
      await this.store.updateImport(this.userId, projectId, id, authorImportPatchToRowPatch(item));
      this.touchProject(projectId);
      this.logAudit(projectId, 'import.failed', {
        import_id: id,
        error_message: item.error_message,
      }, { parentDecisionId: uploadAudit.decisionId });
      return { import_id: id };
    }
    const fileBytes = input.fileBytes;
    if (!fileBytes || fileBytes.length === 0) {
      throw new AuthorUiValidationError('file is required');
    }

    try {
      const storageKey = buildAuthorR2ObjectKey({ projectId, importId: id, fileName });
      const storageRef = await putAuthorImportObject({
        key: storageKey,
        body: fileBytes,
        contentType,
        metadata: {
          project_id: projectId,
          import_id: id,
          source_role: item.source_role,
        },
      });
      item.storage_key = storageRef.key;
      item.parse_progress = 45;
      await this.store.updateImport(this.userId, projectId, id, authorImportPatchToRowPatch(item));

      const parsed = await parseAuthorDocument({
        buffer: fileBytes,
        fileName,
        contentType,
      });
      item.file_type = parsed.fileType;
      item.parse_progress = 80;
      await this.store.updateImport(this.userId, projectId, id, authorImportPatchToRowPatch(item));

      await saveAuthorImportText({
        importId: id,
        projectId,
        userId: this.state.userId,
        fileName,
        fileSize,
        contentType,
        storageRef,
        parsed,
      });

      item.parse_status = 'parsed';
      item.parse_progress = 100;
      item.extract_status = 'queued';
      item.extract_progress = 0;
      item.candidate_count = 0;
      item.error_message = null;
      item.parsed_text_preview = parsed.text.slice(0, 500);
      item.parser_version = parsed.parserVersion;
      await this.store.updateImport(this.userId, projectId, id, authorImportPatchToRowPatch(item));
      this.logAudit(projectId, 'import.parsed', {
        import_id: id,
        parser_version: parsed.parserVersion,
        storage_key: storageRef.key,
        text_hash: hashAuthorAuditPrompt(parsed.text),
        heading_count: parsed.headingStructure.length,
      }, {
        parentDecisionId: uploadAudit.decisionId,
        sourceSpan: {
          document_id: id,
          file_path: fileName,
        },
      });

      if (item.a_or_d_mode === 'extract') {
        try {
          item.extract_status = 'extracting';
          item.extract_progress = 35;
          await this.store.updateImport(this.userId, projectId, id, authorImportPatchToRowPatch(item));
          const existingCandidates = (await this.store.listCandidates(this.userId, projectId, {}))
            .map((candidate) => ({
              id: candidate.id,
              content: candidate.content,
              type: candidate.type,
            }));
          const extraction = await extractAuthorCandidates({
            userId: this.state.userId,
            projectId,
            importId: id,
            fileName,
            sourceRole: item.source_role,
            text: parsed.text,
            headings: parsed.headingStructure,
            existingCandidates,
          });
          const extractedCandidates = extraction.candidates.map((candidate, index) =>
            authorUiCandidateFromExtraction(candidate, id, index)
          );
          await this.store.insertCandidates(extractedCandidates.map((candidate) =>
            authorCandidateToRow(candidate, this.userId, projectId)
          ));
          item.extract_status = 'extracted';
          item.extract_progress = 100;
          item.candidate_count = extractedCandidates.length;
          await this.store.updateImport(this.userId, projectId, id, authorImportPatchToRowPatch(item));
          this.logAudit(projectId, 'candidate.added', {
            import_id: id,
            candidate_ids: extractedCandidates.map((candidate) => candidate.id),
            candidate_count: extractedCandidates.length,
            extraction_metrics: extraction.metrics,
          }, {
            parentDecisionId: uploadAudit.decisionId,
            llmMeta: extraction.metrics.mode === 'llm'
              ? {
                  provider: 'anthropic',
                  operation: 'extractAuthorCandidates',
                  mode: extraction.metrics.mode,
                }
              : undefined,
          });
        } catch (extractError) {
          item.extract_status = 'failed';
          item.extract_progress = 0;
          item.candidate_count = 0;
          item.error_message = formatImportError(extractError);
          await this.store.updateImport(this.userId, projectId, id, authorImportPatchToRowPatch(item));
          this.logAudit(projectId, 'import.failed', {
            import_id: id,
            stage: 'extract',
            error_message: item.error_message,
          }, { parentDecisionId: uploadAudit.decisionId });
        }
      }
    } catch (error) {
      markImportFailed(item, formatImportError(error));
      await this.store.updateImport(this.userId, projectId, id, authorImportPatchToRowPatch(item));
      this.logAudit(projectId, 'import.failed', {
        import_id: id,
        stage: 'parse_or_store',
        error_message: item.error_message,
      }, { parentDecisionId: uploadAudit.decisionId });
    }

    this.touchProject(projectId);
    return { import_id: id };
  }

  async retryImport(projectId: string, importId: string): Promise<{ status: 'queued' }> {
    const item = await this.findImport(projectId, importId);
    const patch: Partial<AuthorImportRow> = {
      parse_status: 'queued',
      parse_progress: 0,
      extract_status: 'queued',
      extract_progress: 0,
      error_message: null,
    };
    await this.store.updateImport(this.userId, projectId, item.id, patch);
    this.touchProject(projectId);
    this.logAudit(projectId, 'import.retried', { import_id: importId });
    return { status: 'queued' };
  }

  async deleteImport(projectId: string, importId: string): Promise<{ deleted: boolean }> {
    this.ensureProject(projectId);
    const existing = await this.store.getImport(this.userId, projectId, importId);
    await this.store.deleteImport(this.userId, projectId, importId);
    this.touchProject(projectId);
    const deleted = Boolean(existing);
    this.logAudit(projectId, 'import.deleted', { import_id: importId, deleted });
    return { deleted };
  }

  async listCandidates(projectId: string, filters: URLSearchParams) {
    this.ensureProject(projectId);
    await this.seedProjectIfNeeded(projectId);
    const filter = candidateFilterFromSearchParams(filters);
    const page = Math.max(1, Number(filters.get('page') ?? '1') || 1);
    const pageSize = Math.max(1, Math.min(100, Number(filters.get('page_size') ?? '50') || 50));
    let candidates = await this.store.listCandidates(this.userId, projectId, filter);
    const total = candidates.length;
    candidates = candidates.slice((page - 1) * pageSize, page * pageSize);
    return { candidates, total, page };
  }

  async getCandidate(projectId: string, candidateId: string): Promise<{ candidate: AuthorUiCandidate }> {
    const candidate = await this.findCandidate(projectId, candidateId);
    return { candidate };
  }

  async createCandidate(projectId: string, input: JsonRecord): Promise<{ candidate_id: string; decision_id: string }> {
    this.ensureProject(projectId);
    const content = readString(input, 'content') ?? await simulationPromoteContent(this, projectId, input);
    if (!content) {
      throw new AuthorUiValidationError('content is required');
    }

    const id = newPersistedAuthorUiId('candidate');
    const candidate: AuthorUiCandidate = {
      id,
      content,
      type: normalizeCandidateType(readString(input, 'type')),
      status: 'candidate',
      confidence: 0.78,
      suggested_status: normalizeFactStatus(readString(input, 'suggested_status')) ?? 'canon',
      tags: readStringArray(input, 'tags'),
      source: {
        document_id: readString(input, 'from_simulation_id') ?? 'manual',
        file_path: 'manual-entry',
        span: { start_line: 0, end_line: 0, start_char: 0, end_char: content.length },
        excerpt: content.slice(0, 180),
      },
      related_existing: [],
      extracted_at: nowIso(),
      target_entity_id: readString(input, 'target_entity_id'),
    };
    await this.store.insertCandidates([authorCandidateToRow(candidate, this.userId, projectId)]);
    this.touchProject(projectId);
    const audit = this.logAudit(projectId, 'candidate.added', {
      candidate_id: id,
      candidate_type: candidate.type,
      source_document_id: candidate.source.document_id,
      target_entity_id: candidate.target_entity_id,
      tags: candidate.tags,
    }, {
      sourceSpan: {
        document_id: candidate.source.document_id,
        file_path: candidate.source.file_path,
        start_line: candidate.source.span.start_line,
        end_line: candidate.source.span.end_line,
        start_char: candidate.source.span.start_char,
        end_char: candidate.source.span.end_char,
      },
    });
    return { candidate_id: id, decision_id: audit.decisionId };
  }

  async decideCandidate(projectId: string, candidateId: string, input: JsonRecord) {
    const candidate = await this.findCandidate(projectId, candidateId);
    const action = readString(input, 'action') ?? 'approve';
    const nextStatus: FactStatus = actionToStatus(action);
    const promotedEntityId =
      nextStatus === 'canon'
        ? candidate.target_entity_id ?? candidate.related_existing[0]?.entity_id ?? candidate.id
        : undefined;
    const audit = this.logAudit(projectId, 'candidate.decided', {
      candidate_id: candidateId,
      action,
      new_status: nextStatus,
      promoted_entity_id: promotedEntityId,
      candidate_type: candidate.type,
    }, {
      sourceSpan: {
        document_id: candidate.source.document_id,
        file_path: candidate.source.file_path,
        start_line: candidate.source.span.start_line,
        end_line: candidate.source.span.end_line,
        start_char: candidate.source.span.start_char,
        end_char: candidate.source.span.end_char,
      },
    });
    await this.store.updateCandidate(this.userId, projectId, candidateId, {
      status: nextStatus,
      decided_at: nowIso(),
      decision_id: audit.decisionId,
      promoted_entity_id: promotedEntityId ?? null,
    });
    this.touchProject(projectId);
    return {
      candidate_id: candidateId,
      new_status: nextStatus,
      promoted_entity_id: promotedEntityId,
      decision_id: audit.decisionId,
      side_effects: [
        {
          type: nextStatus === 'canon' ? 'memory_added' : 'graph_updated',
          details: {
            action,
            candidate_type: candidate.type,
            target_entity_id: promotedEntityId,
          },
        },
      ],
    };
  }

  async batchDecideCandidates(projectId: string, input: JsonRecord) {
    const ids = readStringArray(input, 'candidate_ids');
    const action = readString(input, 'action') ?? 'approve';
    const results = [];
    for (const id of ids) {
      results.push(await this.decideCandidate(projectId, id, { action }));
    }
    const audit = this.logAudit(projectId, 'candidate.batch_decided', {
      candidate_ids: ids,
      action,
      processed: results.length,
      child_decision_ids: results.map((result) => result.decision_id),
    });
    return { processed: results.length, results, decision_id: audit.decisionId };
  }

  async listCharacters(projectId: string): Promise<{ characters: AuthorUiCharacterSummary[] }> {
    this.ensureProject(projectId);
    await this.seedProjectIfNeeded(projectId);
    const characters = await this.store.listCharacterSummaries(this.userId, projectId);
    return {
      characters,
    };
  }

  async getCharacter(projectId: string, characterId: string): Promise<{ character: AuthorUiCharacterDetail }> {
    const character = await this.findCharacter(projectId, characterId);
    return { character };
  }

  async updateCharacter(projectId: string, characterId: string, input: JsonRecord) {
    const character = await this.findCharacter(projectId, characterId);
    const field = readString(input, 'field');
    if (!field) {
      throw new AuthorUiValidationError('field is required');
    }

    applyCharacterPatch(character, field, input.value);
    await this.store.upsertCharacter(authorCharacterToRow(character, this.userId, projectId));
    const reviewRequired = field.startsWith('knowledge_state') || field.startsWith('background');
    const candidateId = reviewRequired
      ? (await this.createCandidate(projectId, {
          content: `Author edit for ${character.name}: ${field}`,
          type: 'fact',
          suggested_status: 'candidate',
          tags: ['author_edit'],
          target_entity_id: characterId,
        })).candidate_id
      : undefined;
    this.touchProject(projectId);
    const audit = this.logAudit(projectId, 'character.updated', {
      character_id: characterId,
      field,
      review_required: reviewRequired,
      candidate_id: candidateId,
    });
    return { updated: true, review_required: reviewRequired, candidate_id: candidateId, decision_id: audit.decisionId };
  }

  async generateCharacterBacklog(projectId: string, characterId: string, input: JsonRecord = {}) {
    // v9 feature gate: backlog generation is Charter-only on Free tier.
    const gate = await checkFeatureGate({
      userId: this.userId,
      feature: 'backlog',
    });
    if (!gate.allowed) {
      throw new AuthorUiValidationError(
        gate.reason === 'feature_charter_only'
          ? 'Backlog generation is available on Charter plans. Upgrade to unlock.'
          : 'Feature limit reached for this month.',
      );
    }
    const character = await this.findCharacter(projectId, characterId);
    const existingCandidates = (await this.store.listCandidates(this.userId, projectId, {}))
      .map((candidate) => ({
        id: candidate.id,
        content: candidate.content,
        type: candidate.type,
      }));
    const result = await generateBacklogForCharacter({
      userId: this.state.userId,
      projectId,
      character: {
        id: character.id,
        name: character.name,
        summary: character.summary,
        archetype: character.archetype,
        voice: character.voice,
        persona: character.persona,
        appearance: character.appearance,
        background: character.background,
        currentArcPhase: character.current_arc_phase,
      },
      categories: normalizeBacklogCategories(readStringArray(input, 'categories')),
      itemsPerCategory: readNumber(input, 'items_per_category'),
      existingEntries: readStringArray(input, 'existing_entries'),
      existingCandidates,
      principles: readString(input, 'principles'),
    });
    const generated = result.candidates.map((candidate, index) =>
      authorUiCandidateFromBacklog(candidate, character, index)
    );
    await this.store.insertCandidates(generated.map((candidate) =>
      authorCandidateToRow(candidate, this.userId, projectId)
    ));
    this.touchProject(projectId);
    const audit = this.logAudit(projectId, 'backlog.generated', {
      character_id: character.id,
      character_name: character.name,
      candidate_ids: generated.map((candidate) => candidate.id),
      candidate_count: generated.length,
      rejected_count: result.rejected.length,
      conflicts_detected: result.rejected.filter((item) =>
        item.reasons.some((reason) => reason.includes('duplicate'))
      ).length,
      metrics: result.metrics,
      export_hash: hashAuthorAuditPrompt(result.exportMarkdown),
    }, {
      llmMeta: {
        provider: result.metrics.mode === 'llm' ? 'anthropic' : 'heuristic',
        operation: 'generateBacklogForCharacter',
        mode: result.metrics.mode,
        prompt_hash: hashAuthorAuditPrompt({
          character_id: character.id,
          categories: result.metrics.categories,
          items_per_category: result.metrics.requested_per_category,
        }),
      },
    });
    this.logAudit(projectId, 'candidate.added', {
      source: 'backlog.generated',
      character_id: character.id,
      candidate_ids: generated.map((candidate) => candidate.id),
      candidate_count: generated.length,
    }, {
      parentDecisionId: audit.decisionId,
    });
    return {
      character_id: character.id,
      character_name: character.name,
      candidate_ids: generated.map((candidate) => candidate.id),
      decision_id: audit.decisionId,
      candidates: result.candidates,
      rejected: result.rejected,
      conflicts_detected: result.rejected.filter((item) =>
        item.reasons.some((reason) => reason.includes('duplicate'))
      ).length,
      export_markdown: result.exportMarkdown,
      metrics: result.metrics,
    };
  }

  getGraph(projectId: string, filters: URLSearchParams) {
    this.ensureProject(projectId);
    const characterDetails = this.state.characterDetailsByProject.get(projectId) ?? new Map();
    const scopes = csv(filters, 'scope');
    const types = csv(filters, 'type');
    const relationshipTypes = types.filter((type) => type !== 'person');
    const queryDay = parseDay(filters.get('time_state'));
    const nodes = [...characterDetails.values()]
      .filter((character) => scopes.length === 0 || character.scope.some((scope: string) => scopes.includes(scope)))
      .filter(() => types.length === 0 || types.includes('person') || relationshipTypes.length > 0)
      .map((character) => ({
        id: character.id,
        type: 'person' as const,
        label: character.name,
        importance: 0.9,
        color_group: 'character',
        scope: character.scope[0] ?? 'short1',
      }));
    const nodeIds = new Set(nodes.map((node) => node.id));

    const edges = relationshipItems().map((item, index) => ({
      id: readString(item, 'id') ?? `relationship-edge-${index}`,
      from: readString(item, 'from') ?? '',
      to: readString(item, 'to') ?? '',
      type: readString(item, 'relationship_type') ?? 'relationship',
      intensity: relationshipIntensity(item),
      valid_at: readString(item, 'valid_at') ?? readString(item, 'day') ?? 'D1',
      invalid_at: readString(item, 'invalid_at') ?? null,
      sources: [readString(item, 'source') ?? 'docs/knot-input/relationship_matrix.json'],
    }))
      .filter((edge) => edge.from && edge.to)
      .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
      .filter((edge) => relationshipTypes.length === 0 || relationshipTypes.includes(edge.type))
      .filter((edge) => matchesTimeState(edge.valid_at, edge.invalid_at, queryDay));

    return { nodes, edges };
  }

  getTimeline(projectId: string, filters: URLSearchParams) {
    this.ensureProject(projectId);
    let events = timelineItems().map((item, index) => ({
      id: readString(item, 'id') ?? `timeline-${index}`,
      day: readString(item, 'day') ?? `D${index + 1}`,
      date: readString(item, 'date') ?? '',
      scene_id: readString(item, 'scene_id') ?? null,
      where: readString(item, 'where') ?? '',
      who: readStringArray(item, 'who'),
      what: readString(item, 'what') ?? '',
      knowledge_partition: asRecord(item.knowledge_partition),
      tags: readStringArray(item, 'tags'),
      phase: String(item.phase ?? ''),
    }));

    const phase = filters.get('phase');
    if (phase) {
      events = events.filter((event) => event.phase === phase);
    }

    const dayRange = parseDayRange(filters.get('day_range'));
    if (dayRange) {
      events = events.filter((event) => {
        const day = parseDay(event.day);
        return day !== undefined && day >= dayRange.start && day <= dayRange.end;
      });
    }

    const characterIds = csv(filters, 'character_ids');
    if (characterIds.length > 0) {
      events = events.filter((event) =>
        event.who.some((id) => characterIds.some((candidate) => matchesCharacterId(id, candidate)))
      );
    }

    return {
      events,
      phase_markers: [
        { phase: '1', day_range: '[D1,D11]' },
        { phase: '2', day_range: '[D12,D25]' },
        { phase: '3', day_range: '[D26,D35]' },
      ],
    };
  }

  async listConflicts(projectId: string, filters: URLSearchParams) {
    this.ensureProject(projectId);
    await this.seedProjectIfNeeded(projectId);
    const conflicts = (await this.store.listConflicts(
      this.userId,
      projectId,
      conflictFilterFromSearchParams(filters)
    )).map(authorConflictRowToUi);
    return { conflicts };
  }

  async resolveConflict(projectId: string, conflictId: string, input: JsonRecord) {
    this.ensureProject(projectId);
    const resolution = normalizeConflictResolution(input);
    if (!resolution) {
      throw new AuthorUiValidationError('decision must be keep_existing, replace_with_new, defer_both, or custom');
    }
    const conflicts = await this.store.listConflicts(this.userId, projectId, {});
    const conflict = conflicts.find((item) => item.conflict_key === conflictId || item.id === conflictId);
    if (!conflict) {
      throw new AuthorUiNotFoundError(`Conflict not found: ${conflictId}`);
    }
    await this.store.resolveConflict(
      this.userId,
      projectId,
      conflict.conflict_key,
      canonicalize(resolution),
      conflictStatusForDecision(resolution.decision)
    );
    this.touchProject(projectId);
    const audit = this.logAudit(projectId, 'conflict.resolved', {
      conflict_id: conflictId,
      decision: resolution.decision,
      resolution,
      affected_entities: authorConflictAffectedEntities(conflict),
    });
    return {
      resolved: true,
      decision_id: audit.decisionId,
      side_effects: [`conflict:${conflictId}:${resolution.decision}`],
    };
  }

  async runSimulation(projectId: string, input: JsonRecord) {
    this.ensureProject(projectId);
    // v9 feature gate: simulation = Dialog generation. Free tier 5/month cap.
    const gate = await checkFeatureGate({ userId: this.userId, feature: 'dialog' });
    if (!gate.allowed) {
      throw new AuthorUiValidationError(
        gate.reason === 'free_dialog_limit_exceeded'
          ? `Free tier limit reached (${gate.cap} Dialogs/month). Upgrade to Charter for unlimited.`
          : 'Dialog generation unavailable on Free tier.',
      );
    }
    const simulationId = newAuthorUiId('sim');
    const simulation = this.buildSimulation(projectId, simulationId, input);
    await this.store.upsertSimulation(authorSimulationToRow(simulation, this.userId, projectId));
    this.touchProject(projectId);
    const audit = this.logAudit(projectId, 'simulation.run', {
      simulation_id: simulationId,
      status: simulation.status,
      candidate_count: simulation.candidates.length,
      memory_snapshot_hash: String(simulation.context_used.memory_snapshot_hash ?? ''),
      deterministic: Boolean(simulation.trace_metadata.deterministic),
    }, {
      llmMeta: {
        provider: 'heuristic',
        model: 'author-memory-v3-sim-deterministic',
        operation: 'runSimulation',
        prompt_hash: hashAuthorAuditPrompt(input),
      },
    });
    // v9 funnel + usage tracking. Free users hit 5/mo cap; Charter bypasses.
    await recordFeatureUsage({ userId: this.userId, feature: 'dialog' });
    void recordFirstFunnelEvent({ userId: this.userId, eventType: 'first_dialog' });
    return {
      simulation_id: simulationId,
      status: 'running' as const,
      stream_url: `/api/projects/${projectId}/simulations/${simulationId}`,
      decision_id: audit.decisionId,
    };
  }

  async getSimulation(projectId: string, simulationId: string): Promise<AuthorUiSimulation> {
    const row = await this.store.getSimulation(this.userId, projectId, simulationId);
    const simulation = row ? authorSimulationRowToUi(row) : undefined;
    if (!simulation) {
      throw new AuthorUiNotFoundError(`Simulation not found: ${simulationId}`);
    }
    return simulation;
  }

  async replaySimulation(projectId: string, simulationId: string) {
    const simulation = await this.getSimulation(projectId, simulationId);
    const audit = this.logAudit(projectId, 'simulation.replay', {
      simulation_id: simulationId,
      replay_status: 'deterministic',
      output_hash: hashAuthorAuditPrompt(simulation),
      deterministic: true,
    }, {
      llmMeta: {
        provider: 'heuristic',
        model: 'author-memory-v3-sim-deterministic',
        operation: 'replaySimulation',
        prompt_hash: hashAuthorAuditPrompt(simulation.input),
      },
    });
    return {
      replay_status: 'deterministic' as const,
      decision_id: audit.decisionId,
      outputs: simulation,
    };
  }

  getSettings(projectId: string) {
    this.ensureProject(projectId);
    return this.state.settingsByProject.get(projectId) ?? buildDefaultSettings();
  }

  updateSettings(projectId: string, input: JsonRecord) {
    this.ensureProject(projectId);
    const settings = this.getSettings(projectId);
    const field = readString(input, 'field');
    if (!field) {
      throw new AuthorUiValidationError('field is required');
    }
    setDeepValue(settings, field, input.value);
    this.state.settingsByProject.set(projectId, settings);
    this.touchProject(projectId);
    const audit = this.logAudit(projectId, 'settings.updated', { field });
    return { updated: true, decision_id: audit.decisionId };
  }

  saveByok(input: JsonRecord) {
    const provider = readString(input, 'provider');
    const apiKey = readString(input, 'api_key');
    if (!isProvider(provider) || !apiKey || !isProviderKey(provider, apiKey)) {
      this.state.byok = {
        enabled: false,
        provider: isProvider(provider) ? provider : null,
        status: 'invalid',
      };
      this.logAudit(DEFAULT_PROJECT_ID, 'byok.updated', {
        provider: isProvider(provider) ? provider : null,
        status: 'invalid',
        api_key: apiKey,
      });
      throw new AuthorUiValidationError('invalid provider api key');
    }

    this.state.byok = {
      enabled: true,
      provider,
      key_last_4: apiKey.slice(-4),
      verified_at: nowIso(),
      status: 'active',
    };
    this.logAudit(DEFAULT_PROJECT_ID, 'byok.updated', {
      provider,
      status: 'active',
      key_last_4: apiKey.slice(-4),
    });
    return { valid: true, key_last_4: apiKey.slice(-4) };
  }

  getByok() {
    return this.state.byok;
  }

  clearByok() {
    const previousProvider = this.state.byok.provider;
    this.state.byok = {
      enabled: false,
      provider: null,
      key_last_4: null,
      verified_at: null,
      status: 'missing',
    };
    this.logAudit(DEFAULT_PROJECT_ID, 'byok.updated', {
      provider: previousProvider,
      status: 'missing',
    });
    return this.state.byok;
  }

  getUsage() {
    return {
      tokens_used_month: 121000,
      tokens_cap_month: 1000000,
      overage_charges_usd: 0,
      tier: 'Author',
      trial_days_remaining: 14,
      byok_active: this.state.byok.enabled,
    };
  }

  getSyncStatus(projectId: string) {
    const settings = this.getSettings(projectId);
    return {
      direction: settings.sync.sync_direction,
      last_sync: settings.sync.last_sync,
      error: settings.sync.error,
    };
  }

  async listAuditLogs(projectId: string, filters: URLSearchParams) {
    this.ensureProject(projectId);
    await this.flushAuditWrites();
    const filter = auditFilterFromSearchParams(projectId, filters);
    const auditLogs = await this.state.auditLog.search(filter);
    return {
      audit_logs: auditLogs.map(toAuthorAuditApiRecord),
      total: auditLogs.length,
      replay_available: auditLogs.some((entry) => entry.decisionId),
    };
  }

  async replayAuditDecision(projectId: string, decisionId: string) {
    this.ensureProject(projectId);
    await this.flushAuditWrites();
    const entries = await this.state.auditLog.search({ projectId, limit: 500 });
    const replay = replayAuthorAuditChain(entries, decisionId);
    return {
      ...replay,
      chain: replay.chain.map(toAuthorAuditApiRecord),
    };
  }

  async search(projectId: string, query: string) {
    this.ensureProject(projectId);
    const lower = query.toLowerCase();
    const characters = (await this.store.listCharacterSummaries(this.userId, projectId))
      .filter((item) => item.name.toLowerCase().includes(lower) || item.summary.toLowerCase().includes(lower))
      .slice(0, 8)
      .map((item) => ({
        id: item.id,
        type: 'character',
        label: item.name,
        snippet: item.summary,
      }));
    const candidates = (await this.store.listCandidates(this.userId, projectId, {}))
      .filter((item) => item.content.toLowerCase().includes(lower))
      .slice(0, 8)
      .map((item) => ({
        id: item.id,
        type: item.type,
        label: item.id,
        snippet: item.content.slice(0, 180),
      }));
    return { results: [...characters, ...candidates].slice(0, 12) };
  }

  private ensureProject(projectId: string): void {
    // IDOR defense: state.projects is per-user (keyed by this.userId in
    // statesByUser). It only contains DEFAULT_PROJECT_ID and projects
    // the user created via createProject() in the current cached
    // session. An attacker passing another user's projectId hits
    // AuthorUiNotFoundError → 404. Verified by audit 2026-05-08.
    //
    // Future-proofing: when persistent multi-project loads are added,
    // every code path that populates state.projects.set(id, …) MUST
    // first verify the project's ownership by user_id.
    if (this.state.projects.has(projectId)) {
      return;
    }

    throw new AuthorUiNotFoundError(`Project not found: ${projectId}`);
  }

  private async findImport(projectId: string, importId: string): Promise<AuthorUiImport> {
    this.ensureProject(projectId);
    const item = await this.store.getImport(this.userId, projectId, importId);
    if (!item) {
      throw new AuthorUiNotFoundError(`Import not found: ${importId}`);
    }
    return item;
  }

  private async findCandidate(projectId: string, candidateId: string): Promise<AuthorUiCandidate> {
    this.ensureProject(projectId);
    const item = await this.store.getCandidate(this.userId, projectId, candidateId);
    if (!item) {
      throw new AuthorUiNotFoundError(`Candidate not found: ${candidateId}`);
    }
    return item;
  }

  private async findCharacter(projectId: string, characterId: string): Promise<AuthorUiCharacterDetail> {
    this.ensureProject(projectId);
    await this.seedProjectIfNeeded(projectId);
    const character = await this.store.getCharacter(this.userId, projectId, characterId);
    if (!character) {
      throw new AuthorUiNotFoundError(`Character not found: ${characterId}`);
    }
    return character;
  }

  private touchProject(projectId: string): void {
    const project = this.state.projects.get(projectId);
    if (project) {
      project.last_updated = nowIso();
    }
    this.refreshProjectCounts();
  }

  private refreshProjectCounts(): void {
    for (const [projectId, project] of this.state.projects.entries()) {
      const characterCount = this.state.characterDetailsByProject.get(projectId)?.size ?? 0;
      const candidateCount = (this.state.candidatesByProject.get(projectId) ?? [])
        .filter((item) => item.status === 'candidate').length;
      const conflictCount = (this.state.conflictsByProject.get(projectId) ?? [])
        .filter((item) => item.status === 'open').length;
      project.entity_count = characterCount;
      project.candidate_count = candidateCount;
      project.conflict_count = conflictCount;
    }
  }

  private buildSimulation(projectId: string, simulationId: string, input: JsonRecord): AuthorUiSimulation {
    const sceneInput = asRecord(input.scene_input ?? input);
    const perspective = readString(sceneInput, 'perspective') ?? 'knot.short1.char.sori';
    const character = this.state.characterDetailsByProject.get(projectId)?.get(perspective)
      ?? [...(this.state.characterDetailsByProject.get(projectId)?.values() ?? [])][0];
    const records = knotInputBundleToAuthorRecords(seedBundle);
    const snapshot = createAuthorMemorySnapshot({ projectId, records, generatedAt: nowIso() });
    const known = character?.knowledge_state.known_facts.slice(0, 3) ?? [];
    const unknown = character?.knowledge_state.unknown_facts.slice(0, 2) ?? [];
    const count = Math.max(1, Math.min(10, Number(sceneInput.candidate_count ?? 5) || 5));

    return {
      simulation_id: simulationId,
      status: 'complete',
      progress: 100,
      started_at: nowIso(),
      completed_at: nowIso(),
      input: { echo: sceneInput },
      context_used: {
        memory_snapshot_hash: snapshot.snapshotHash,
        perspective_character: {
          character_id: character?.id ?? perspective,
          persona_summary: character?.summary ?? 'No persona summary available.',
          voice_signature: character?.voice.signature_expressions ?? [],
          current_arc_phase: character?.current_arc_phase ?? 'unknown',
        },
        memories_loaded: known.map((fact, index) => ({
          memory_id: fact.fact_id,
          content_summary: fact.content_summary,
          salience: 0.9 - index * 0.1,
          category: 'fact',
          decay_remaining: 1,
          learned_at: fact.learned_at,
        })),
        knowledge_state: {
          known_count: character?.knowledge_state.known_facts.length ?? 0,
          unknown_count: character?.knowledge_state.unknown_facts.length ?? 0,
          author_only_count: character?.knowledge_state.author_only_facts.length ?? 0,
        },
        graph_edges_loaded: (character?.relationships ?? []).slice(0, 5).map((relationship, index) => ({
          edge_id: `${character?.id ?? perspective}.edge.${index}`,
          from: character?.id ?? perspective,
          to: relationship.to_character_id,
          type: relationship.type,
          intensity: 0.7,
        })),
        world_rules_loaded: worldRuleItems().slice(0, 5).map((rule) => ({
          rule_id: readString(rule, 'id') ?? 'rule',
          summary: readString(rule, 'name') ?? readString(rule, 'description') ?? '',
        })),
        scene_pressure_interpretation: readString(sceneInput, 'pressure') ?? 'low-pressure scene',
      },
      candidates: Array.from({ length: count }, (_, index) => ({
        candidate_id: `${simulationId}-candidate-${index + 1}`,
        rank: index + 1,
        current_known_facts: known.map((fact) => ({
          fact_id: fact.fact_id,
          content: fact.content_summary,
          tier: '1',
        })),
        unknown_or_forbidden_facts: unknown.map((fact) => ({
          fact_id: fact.fact_id,
          content_summary: fact.reason,
          reason_unknown: fact.reason,
          is_author_only: false,
        })),
        internal_thought_candidates: [
          {
            thought_id: `thought-${index + 1}`,
            text: `${character?.name ?? 'Character'} weighs the scene pressure against what they currently know.`,
            tone: index % 2 === 0 ? 'guarded' : 'direct',
            voice_consistency_score: 0.84,
          },
        ],
        dialogue_candidates: [
          {
            dialogue_id: `dialogue-${index + 1}`,
            text: `${character?.name ?? 'Character'}: I can answer from what I know right now.`,
            tone: index % 2 === 0 ? 'measured' : 'firm',
            voice_consistency_score: 0.81,
          },
        ],
        action_candidates: [
          {
            action_id: `action-${index + 1}`,
            description: `${character?.name ?? 'Character'} pauses, checks the others, then responds.`,
            physicality: 'small visible beat',
          },
        ],
        canon_risk: {
          level: index === 0 ? 'low' : 'medium',
          reasoning: 'Generated from known facts and excludes author-only facts by default.',
          leak_warnings: [],
        },
        supporting_memories: known.map((fact) => ({
          memory_id: fact.fact_id,
          weight: 0.8,
          reason: 'Perspective character knows this fact at the requested timepoint.',
        })),
        supporting_graph_edges: (character?.relationships ?? []).slice(0, 2).map((relationship, edgeIndex) => ({
          edge_id: `${character?.id ?? perspective}.${relationship.to_character_id}.${edgeIndex}`,
          weight: 0.7,
        })),
        supporting_persona_traits: (character?.persona.traits ?? []).slice(0, 3).map((trait) => ({
          trait,
          match_strength: 0.75,
        })),
        contradiction_warnings: [],
      })),
      trace_metadata: {
        provider: 'fixture',
        model: 'author-memory-v3-fixture',
        model_version: 'v1',
        input_tokens: canonicalJson(sceneInput).length,
        output_tokens: 400,
        total_cost_usd: 0,
        byok_used: this.state.byok.enabled,
        memory_snapshot_hash: snapshot.snapshotHash,
        side_effect_record_ids: [],
        replay_seed: simulationId,
        deterministic: true,
      },
      diagnostics: {
        warnings: [],
        context_completeness: 0.82,
        missing_context_items: [],
        candidate_diversity: 0.74,
      },
    };
  }

  private async seedProjectIfNeeded(projectId: string): Promise<void> {
    if (process.env.AUTHOR_UI_STORE !== 'supabase') {
      return;
    }
    await seedAuthorUiProject(this.store, this.userId, projectId, buildSeedRowsFromState(this.state, projectId));
  }

  async flushAuditWrites(): Promise<void> {
    if (this.state.auditLogWrites.size === 0) {
      return;
    }
    await Promise.all([...this.state.auditLogWrites]);
  }

  private logAudit(
    projectId: string,
    eventType: AuthorAuditEventType,
    payload: unknown,
    options: {
      llmMeta?: AuthorAuditLogEntry['llmMeta'];
      sourceSpan?: AuthorAuditLogEntry['sourceSpan'];
      parentDecisionId?: string;
    } = {}
  ): AuthorAuditLogEntry {
    const entry = createAuthorAuditLogEntry({
      projectId,
      userId: this.state.userId,
      eventType,
      payload,
      llmMeta: options.llmMeta,
      sourceSpan: options.sourceSpan,
      parentDecisionId: options.parentDecisionId,
    });
    let write: Promise<void>;
    try {
      write = Promise.resolve(this.state.auditLog.log(entry));
    } catch (error) {
      write = Promise.reject(error);
    }
    this.state.auditLogWrites.add(write);
    void write.then(() => {
      this.state.auditLogWrites.delete(write);
    }, () => {
      this.state.auditLogWrites.delete(write);
    });
    return entry;
  }
}

export class AuthorUiValidationError extends Error {}
export class AuthorUiNotFoundError extends Error {}

function createInMemoryStoreFromState(state: AuthorUiState): InMemoryAuthorUiStore {
  const store = new InMemoryAuthorUiStore();
  const seedRows = buildAllRowsFromState(state);
  for (const row of seedRows.imports ?? []) {
    void store.insertImport(row);
  }
  if (seedRows.candidates?.length) {
    void store.insertCandidates(seedRows.candidates);
  }
  for (const row of seedRows.characters ?? []) {
    void store.upsertCharacter(row);
  }
  for (const row of seedRows.conflicts ?? []) {
    void store.upsertConflict(row);
  }
  for (const row of seedRows.simulations ?? []) {
    void store.upsertSimulation(row);
  }
  return store;
}

function buildAllRowsFromState(state: AuthorUiState): AuthorUiSeedRows {
  const seedRows: AuthorUiSeedRows = {
    imports: [],
    candidates: [],
    characters: [],
    conflicts: [],
    simulations: [],
  };
  for (const [projectId, imports] of state.importsByProject.entries()) {
    seedRows.imports?.push(...imports.map((item) => authorImportToRow(item, state.userId, projectId)));
  }
  for (const [projectId, candidates] of state.candidatesByProject.entries()) {
    seedRows.candidates?.push(...candidates.map((item) => authorCandidateToRow(item, state.userId, projectId)));
  }
  for (const [projectId, characters] of state.characterDetailsByProject.entries()) {
    seedRows.characters?.push(...[...characters.values()].map((item) =>
      authorCharacterToRow(item, state.userId, projectId)
    ));
  }
  for (const [projectId, conflicts] of state.conflictsByProject.entries()) {
    seedRows.conflicts?.push(...conflicts.map((item) => authorConflictToRow(item, state.userId, projectId)));
  }
  for (const [projectId, simulations] of state.simulationsByProject.entries()) {
    seedRows.simulations?.push(...[...simulations.values()].map((item) =>
      authorSimulationToRow(item, state.userId, projectId)
    ));
  }
  return seedRows;
}

function buildSeedRowsFromState(state: AuthorUiState, projectId: string): AuthorUiSeedRows {
  return {
    imports: (state.importsByProject.get(projectId) ?? []).map((item) =>
      authorImportToRow(item, state.userId, projectId)
    ),
    candidates: (state.candidatesByProject.get(projectId) ?? []).map((item) =>
      authorCandidateToRow(item, state.userId, projectId)
    ),
    characters: [...(state.characterDetailsByProject.get(projectId)?.values() ?? [])].map((item) =>
      authorCharacterToRow(item, state.userId, projectId)
    ),
    conflicts: (state.conflictsByProject.get(projectId) ?? []).map((item) =>
      authorConflictToRow(item, state.userId, projectId)
    ),
    simulations: [...(state.simulationsByProject.get(projectId)?.values() ?? [])].map((item) =>
      authorSimulationToRow(item, state.userId, projectId)
    ),
  };
}

function authorImportToRow(item: AuthorUiImport, userId: string, projectId: string): AuthorImportRow {
  return {
    id: item.id,
    user_id: userId,
    project_id: projectId,
    file_name: item.file_name,
    file_size: item.file_size,
    file_type: item.file_type,
    source_role: item.source_role,
    a_or_d_mode: item.a_or_d_mode,
    parse_status: item.parse_status,
    parse_progress: item.parse_progress,
    extract_status: item.extract_status,
    extract_progress: item.extract_progress,
    candidate_count: item.candidate_count,
    error_message: item.error_message ?? null,
    storage_key: item.storage_key ?? null,
    parsed_text_preview: item.parsed_text_preview ?? null,
    parser_version: item.parser_version ?? null,
    upload_at: item.upload_at,
    created_at: item.upload_at,
    updated_at: nowIso(),
  };
}

function authorImportPatchToRowPatch(item: AuthorUiImport): Partial<AuthorImportRow> {
  return {
    file_type: item.file_type,
    parse_status: item.parse_status,
    parse_progress: item.parse_progress,
    extract_status: item.extract_status,
    extract_progress: item.extract_progress,
    candidate_count: item.candidate_count,
    error_message: item.error_message ?? null,
    storage_key: item.storage_key ?? null,
    parsed_text_preview: item.parsed_text_preview ?? null,
    parser_version: item.parser_version ?? null,
    updated_at: nowIso(),
  };
}

function authorCandidateToRow(item: AuthorUiCandidate, userId: string, projectId: string): AuthorCandidateRow {
  return {
    id: item.id,
    user_id: userId,
    project_id: projectId,
    content: item.content,
    kind: item.type,
    status: item.status,
    suggested_status: item.suggested_status,
    confidence: item.confidence,
    tags: [...item.tags],
    source: canonicalize(item.source),
    related_existing: canonicalize(item.related_existing),
    target_entity_id: item.target_entity_id ?? null,
    decision_id: null,
    promoted_entity_id: null,
    extracted_at: item.extracted_at,
    decided_at: null,
    created_at: item.extracted_at,
    updated_at: nowIso(),
  };
}

function authorCharacterToRow(item: AuthorUiCharacterDetail, userId: string, projectId: string): AuthorCharacterRow {
  return {
    id: randomUUID(),
    user_id: userId,
    project_id: projectId,
    character_key: item.id,
    name: item.name,
    aliases: [...item.aliases],
    scope: [...item.scope],
    summary: item.summary,
    archetype: item.archetype,
    voice: canonicalize(item.voice),
    persona: canonicalize(item.persona),
    appearance: canonicalize(item.appearance),
    background: canonicalize(item.background),
    knowledge_state: canonicalize(item.knowledge_state),
    relationships: canonicalize(item.relationships),
    recent_important_memories: canonicalize(item.recent_important_memories),
    voice_samples: canonicalize(item.voice_samples),
    current_arc_phase: item.current_arc_phase,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

function authorConflictToRow(
  item: ReturnType<typeof buildSeedConflicts>[number],
  userId: string,
  projectId: string
): AuthorConflictRow {
  return {
    id: randomUUID(),
    user_id: userId,
    project_id: projectId,
    conflict_key: item.id,
    severity: item.severity,
    status: item.status,
    payload: canonicalize({
      detected_at: item.detected_at,
      existing_fact: item.existing_fact,
      new_fact: item.new_fact,
      llm_analysis: item.llm_analysis,
      impact_summary: item.impact_summary,
      affected_entities: item.affected_entities,
    }),
    resolution: item.resolution,
    resolved_at: item.status === 'resolved' ? nowIso() : null,
    created_at: item.detected_at,
    updated_at: nowIso(),
  };
}

function authorConflictRowToUi(row: AuthorConflictRow): ReturnType<typeof buildSeedConflicts>[number] {
  const payload = asRecord(row.payload);
  return {
    id: row.conflict_key,
    severity: row.severity === 'low' ? 'medium' : row.severity,
    status: row.status,
    detected_at: readString(payload, 'detected_at') ?? row.created_at,
    existing_fact: asRecord(payload.existing_fact),
    new_fact: asRecord(payload.new_fact),
    llm_analysis: readString(payload, 'llm_analysis') ?? '',
    impact_summary: readString(payload, 'impact_summary') ?? '',
    affected_entities: readStringArray(payload, 'affected_entities'),
    resolution: row.resolution,
  } as ReturnType<typeof buildSeedConflicts>[number];
}

function authorConflictAffectedEntities(row: AuthorConflictRow): string[] {
  return readStringArray(asRecord(row.payload), 'affected_entities');
}

function authorSimulationToRow(item: AuthorUiSimulation, userId: string, projectId: string): AuthorSimulationRow {
  return {
    id: randomUUID(),
    user_id: userId,
    project_id: projectId,
    simulation_key: item.simulation_id,
    status: item.status,
    progress: item.progress,
    input: canonicalize(item.input),
    context_used: canonicalize(item.context_used),
    candidates: canonicalize(item.candidates),
    trace_metadata: canonicalize(item.trace_metadata),
    diagnostics: canonicalize(item.diagnostics),
    llm_meta: null,
    started_at: item.started_at,
    completed_at: item.completed_at ?? null,
    created_at: item.started_at,
    updated_at: nowIso(),
  };
}

function authorSimulationRowToUi(row: AuthorSimulationRow): AuthorUiSimulation {
  return {
    simulation_id: row.simulation_key,
    status: row.status,
    progress: row.progress,
    started_at: row.started_at,
    completed_at: row.completed_at ?? undefined,
    input: row.input as AuthorUiSimulation['input'],
    context_used: row.context_used as AuthorUiSimulation['context_used'],
    candidates: row.candidates as AuthorUiSimulation['candidates'],
    trace_metadata: row.trace_metadata as AuthorUiSimulation['trace_metadata'],
    diagnostics: row.diagnostics as AuthorUiSimulation['diagnostics'],
  };
}

function candidateFilterFromSearchParams(filters: URLSearchParams): AuthorCandidateFilter {
  return {
    statuses: csv(filters, 'status').filter(isAuthorCandidateStatus),
    kinds: csv(filters, 'type').filter(isAuthorCandidateKind),
    confidenceMin: Number(filters.get('confidence_min') ?? '0'),
    scopes: csv(filters, 'scope'),
    tiers: csv(filters, 'tier'),
    sourceId: filters.get('source_id')?.trim(),
    sort: filters.get('sort') ?? 'priority',
  };
}

function conflictFilterFromSearchParams(filters: URLSearchParams): AuthorConflictFilter {
  const severity = filters.get('severity');
  const status = filters.get('status');
  return {
    severity: isAuthorConflictSeverity(severity) ? severity : undefined,
    status: isAuthorConflictStatus(status) ? status : undefined,
  };
}

function isAuthorCandidateStatus(value: string): value is AuthorCandidateStatus {
  return [
    'candidate',
    'canon',
    'rejected',
    'retired',
    'past_only',
    'contradicted',
    'invalidated',
    'author_only',
    'character_known',
    'character_unknown',
  ].includes(value);
}

function isAuthorCandidateKind(value: string): value is AuthorCandidateKind {
  return ['character', 'world_rule', 'event', 'relationship', 'voice_sample', 'fact'].includes(value);
}

function isAuthorConflictSeverity(value: string | null): value is AuthorConflictSeverity {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical';
}

function isAuthorConflictStatus(value: string | null): value is AuthorConflictStatus {
  return value === 'open' || value === 'resolved' || value === 'deferred';
}

function auditFilterFromSearchParams(projectId: string, params: URLSearchParams): AuthorAuditSearchFilter {
  return {
    projectId,
    eventTypes: auditEventTypesFromCsv(params.get('event_type') ?? params.get('event')),
    decisionId: readParam(params, 'decision_id'),
    q: readParam(params, 'q'),
    since: readParam(params, 'since'),
    until: readParam(params, 'until'),
    limit: Math.max(1, Math.min(500, Number(params.get('limit') ?? '100') || 100)),
  };
}

function auditEventTypesFromCsv(value: string | null): AuthorAuditEventType[] | undefined {
  if (!value) return undefined;
  const allowed = new Set<AuthorAuditEventType>([
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
  ]);
  const selected = value
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is AuthorAuditEventType => allowed.has(item as AuthorAuditEventType));
  return selected.length > 0 ? selected : undefined;
}

function toAuthorAuditApiRecord(entry: AuthorAuditLogEntry): JsonRecord {
  return {
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
  };
}

function readParam(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name)?.trim();
  return value ? value : undefined;
}

function createSeedState(userId: string): AuthorUiState {
  const characters = buildSeedCharacters();
  const characterMap = new Map(characters.map((character) => [character.id, character]));
  const candidates = buildSeedCandidates();
  const imports = buildSeedImports(candidates.length);
  const conflicts = buildSeedConflicts();
  const settings = buildDefaultSettings();
  const project: AuthorUiProject = {
    id: DEFAULT_PROJECT_ID,
    name: 'KNOT Author Memory',
    description: 'KNOT short 1 canon review workspace seeded from Author Memory v3 artifacts.',
    scope: ['global', 'short1', 'main'],
    entity_count: characterMap.size,
    candidate_count: candidates.filter((candidate) => candidate.status === 'candidate').length,
    conflict_count: conflicts.filter((conflict) => conflict.status === 'open').length,
    last_updated: nowIso(),
    phase: 'Phase 1',
    trial_status: { is_trial: true, days_remaining: 14 },
  };

  return {
    userId,
    lastAccessedAt: Date.now(),
    projects: new Map([[DEFAULT_PROJECT_ID, project]]),
    importsByProject: new Map([[DEFAULT_PROJECT_ID, imports]]),
    candidatesByProject: new Map([[DEFAULT_PROJECT_ID, candidates]]),
    characterDetailsByProject: new Map([[DEFAULT_PROJECT_ID, characterMap]]),
    conflictsByProject: new Map([[DEFAULT_PROJECT_ID, conflicts]]),
    simulationsByProject: new Map([[DEFAULT_PROJECT_ID, new Map()]]),
    settingsByProject: new Map([[DEFAULT_PROJECT_ID, settings]]),
    auditLog: createAuthorAuditLogStoreForUser({ userId }),
    auditLogWrites: new Set(),
    byok: {
      enabled: false,
      provider: null,
      status: null,
    },
  };
}

function buildSeedImports(candidateCount: number): AuthorUiImport[] {
  return sourceDocuments().slice(0, 12).map((doc, index) => {
    const path = readString(doc, 'path') ?? `source-${index}.md`;
    return {
      id: `source-${index + 1}`,
      file_name: path.split(/[\\/]/).pop() ?? path,
      file_size: 2048 + index * 113,
      file_type: normalizeFileType(path),
      upload_at: nowIso(index),
      parse_status: 'parsed',
      parse_progress: 100,
      extract_status: 'extracted',
      extract_progress: 100,
      candidate_count: Math.max(1, Math.floor(candidateCount / 12)),
      error_message: null,
      source_role: normalizeSourceRole(readString(doc, 'role')),
      a_or_d_mode: 'extract',
    };
  });
}

function buildSeedCandidates(): AuthorUiCandidate[] {
  const characterCandidates = characterItems().map((item, index) =>
    candidateFromRaw({
      raw: item,
      index,
      type: 'character',
      content: compactText([
        readString(item, 'name'),
        readString(item, 'story_role'),
        readString(item, 'current_status'),
        stringify(item.voice),
        stringify(item.personality_core),
      ]),
      sourcePath: 'docs/knot-input/character_registry.json',
      targetEntityId: readString(item, 'id'),
      confidence: 0.9,
    })
  );

  const worldRuleCandidates = worldRuleItems().map((item, index) =>
    candidateFromRaw({
      raw: item,
      index,
      type: 'world_rule',
      content: compactText([readString(item, 'name'), readString(item, 'description')]),
      sourcePath: 'docs/knot-input/world_rule_registry.json',
      targetEntityId: readString(item, 'id'),
      confidence: confidenceFrom(item.confidence),
    })
  );

  const relationshipCandidates = relationshipItems().map((item, index) =>
    candidateFromRaw({
      raw: item,
      index,
      type: 'relationship',
      content: compactText([
        readString(item, 'from'),
        readString(item, 'relationship_type'),
        readString(item, 'to'),
        stringify(item.current_state_w4 ?? item.current_state),
      ]),
      sourcePath: 'docs/knot-input/relationship_matrix.json',
      targetEntityId: readString(item, 'id'),
      confidence: 0.82,
    })
  );

  const eventCandidates = timelineItems().map((item, index) =>
    candidateFromRaw({
      raw: item,
      index,
      type: 'event',
      content: compactText([
        readString(item, 'day'),
        readString(item, 'date'),
        readString(item, 'where'),
        readString(item, 'what'),
      ]),
      sourcePath: 'docs/knot-input/timeline_event_ledger.json',
      targetEntityId: readString(item, 'id'),
      confidence: 0.86,
    })
  );

  return [
    ...characterCandidates,
    ...worldRuleCandidates,
    ...relationshipCandidates,
    ...eventCandidates,
  ].sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
}

function buildSeedCharacters(): AuthorUiCharacterDetail[] {
  const relationships = relationshipItems();
  const timeline = timelineItems();

  return characterItems().map((item, index) => {
    const id = readString(item, 'id') ?? `knot.short1.char.${index}`;
    const name = readString(item, 'name') ?? id;
    const related = relationships.filter((relationship) =>
      readString(relationship, 'from') === id || readString(relationship, 'to') === id
    );
    const events = timeline.filter((event) => readStringArray(event, 'who').includes(id));

    return {
      id,
      name,
      aliases: readStringArray(item, 'aliases'),
      scope: readStringArrayOrFallback(item, 'scope', ['short1']),
      summary: compactText([
        readString(item, 'story_role'),
        readString(item, 'current_status'),
        readString(asRecord(item.archetype), 'label') ?? stringify(item.archetype),
      ]),
      archetype: readString(asRecord(item.archetype), 'label') ?? stringify(item.archetype) ?? '',
      voice: buildVoice(item),
      persona: buildPersona(item),
      appearance: asRecord(item.appearance),
      background: asRecord(item.background ?? item.basic_info),
      knowledge_state: buildKnowledgeState(id, item, events),
      relationships: related.map((relationship) => {
        const from = readString(relationship, 'from');
        const to = readString(relationship, 'to');
        return {
          to_character_id: from === id ? (to ?? '') : (from ?? ''),
          type: readString(relationship, 'relationship_type') ?? 'relationship',
          current_dimensions: asRecord(relationship.current_state_w4 ?? relationship.current_state),
          recent_events: readStringArray(relationship, 'events_progression'),
        };
      }).filter((relationship) => relationship.to_character_id),
      recent_important_memories: events.slice(0, 5).map((event, eventIndex) => ({
        memory_id: readString(event, 'id') ?? `event-${eventIndex}`,
        salience: 0.9 - eventIndex * 0.08,
        summary: readString(event, 'what') ?? '',
        day: readString(event, 'day') ?? '',
      })),
      voice_samples: readVoiceSamples(item, events),
      current_arc_phase: readString(item, 'current_status') ?? 'active',
    };
  });
}

function buildSeedConflicts() {
  const candidates = buildSeedCandidates();
  return candidates.slice(0, 4).map((candidate, index) => ({
    id: `conflict-${index + 1}`,
    severity: (index === 0 ? 'critical' : index === 1 ? 'high' : 'medium') as 'critical' | 'high' | 'medium',
    status: 'open' as 'open' | 'resolved',
    detected_at: nowIso(index),
    existing_fact: {
      entity_id: candidate.target_entity_id ?? candidate.id,
      content: `Existing canon around ${candidate.type}`,
      valid_at: 'D1',
      source: { document_id: 'canon_authority_rules' },
      confidence: 0.88,
      status: 'canon',
    },
    new_fact: {
      content: candidate.content,
      source: candidate.source,
      confidence: candidate.confidence,
      suggested_relationship: index % 2 === 0 ? 'contradicts' : 'scope_diff',
    },
    llm_analysis: 'Fixture conflict generated from KNOT v3 review candidates.',
    impact_summary: 'Requires author review before promoting candidate into canon.',
    affected_entities: [candidate.target_entity_id ?? candidate.id],
    resolution: null as string | null,
  }));
}

function buildDefaultSettings() {
  return {
    sync: {
      obsidian_enabled: true,
      obsidian_vault_path: null as string | null,
      notion_enabled: false,
      notion_workspace_id: null,
      sync_direction: 'bidirectional' as const,
      sync_frequency: 'manual',
      conflict_resolution: 'soft' as const,
      last_sync: nowIso(),
      error: null as string | null,
    },
    byok: {
      enabled: false,
      provider: null as 'anthropic' | 'google' | 'openai' | null,
      key_last_4: null as string | null,
    },
    usage: {
      tokens_used_month: 121000,
      tokens_cap_month: 1000000,
      overage_charges: 0,
    },
    tier: 'Author',
  };
}

function candidateFromRaw(input: {
  raw: JsonRecord;
  index: number;
  type: CandidateType;
  content: string;
  sourcePath: string;
  targetEntityId?: string;
  confidence: number;
}): AuthorUiCandidate {
  const id = readString(input.raw, 'id') ?? `${input.type}-${input.index + 1}`;
  const content = input.content || id;
  const status = normalizeFactStatus(readString(input.raw, 'status')) ?? 'candidate';
  const scopes = readStringArrayOrFallback(input.raw, 'scope', []);
  const tier = readString(input.raw, 'tier') ?? readString(input.raw, 'authority_tier');
  const tags = uniqueStrings([
    ...readStringArray(input.raw, 'tags'),
    ...scopes,
    ...(tier ? [tier, `tier:${tier}`] : []),
  ]);
  return {
    id: `candidate.${id}`,
    content,
    type: input.type,
    status,
    confidence: input.confidence,
    suggested_status: status === 'canon' ? 'canon' : 'candidate',
    tags,
    source: {
      document_id: input.sourcePath,
      file_path: input.sourcePath,
      span: {
        start_line: input.index + 1,
        end_line: input.index + 1,
        start_char: 0,
        end_char: content.length,
      },
      excerpt: content.slice(0, 180),
    },
    related_existing: input.targetEntityId
      ? [{ entity_id: input.targetEntityId, entity_type: input.type, relationship: 'similar' }]
      : [],
    extracted_at: nowIso(input.index),
    target_entity_id: input.targetEntityId,
  };
}

function authorUiCandidateFromExtraction(
  candidate: ExtractedAuthorCandidate,
  importId: string,
  index: number
): AuthorUiCandidate {
  return {
    id: `candidate.${importId}.${index + 1}`,
    content: candidate.content,
    type: candidate.type,
    status: candidate.status ?? 'candidate',
    confidence: candidate.confidence,
    suggested_status: candidate.suggested_status,
    tags: candidate.tags,
    source: candidate.source,
    related_existing: candidate.related_existing,
    extracted_at: nowIso(index),
    target_entity_id: candidate.target_entity_id,
  };
}

function authorUiCandidateFromBacklog(
  candidate: AuthorBacklogCandidate,
  character: AuthorUiCharacterDetail,
  index: number
): AuthorUiCandidate {
  const content = `${candidate.category} - ${candidate.content}`;
  return {
    id: `candidate.backlog.${slugId(character.id)}.${randomUUID()}.${index + 1}`,
    content,
    type: 'fact',
    status: 'candidate',
    confidence: 0.78,
    suggested_status: 'candidate',
    tags: [
      'short1',
      'tier:1',
      'backlog',
      `backlog:${candidate.category}`,
      `character:${character.id}`,
    ],
    source: {
      document_id: `backlog.${character.id}`,
      file_path: 'generated-backlog',
      span: {
        start_line: index + 1,
        end_line: index + 1,
        start_char: 0,
        end_char: content.length,
      },
      excerpt: content.slice(0, 180),
    },
    related_existing: [{
      entity_id: character.id,
      entity_type: 'character',
      relationship: 'similar',
    }],
    extracted_at: nowIso(index),
    target_entity_id: character.id,
  };
}

function normalizeBacklogCategories(values: string[]): AuthorBacklogCategory[] | undefined {
  const allowed: AuthorBacklogCategory[] = ['좋아하는 것', '싫어하는 것', '작은 보상', '작은 짜증'];
  const selected = values.filter((value): value is AuthorBacklogCategory =>
    allowed.includes(value as AuthorBacklogCategory)
  );
  return selected.length > 0 ? selected : undefined;
}

function slugId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'character';
}

function buildVoice(item: JsonRecord): AuthorUiCharacterDetail['voice'] {
  const voice = asRecord(item.voice);
  return {
    speech_pattern: readString(voice, 'speech_pattern') ?? stringify(voice) ?? '',
    vocabulary: readString(voice, 'vocabulary') ?? '',
    signature_expressions: readStringArray(voice, 'signature_expressions'),
    taboo_words: readStringArray(voice, 'taboo_words'),
  };
}

function buildPersona(item: JsonRecord): AuthorUiCharacterDetail['persona'] {
  const persona = asRecord(item.personality_core ?? item.persona);
  return {
    traits: readStringArrayOrFallback(persona, 'traits', fieldTextArray(persona)),
    desires: readStringArrayOrFallback(persona, 'desires', fieldTextArray(asRecord(item.desires))),
    vulnerabilities: readStringArrayOrFallback(
      persona,
      'vulnerabilities',
      fieldTextArray(asRecord(item.vulnerabilities))
    ),
  };
}

function buildKnowledgeState(
  characterId: string,
  item: JsonRecord,
  events: JsonRecord[]
): AuthorUiCharacterDetail['knowledge_state'] {
  const knowledge = asRecord(item.knowledge_state);
  const known = readStringArrayOrFallback(knowledge, 'known_facts', fieldTextArray(knowledge).slice(0, 4));
  const unknown = readStringArrayOrFallback(knowledge, 'unknown_facts', []);
  const authorOnly = readStringArrayOrFallback(knowledge, 'author_only_facts', []);

  return {
    known_facts: known.map((content, index) => ({
      fact_id: `${characterId}.known.${index + 1}`,
      content_summary: content,
      learned_at: readString(events[index] ?? {}, 'day') ?? 'D1',
      source_event_id: readString(events[index] ?? {}, 'id') ?? `event-${index + 1}`,
    })),
    unknown_facts: unknown.map((reason, index) => ({
      fact_id: `${characterId}.unknown.${index + 1}`,
      reason,
    })),
    hidden_facts: [],
    author_only_facts: authorOnly.map((_, index) => ({ fact_id: `${characterId}.author_only.${index + 1}` })),
    misunderstandings: readStringArrayOrFallback(knowledge, 'misunderstandings', []).map((what, index) => ({
      correct_fact_id: `${characterId}.misunderstanding.${index + 1}`,
      what_char_thinks: what,
    })),
  };
}

function readVoiceSamples(item: JsonRecord, events: JsonRecord[]) {
  const samples = readStringArrayOrFallback(asRecord(item.voice), 'samples', []);
  return samples.slice(0, 4).map((dialogue, index) => ({
    source_event_id: readString(events[index] ?? {}, 'id') ?? `voice-${index + 1}`,
    dialogue_text: dialogue,
  }));
}

function applyCharacterPatch(character: AuthorUiCharacterDetail, field: string, value: unknown): void {
  setDeepValue(character as unknown as JsonRecord, field, value);
}

function setDeepValue(target: JsonRecord, field: string, value: unknown): void {
  const parts = parseFieldPath(field);
  let cursor: JsonRecord = target;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) {
      cursor[part] = {};
    }
    cursor = cursor[part] as JsonRecord;
  }
  cursor[parts[parts.length - 1]] = value;
}

function parseFieldPath(field: string): string[] {
  const parts = field.split('.').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    throw new AuthorUiValidationError('field is required');
  }
  if (parts.some((part) => FORBIDDEN_FIELD_PATH_SEGMENTS.has(part))) {
    throw new AuthorUiValidationError('field path is not allowed');
  }
  return parts;
}

async function simulationPromoteContent(
  service: AuthorUiService,
  projectId: string,
  input: JsonRecord
): Promise<string | undefined> {
  const simulationId = readString(input, 'from_simulation_id');
  const candidateIndex = Number(input.from_simulation_candidate_index ?? 0);
  if (!simulationId) {
    return undefined;
  }

  try {
    const simulation = await service.getSimulation(projectId, simulationId);
    const candidate = simulation.candidates[candidateIndex] ?? simulation.candidates[0];
    return candidate?.dialogue_candidates[0]?.text ?? candidate?.internal_thought_candidates[0]?.text;
  } catch {
    return undefined;
  }
}

function sourceDocuments(): JsonRecord[] {
  return Array.isArray(sourceManifest.documents) ? sourceManifest.documents.map(asRecord) : [];
}

function characterItems(): JsonRecord[] {
  return [
    ...(Array.isArray(characterRegistry.characters) ? characterRegistry.characters : []),
    ...(Array.isArray(characterRegistry.supporting_cast) ? characterRegistry.supporting_cast : []),
  ].map(asRecord);
}

function worldRuleItems(): JsonRecord[] {
  return Array.isArray(worldRuleRegistry.rules) ? worldRuleRegistry.rules.map(asRecord) : [];
}

function relationshipItems(): JsonRecord[] {
  return Array.isArray(relationshipMatrix.relationships) ? relationshipMatrix.relationships.map(asRecord) : [];
}

function timelineItems(): JsonRecord[] {
  return Array.isArray(timelineEventLedger.events) ? timelineEventLedger.events.map(asRecord) : [];
}

function normalizeSourceRole(value: string | undefined): AuthorUiImport['source_role'] {
  if (value === 'character' || value === 'scene' || value === 'reference' || value === 'visual') {
    return value;
  }
  return 'canon';
}

function normalizeFileType(value: string | undefined): AuthorUiImport['file_type'] {
  const lower = (value ?? '').toLowerCase();
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.txt')) return 'txt';
  if (lower.endsWith('.json')) return 'json';
  if (lower.includes('notion')) return 'notion_export';
  if (lower.includes('obsidian')) return 'obsidian_md';
  return 'md';
}

/**
 * Best-effort file-type sniff based on magic bytes. Returns one of the
 * AuthorUiImport.file_type literals when a confident match is found, or
 * `null` when ambiguous (caller trusts the declared file_type).
 *
 * Defense-in-depth against parser-confusion: pre-audit a client could
 * upload a .docx with a .txt extension, the parser dispatched to iconv
 * on zip bytes (garbage at best, parser-confusion bug at worst). Or
 * label arbitrary bytes as .pdf to point pdf-parse at a hostile
 * payload. Magic-number agreement isn't a security guarantee but it
 * shuts down the obvious vectors.
 */
function sniffFileType(buffer: Buffer): AuthorUiImport['file_type'] | null {
  if (buffer.length < 4) return null;
  // PDF: %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'pdf';
  }
  // ZIP family (DOCX is a ZIP, Notion exports are ZIPs): PK\x03\x04
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    // Can't distinguish DOCX vs Notion-export here without unzipping;
    // accept as DOCX (the more common case) and let the parser dispatch
    // handle the actual content. Notion exports declared as docx will
    // fail later at parse-time with a clear error.
    return 'docx';
  }
  // JSON: starts with { or [ (after optional BOM/whitespace)
  let i = 0;
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) i = 3; // UTF-8 BOM
  while (
    i < buffer.length
    && (buffer[i] === 0x20 || buffer[i] === 0x09 || buffer[i] === 0x0a || buffer[i] === 0x0d)
  ) i++;
  if (i < buffer.length && (buffer[i] === 0x7b || buffer[i] === 0x5b)) {
    return 'json';
  }
  // Plain text / markdown — too ambiguous to sniff. Return null.
  return null;
}

function markImportFailed(item: AuthorUiImport, message: string): void {
  item.parse_status = 'failed';
  item.parse_progress = 100;
  item.extract_status = 'failed';
  item.extract_progress = 0;
  item.candidate_count = 0;
  item.error_message = message;
}

function formatImportError(error: unknown): string {
  if (error instanceof AuthorDocumentParseError) {
    return error.code === 'unsupported_format' ? 'unsupported_format' : error.message;
  }
  if (error instanceof AuthorR2ConfigError) {
    return 'r2_not_configured';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'import_failed';
}

function normalizeCandidateType(value: string | undefined): CandidateType {
  if (
    value === 'character' ||
    value === 'world_rule' ||
    value === 'event' ||
    value === 'relationship' ||
    value === 'voice_sample' ||
    value === 'fact'
  ) {
    return value;
  }
  return 'fact';
}

function normalizeFactStatus(value: string | undefined): FactStatus | undefined {
  if (
    value === 'candidate' ||
    value === 'canon' ||
    value === 'rejected' ||
    value === 'retired' ||
    value === 'past_only' ||
    value === 'contradicted' ||
    value === 'invalidated' ||
    value === 'author_only' ||
    value === 'character_known' ||
    value === 'character_unknown'
  ) {
    return value;
  }
  return undefined;
}

function actionToStatus(action: string): FactStatus {
  switch (action) {
    case 'approve':
      return 'canon';
    case 'reject':
      return 'rejected';
    case 'retire':
      return 'retired';
    case 'past_only':
      return 'past_only';
    case 'author_only':
      return 'author_only';
    case 'assign_knowledge':
      return 'character_known';
    case 'change_scope':
    case 'merge':
    case 'split':
    case 'escalate_conflict':
    default:
      return 'candidate';
  }
}

function isProvider(value: unknown): value is 'anthropic' | 'google' | 'openai' {
  return value === 'anthropic' || value === 'google' || value === 'openai';
}

function isProviderKey(provider: 'anthropic' | 'google' | 'openai', key: string): boolean {
  if (provider === 'anthropic') {
    return key.startsWith('sk-ant-') && key.length >= 14;
  }
  if (provider === 'openai') {
    return key.startsWith('sk-') && key.length >= 12;
  }
  return key.length >= 12;
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

function statusPriority(status: FactStatus): number {
  return status === 'candidate' ? 0 : 1;
}

function csv(params: URLSearchParams, key: string): string[] {
  return params.getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
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

function matchesTimeState(validAt: string, invalidAt: string | null, queryDay: number | undefined): boolean {
  if (queryDay === undefined) {
    return true;
  }
  const validDay = parseDay(validAt) ?? Number.NEGATIVE_INFINITY;
  const invalidDay = invalidAt ? parseDay(invalidAt) : undefined;
  return validDay <= queryDay && (invalidDay === undefined || queryDay < invalidDay);
}

function matchesCharacterId(eventCharacterId: string, requestedCharacterId: string): boolean {
  const requestedTail = requestedCharacterId.split('.').pop() ?? requestedCharacterId;
  return eventCharacterId === requestedCharacterId || eventCharacterId === requestedTail;
}

function parseDayRange(value: string | null): { start: number; end: number } | null {
  if (!value) {
    return null;
  }
  const days = value.match(/D?\d+/gi)?.map((part) => parseDay(part)).filter((day): day is number => day !== undefined);
  if (!days || days.length < 2) {
    return null;
  }
  return { start: Math.min(days[0], days[1]), end: Math.max(days[0], days[1]) };
}

function parseDay(value: string | null | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const match = value.match(/\bD?(\d{1,3})\b/i);
  if (!match) {
    return undefined;
  }
  const day = Number(match[1]);
  return Number.isFinite(day) ? day : undefined;
}

function relationshipIntensity(item: JsonRecord): number {
  const dimensions = asRecord(item.current_state_w4 ?? item.current_state);
  const values = Object.values(dimensions)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) {
    return 0.5;
  }
  return Math.max(-1, Math.min(1, values.reduce((sum, value) => sum + value, 0) / values.length));
}

function confidenceFrom(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value === 'high') return 0.9;
  if (value === 'medium') return 0.7;
  if (value === 'low') return 0.45;
  return 0.75;
}

function readString(object: JsonRecord, key: string): string | undefined {
  const value = object[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(object: JsonRecord, key: string): number | undefined {
  const value = object[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readStringArray(object: JsonRecord, key: string): string[] {
  const value = object[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function readStringArrayOrFallback(object: JsonRecord, key: string, fallback: string[]): string[] {
  const items = readStringArray(object, key);
  if (items.length > 0) {
    return items;
  }
  const value = object[key];
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return fallback;
}

function fieldTextArray(object: JsonRecord): string[] {
  return Object.values(object)
    .flatMap((value) => {
      if (typeof value === 'string') return [value];
      if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
      return [];
    })
    .filter((item) => item.trim().length > 0);
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringify(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  return canonicalJson(value);
}

function compactText(parts: Array<string | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join('\n');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function nowIso(offsetSeconds = 0): string {
  return new Date(Date.now() - offsetSeconds * 1000).toISOString();
}
