import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasServerSupabaseServiceRoleConfig } from '@/lib/supabase';
import { InMemoryAuthorUiStore } from '@/lib/author/ui/in-memory-store';
import { SupabaseAuthorUiStore } from '@/lib/author/ui/supabase-store';
import { seedAuthorUiProject, type AuthorUiSeedRows } from '@/lib/author/ui/seed-project';
import {
  AuthorUiStoreConfigError,
  createAuthorUiStoreForUser,
  type AuthorUiStore,
} from '@/lib/author/ui/store';
import type {
  AuthorCandidateRow,
  AuthorCharacterRow,
  AuthorConflictRow,
  AuthorImportRow,
  AuthorSimulationRow,
} from '@/lib/author/ui/store-types';

describe('SupabaseAuthorUiStore', () => {
  afterEach(() => {
    delete process.env.AUTHOR_UI_STORE;
  });

  it('writes import rows to author_imports', async () => {
    const { client, fromSpy, builder } = createClient();
    const store = new SupabaseAuthorUiStore({ userId: 'user-1', client });

    await store.insertImport(sampleImportRow());

    expect(fromSpy).toHaveBeenCalledWith('author_imports');
    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      project_id: 'knot',
      file_name: 'sori.md',
    }));
  });

  it('writes candidate rows to author_candidates with sanitized JSON shape', async () => {
    const { client, fromSpy, builder } = createClient();
    const store = new SupabaseAuthorUiStore({ userId: 'user-1', client });

    await store.insertCandidates([sampleCandidateRow()]);

    expect(fromSpy).toHaveBeenCalledWith('author_candidates');
    expect(builder.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        user_id: 'user-1',
        project_id: 'knot',
        kind: 'fact',
        source: expect.objectContaining({ document_id: 'doc-1' }),
      }),
    ]);
  });

  it('upserts character rows on user/project/character key', async () => {
    const { client, fromSpy, builder } = createClient();
    const store = new SupabaseAuthorUiStore({ userId: 'user-1', client });

    await store.upsertCharacter(sampleCharacterRow());

    expect(fromSpy).toHaveBeenCalledWith('author_characters');
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ character_key: 'knot.short1.char.sori', name: 'Sori' }),
      { onConflict: 'user_id,project_id,character_key' }
    );
  });

  it('persists Storr arc fields on the character row', async () => {
    const { client, builder } = createClient();
    const store = new SupabaseAuthorUiStore({ userId: 'user-1', client });

    await store.upsertCharacter({
      ...sampleCharacterRow(),
      sacred_flaw: 'I must prove my worth.',
      internal_need: 'Intrinsic self-acceptance.',
      external_want: 'Win the contest.',
      philosophical_purpose: 'Worth is intrinsic.',
      arc_direction: 'positive',
    });

    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        sacred_flaw: 'I must prove my worth.',
        internal_need: 'Intrinsic self-acceptance.',
        external_want: 'Win the contest.',
        philosophical_purpose: 'Worth is intrinsic.',
        arc_direction: 'positive',
      }),
      { onConflict: 'user_id,project_id,character_key' }
    );
  });

  it('resolves conflict rows through an owner-scoped update', async () => {
    const { client, fromSpy, builder } = createClient();
    const store = new SupabaseAuthorUiStore({ userId: 'user-1', client });

    await store.resolveConflict('user-1', 'knot', 'conflict-1', { decision: 'accept' });

    expect(fromSpy).toHaveBeenCalledWith('author_conflicts');
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'resolved',
      resolution: { decision: 'accept' },
    }));
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(builder.eq).toHaveBeenCalledWith('project_id', 'knot');
    expect(builder.eq).toHaveBeenCalledWith('conflict_key', 'conflict-1');
  });

  it('upserts simulation rows on user/project/simulation key', async () => {
    const { client, fromSpy, builder } = createClient();
    const store = new SupabaseAuthorUiStore({ userId: 'user-1', client });

    await store.upsertSimulation(sampleSimulationRow());

    expect(fromSpy).toHaveBeenCalledWith('author_simulations');
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ simulation_key: 'sim-1', status: 'complete' }),
      { onConflict: 'user_id,project_id,simulation_key' }
    );
  });

  it('throws descriptive errors returned by Supabase', async () => {
    const { client } = createClient({ error: { message: 'permission denied' } });
    const store = new SupabaseAuthorUiStore({ userId: 'user-1', client });

    await expect(store.insertImport(sampleImportRow()))
      .rejects
      .toThrow('Failed to insert author_imports: permission denied');
  });

  it('seeds an empty default project through the store helper', async () => {
    const calls: string[] = [];
    const seedRows: AuthorUiSeedRows = {
      imports: [sampleImportRow()],
      candidates: [sampleCandidateRow()],
      characters: [sampleCharacterRow()],
      conflicts: [sampleConflictRow()],
      simulations: [sampleSimulationRow()],
    };
    const store = {
      countAll: vi.fn(async () => ({ imports: 0, candidates: 0, characters: 0, conflicts: 0, simulations: 0 })),
      insertImport: vi.fn(async () => calls.push('import')),
      insertCandidates: vi.fn(async () => calls.push('candidates')),
      upsertCharacter: vi.fn(async () => calls.push('character')),
      upsertConflict: vi.fn(async () => calls.push('conflict')),
      upsertSimulation: vi.fn(async () => calls.push('simulation')),
    } as Partial<AuthorUiStore> as AuthorUiStore;

    await seedAuthorUiProject(store, 'user-1', 'knot', seedRows);

    expect(calls).toEqual(['import', 'candidates', 'character', 'conflict', 'simulation']);
  });

  it('creates memory stores when AUTHOR_UI_STORE is unset or memory', () => {
    delete process.env.AUTHOR_UI_STORE;
    expect(createAuthorUiStoreForUser({ userId: 'user-1' })).toBeInstanceOf(InMemoryAuthorUiStore);

    process.env.AUTHOR_UI_STORE = 'memory';
    expect(createAuthorUiStoreForUser({ userId: 'user-1' })).toBeInstanceOf(InMemoryAuthorUiStore);
  });

  it('creates supabase stores when AUTHOR_UI_STORE=supabase and config is present', () => {
    process.env.AUTHOR_UI_STORE = 'supabase';
    vi.mocked(hasServerSupabaseServiceRoleConfig).mockReturnValue(true);

    expect(createAuthorUiStoreForUser({ userId: 'user-1' })).toBeInstanceOf(SupabaseAuthorUiStore);
  });

  it('fails supabase store dispatch when service-role config is missing', () => {
    process.env.AUTHOR_UI_STORE = 'supabase';
    vi.mocked(hasServerSupabaseServiceRoleConfig).mockReturnValue(false);

    expect(() => createAuthorUiStoreForUser({ userId: 'user-1' }))
      .toThrow(AuthorUiStoreConfigError);
  });
});

function createClient(options: { error?: { message: string } | null } = {}) {
  const response = { data: [], count: 0, error: options.error ?? null };
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(async () => response),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    upsert: vi.fn(async () => response),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    order: vi.fn(async () => response),
    maybeSingle: vi.fn(async () => ({ data: null, error: options.error ?? null })),
    then: vi.fn((resolve: (value: typeof response) => unknown) => Promise.resolve(resolve(response))),
  };
  const fromSpy = vi.fn(() => builder);
  return {
    builder,
    fromSpy,
    client: {
      from: fromSpy,
      rpc: vi.fn(),
    },
  };
}

function sampleImportRow(): AuthorImportRow {
  return {
    id: 'import-1',
    user_id: 'user-1',
    project_id: 'knot',
    file_name: 'sori.md',
    file_size: 12,
    file_type: 'md',
    source_role: 'canon',
    a_or_d_mode: 'extract',
    parse_status: 'parsed',
    parse_progress: 100,
    extract_status: 'extracted',
    extract_progress: 100,
    candidate_count: 1,
    error_message: null,
    storage_key: null,
    parsed_text_preview: 'preview',
    parser_version: 'author-parser-md-v1',
    upload_at: '2026-05-03T00:00:00.000Z',
    created_at: '2026-05-03T00:00:00.000Z',
    updated_at: '2026-05-03T00:00:00.000Z',
  };
}

function sampleCandidateRow(): AuthorCandidateRow {
  return {
    id: 'candidate-1',
    user_id: 'user-1',
    project_id: 'knot',
    content: 'Candidate content',
    kind: 'fact',
    status: 'candidate',
    suggested_status: 'candidate',
    confidence: 0.9,
    tags: ['short1'],
    source: {
      document_id: 'doc-1',
      file_path: 'sori.md',
      span: { start_line: 1, end_line: 1, start_char: 0, end_char: 10 },
      excerpt: 'Candidate content',
    },
    related_existing: [],
    target_entity_id: null,
    decision_id: null,
    promoted_entity_id: null,
    extracted_at: '2026-05-03T00:00:00.000Z',
    decided_at: null,
    created_at: '2026-05-03T00:00:00.000Z',
    updated_at: '2026-05-03T00:00:00.000Z',
  };
}

function sampleCharacterRow(): AuthorCharacterRow {
  return {
    id: 'character-row-1',
    user_id: 'user-1',
    project_id: 'knot',
    character_key: 'knot.short1.char.sori',
    name: 'Sori',
    aliases: [],
    scope: ['short1'],
    summary: 'Lead character',
    archetype: 'witness',
    voice: {},
    persona: {},
    appearance: {},
    background: {},
    knowledge_state: {},
    relationships: [],
    recent_important_memories: [],
    voice_samples: [],
    current_arc_phase: 'active',
    sacred_flaw: null,
    internal_need: null,
    external_want: null,
    philosophical_purpose: null,
    arc_direction: null,
    created_at: '2026-05-03T00:00:00.000Z',
    updated_at: '2026-05-03T00:00:00.000Z',
  };
}

function sampleConflictRow(): AuthorConflictRow {
  return {
    id: 'conflict-row-1',
    user_id: 'user-1',
    project_id: 'knot',
    conflict_key: 'conflict-1',
    severity: 'high',
    status: 'open',
    payload: { summary: 'Conflict' },
    resolution: null,
    resolved_at: null,
    created_at: '2026-05-03T00:00:00.000Z',
    updated_at: '2026-05-03T00:00:00.000Z',
  };
}

function sampleSimulationRow(): AuthorSimulationRow {
  return {
    id: 'simulation-row-1',
    user_id: 'user-1',
    project_id: 'knot',
    simulation_key: 'sim-1',
    status: 'complete',
    progress: 100,
    input: { echo: {} },
    context_used: {},
    candidates: [],
    trace_metadata: {},
    diagnostics: {},
    llm_meta: null,
    started_at: '2026-05-03T00:00:00.000Z',
    completed_at: '2026-05-03T00:00:01.000Z',
    created_at: '2026-05-03T00:00:00.000Z',
    updated_at: '2026-05-03T00:00:00.000Z',
  };
}
