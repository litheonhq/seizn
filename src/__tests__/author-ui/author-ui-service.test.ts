import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServerClient } from '@/lib/supabase';
import { resetAuthorUiServiceForTests } from '@/lib/author/ui/service';

vi.mock('@/lib/author/billing/feature-gate', () => ({
  checkFeatureGate: vi.fn(async () => ({ allowed: true, remaining: null, cap: null })),
  recordFeatureUsage: vi.fn(),
}));

describe('Author UI service', () => {
  afterEach(() => {
    delete process.env.AUTHOR_IMPORT_DISABLE_R2;
    delete process.env.AUTHOR_AUDIT_LOG_STORE;
  });

  it('seeds the Author UI surface from KNOT input artifacts', async () => {
    const service = resetAuthorUiServiceForTests();
    const projects = service.listProjects();
    const projectId = projects.projects[0].id;

    expect(projectId).toBe('knot');
    expect(projects.projects[0]).toMatchObject({
      name: 'Seizn Author Memory',
      phase: 'Phase 1',
    });

    expect((await service.listImports(projectId)).summary.total).toBeGreaterThan(0);
    expect((await service.listCandidates(projectId, new URLSearchParams())).total).toBeGreaterThan(100);
    expect((await service.listCharacters(projectId)).characters).toHaveLength(15);
    expect(service.getGraph(projectId, new URLSearchParams()).edges.length).toBeGreaterThan(10);
    expect(service.getTimeline(projectId, new URLSearchParams()).events).toHaveLength(35);
    expect((await service.listConflicts(projectId, new URLSearchParams('status=open'))).conflicts.length)
      .toBeGreaterThan(0);
  });

  it('updates review state and creates review candidates for sensitive character edits', async () => {
    const service = resetAuthorUiServiceForTests('review-user');
    const projectId = service.listProjects().projects[0].id;
    const candidate = (await service.listCandidates(projectId, new URLSearchParams('status=candidate')))
      .candidates[0];

    const decision = await service.decideCandidate(projectId, candidate.id, { action: 'approve' });
    expect(decision).toMatchObject({
      candidate_id: candidate.id,
      new_status: 'canon',
    });

    const character = (await service.listCharacters(projectId)).characters[0];
    const patch = await service.updateCharacter(projectId, character.id, {
      field: 'knowledge_state.known_facts',
      value: [],
    });
    expect(patch.review_required).toBe(true);
    expect(patch.candidate_id).toMatch(/^candidate-/);
  });

  it('blocks unsafe field paths and does not mutate object prototypes', async () => {
    const service = resetAuthorUiServiceForTests('field-path-user');
    const projectId = service.listProjects().projects[0].id;
    const character = (await service.listCharacters(projectId)).characters[0];

    try {
      await expect(
        service.updateCharacter(projectId, character.id, {
          field: '__proto__.polluted',
          value: 'yes',
        })
      ).rejects.toThrow('field path is not allowed');
      expect(() =>
        service.updateSettings(projectId, {
          field: 'constructor.prototype.polluted',
          value: 'yes',
        })
      ).toThrow('field path is not allowed');
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    } finally {
      delete (Object.prototype as Record<string, unknown>).polluted;
    }
  });

  it('returns not found instead of auto-creating arbitrary projects', async () => {
    const service = resetAuthorUiServiceForTests('project-guard-user');

    await expect(service.listImports('missing-project')).rejects.toThrow('Project not found: missing-project');
    expect(service.listProjects().projects.map((project) => project.id)).not.toContain('missing-project');
  });

  it('applies candidate, graph, and timeline contract filters', async () => {
    const service = resetAuthorUiServiceForTests('filter-user');
    const projectId = service.listProjects().projects[0].id;

    const scoped = await service.listCandidates(projectId, new URLSearchParams('scope=short1&page_size=100'));
    expect(scoped.total).toBeGreaterThan(0);
    expect(scoped.candidates.every((candidate) => candidate.tags.includes('short1'))).toBe(true);

    const sourceFiltered = await service.listCandidates(
      projectId,
      new URLSearchParams('source_id=character_registry.json&page_size=100')
    );
    expect(sourceFiltered.total).toBeGreaterThan(0);
    expect(sourceFiltered.candidates.every((candidate) =>
      candidate.source.file_path.endsWith('character_registry.json')
    )).toBe(true);

    const created = await service.createCandidate(projectId, {
      content: 'Tier filter candidate',
      type: 'fact',
      tags: ['tier:2', 'short1'],
    });
    const tierFiltered = await service.listCandidates(projectId, new URLSearchParams('tier=2&page_size=100'));
    expect(tierFiltered.candidates.map((candidate) => candidate.id)).toContain(created.candidate_id);

    const graph = service.getGraph(projectId, new URLSearchParams('scope=short1&type=person&time_state=D1'));
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.nodes.every((node) => node.type === 'person')).toBe(true);
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    expect(graph.edges.every((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))).toBe(true);

    const timeline = service.getTimeline(projectId, new URLSearchParams('day_range=[D1,D3]'));
    expect(timeline.events.length).toBeGreaterThan(0);
    expect(timeline.events.every((event) => ['D1', 'D2', 'D3'].includes(event.day))).toBe(true);

    const characterId = (await service.listCharacters(projectId)).characters[0].id;
    const characterTimeline = service.getTimeline(projectId, new URLSearchParams(`character_ids=${characterId}`));
    const characterTail = characterId.split('.').pop() ?? characterId;
    expect(characterTimeline.events.length).toBeGreaterThan(0);
    expect(characterTimeline.events.every((event) =>
      event.who.includes(characterId) || event.who.includes(characterTail)
    )).toBe(true);
  });

  it('runs deterministic scene simulations and promotes simulation candidates', async () => {
    const service = resetAuthorUiServiceForTests('simulation-user');
    const projectId = service.listProjects().projects[0].id;
    const character = (await service.listCharacters(projectId)).characters[0];

    const run = await service.runSimulation(projectId, {
      scene_input: {
        text: 'A scene pressure check.',
        setting: { location: 'club room', time: 'D29' },
        characters_present: [character.id],
        timepoint: { day: 29, scene_position: 'middle' },
        pressure: 'avoid author-only leakage',
        perspective: character.id,
        candidate_count: 3,
      },
    });

    expect(run.status).toBe('running');
    const simulation = await service.getSimulation(projectId, run.simulation_id);
    expect(simulation.status).toBe('complete');
    expect(simulation.candidates).toHaveLength(3);
    expect(simulation.trace_metadata.deterministic).toBe(true);

    const replay = await service.replaySimulation(projectId, run.simulation_id);
    expect(replay.replay_status).toBe('deterministic');

    const promoted = await service.createCandidate(projectId, {
      from_simulation_id: run.simulation_id,
      from_simulation_candidate_index: 0,
      type: 'fact',
      suggested_status: 'candidate',
      tags: ['simulation_promote'],
    });
    expect(promoted.candidate_id).toMatch(/^candidate-/);
  });

  it('generates character backlog candidates into the review queue', async () => {
    const service = resetAuthorUiServiceForTests('backlog-user');
    const projectId = service.listProjects().projects[0].id;
    const character = (await service.listCharacters(projectId)).characters
      .find((item) => item.id === 'knot.short1.char.sori');

    const result = await service.generateCharacterBacklog(projectId, character?.id ?? '', {
      items_per_category: 5,
    });

    expect(result.character_id).toBe('knot.short1.char.sori');
    expect(result.candidate_ids).toHaveLength(20);
    expect(result.conflicts_detected).toBe(0);
    expect(result.export_markdown).toContain('§X.6 backlog candidates');

    const backlogCandidates = (await service
      .listCandidates(projectId, new URLSearchParams('source_id=backlog.knot.short1.char.sori&page_size=25')))
      .candidates;
    expect(backlogCandidates).toHaveLength(20);
    expect(backlogCandidates.every((candidate) => candidate.tags.includes('backlog'))).toBe(true);
    expect(backlogCandidates.every((candidate) => candidate.target_entity_id === 'knot.short1.char.sori')).toBe(true);
  });

  it('records mutation audit logs and replays deterministic decisions without raw secrets', async () => {
    const service = resetAuthorUiServiceForTests('audit-user');
    const projectId = service.listProjects().projects[0].id;
    const character = (await service.listCharacters(projectId)).characters[0];
    const run = await service.runSimulation(projectId, {
      scene_input: {
        text: 'Audit replay scene.',
        perspective: character.id,
        candidate_count: 2,
      },
    });
    await service.generateCharacterBacklog(projectId, character.id, { items_per_category: 5 });

    expect(() => service.saveByok({
      provider: 'anthropic',
      api_key: 'raw-secret-test',
    })).toThrow('invalid provider api key');

    const audit = await service.listAuditLogs(projectId, new URLSearchParams('limit=50'));
    const eventTypes = audit.audit_logs.map((entry) => entry.event_type);

    expect(eventTypes).toEqual(expect.arrayContaining([
      'simulation.run',
      'backlog.generated',
      'candidate.added',
      'byok.updated',
    ]));
    expect(JSON.stringify(audit)).not.toContain('raw-secret-test');

    const replay = await service.replayAuditDecision(projectId, run.decision_id);
    expect(replay.replayStatus).toBe('deterministic');
    expect(replay.chainLength).toBeGreaterThanOrEqual(1);
    expect(String(replay.payloadHash)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('validates and masks BYOK keys without returning raw secret material', () => {
    const service = resetAuthorUiServiceForTests('byok-user');

    expect(() => service.saveByok({
      provider: 'anthropic',
      api_key: 'not-a-key',
    })).toThrow('invalid provider api key');

    const saved = service.saveByok({
      provider: 'anthropic',
      api_key: 'sk-ant-short-1',
    });

    expect(saved).toEqual({ valid: true, key_last_4: 'rt-1' });
    expect(service.getByok()).toMatchObject({
      enabled: true,
      provider: 'anthropic',
      key_last_4: 'rt-1',
      status: 'active',
    });
    expect(JSON.stringify(service.getByok())).not.toContain('sk-ant-short');
  });

  it('persists upload bytes through the parser pipeline before extraction', async () => {
    process.env.AUTHOR_IMPORT_DISABLE_R2 = '1';
    const service = resetAuthorUiServiceForTests('import-user');
    const projectId = service.listProjects().projects[0].id;

    const result = await service.uploadImport(projectId, {
      fileName: 'sori.md',
      fileType: 'text/markdown',
      fileBytes: Buffer.from('---\ntitle: Sori\n---\n# Sori\n\nParsed canon body', 'utf8'),
      sourceRole: 'canon',
    });

    const uploaded = (await service.listImports(projectId)).imports.find((item) => item.id === result.import_id);
    expect(uploaded).toMatchObject({
      parse_status: 'parsed',
      extract_status: 'extracted',
      candidate_count: 1,
      storage_key: `knot/${result.import_id}/sori.md`,
      parser_version: 'author-parser-md-v1',
    });
    expect(uploaded?.parsed_text_preview).toContain('Parsed canon body');

    const candidates = await service.listCandidates(projectId, new URLSearchParams(`source_id=${result.import_id}`));
    expect(candidates.total).toBe(1);
    expect(candidates.candidates[0]).toMatchObject({
      type: 'world_rule',
      source: {
        document_id: result.import_id,
        file_path: 'sori.md',
      },
      tags: expect.arrayContaining(['short1', 'tier:1']),
    });
  });

  it('records unsupported upload formats as failed imports', async () => {
    process.env.AUTHOR_IMPORT_DISABLE_R2 = '1';
    const service = resetAuthorUiServiceForTests('unsupported-import-user');
    const projectId = service.listProjects().projects[0].id;

    const result = await service.uploadImport(projectId, {
      fileName: 'draft.hwp',
      fileType: 'application/octet-stream',
      fileBytes: Buffer.from('hwp'),
    });

    const uploaded = (await service.listImports(projectId)).imports.find((item) => item.id === result.import_id);
    expect(uploaded).toMatchObject({
      parse_status: 'failed',
      extract_status: 'failed',
      error_message: 'unsupported_format',
    });
  });

  it('wires Author UI audit logs to the configured Supabase store', async () => {
    process.env.AUTHOR_AUDIT_LOG_STORE = 'supabase';
    const rows: Array<Record<string, unknown>> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {};
    Object.assign(builder, {
      insert: vi.fn(async (row: Record<string, unknown>) => {
        rows.push(row);
        return { error: null };
      }),
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(async () => ({ data: rows, error: null })),
      maybeSingle: vi.fn(async () => ({ data: rows[0] ?? null, error: null })),
    });
    vi.mocked(createServerClient).mockReturnValue({
      from: vi.fn(() => builder),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const service = resetAuthorUiServiceForTests('persistent-audit-user');
    const projectId = service.listProjects().projects[0].id;
    const run = await service.runSimulation(projectId, {
      scene_input: {
        text: 'Persistent audit scene.',
        candidate_count: 1,
      },
    });

    await service.flushAuditWrites();
    const audit = await service.listAuditLogs(projectId, new URLSearchParams('event_type=simulation.run&limit=10'));

    expect(rows.some((row) => row.event_type === 'simulation.run')).toBe(true);
    expect(audit.audit_logs.some((entry) => entry.decision_id === run.decision_id)).toBe(true);
  });

  it('analyzeCoach refuses to run when AUTHOR_COACH_ENABLED is "0"', async () => {
    const service = resetAuthorUiServiceForTests('coach-kill-switch-user');
    const projectId = service.listProjects().projects[0].id;

    process.env.AUTHOR_COACH_ENABLED = '0';
    await expect(service.analyzeCoach(projectId, { text: 'sample' })).rejects.toThrowError(
      /temporarily disabled/i,
    );
    delete process.env.AUTHOR_COACH_ENABLED;
  });

  it('analyzeCoach kill switch throws AuthorUiServiceUnavailableError (maps to 503 + Retry-After)', async () => {
    const { AuthorUiServiceUnavailableError } = await import('@/lib/author/ui/service');
    const service = resetAuthorUiServiceForTests('coach-kill-switch-503-user');
    const projectId = service.listProjects().projects[0].id;

    process.env.AUTHOR_COACH_ENABLED = 'false';
    try {
      await service.analyzeCoach(projectId, { text: 'sample' });
      throw new Error('expected kill switch to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthorUiServiceUnavailableError);
      expect((err as InstanceType<typeof AuthorUiServiceUnavailableError>).retryAfterSeconds).toBe(3600);
    }
    delete process.env.AUTHOR_COACH_ENABLED;
  });

  it('listAuditLogs supports keyset cursor pagination across two pages', async () => {
    const service = resetAuthorUiServiceForTests('cursor-pagination-user');
    const projectId = service.listProjects().projects[0].id;

    // Generate several audit-log entries by running multiple simulations.
    // Each simulation.run write produces an audit entry under the same project.
    for (let i = 0; i < 4; i += 1) {
      await service.runSimulation(projectId, {
        scene_input: { text: `scene ${i}`, candidate_count: 1 },
      });
    }
    await service.flushAuditWrites();

    const firstPage = await service.listAuditLogs(
      projectId,
      new URLSearchParams('event_type=simulation.run&limit=2&cursor='),
    );
    expect(firstPage.audit_logs).toHaveLength(2);
    expect(firstPage.next_cursor).toBeTypeOf('string');

    const secondPage = await service.listAuditLogs(
      projectId,
      new URLSearchParams(`event_type=simulation.run&limit=2&cursor=${firstPage.next_cursor}`),
    );
    expect(secondPage.audit_logs).toHaveLength(2);

    // No row should appear in both pages.
    const firstIds = new Set(firstPage.audit_logs.map((entry) => entry.id));
    for (const entry of secondPage.audit_logs) {
      expect(firstIds.has(entry.id)).toBe(false);
    }
  });

  it('listAuditLogs accepts coach.analysis as an event-type filter', async () => {
    const service = resetAuthorUiServiceForTests('coach-event-filter-user');
    const projectId = service.listProjects().projects[0].id;

    const result = await service.listAuditLogs(
      projectId,
      new URLSearchParams('event_type=coach.analysis&limit=10'),
    );
    expect(result.audit_logs).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('analyzeCoach blocks Free-tier users via the charter-only feature gate', async () => {
    const { checkFeatureGate } = await import('@/lib/author/billing/feature-gate');
    const gateMock = checkFeatureGate as unknown as ReturnType<typeof vi.fn>;
    gateMock.mockImplementationOnce(async () => ({
      allowed: false,
      remaining: 0,
      cap: 0,
      reason: 'feature_charter_only',
    }));

    const service = resetAuthorUiServiceForTests('coach-free-user');
    const projectId = service.listProjects().projects[0].id;

    await expect(service.analyzeCoach(projectId, { text: 'sample' })).rejects.toThrowError(
      /available on Indie plans/i,
    );
    gateMock.mockReset();
    gateMock.mockImplementation(async () => ({ allowed: true, remaining: null, cap: null }));
  });
});
