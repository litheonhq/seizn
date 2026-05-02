import { afterEach, describe, expect, it } from 'vitest';
import { resetAuthorUiServiceForTests } from '@/lib/author/ui/service';

describe('Author UI service', () => {
  afterEach(() => {
    delete process.env.AUTHOR_IMPORT_DISABLE_R2;
  });

  it('seeds the Author UI surface from KNOT input artifacts', () => {
    const service = resetAuthorUiServiceForTests();
    const projects = service.listProjects();
    const projectId = projects.projects[0].id;

    expect(projectId).toBe('knot');
    expect(projects.projects[0]).toMatchObject({
      name: 'KNOT Author Memory',
      phase: 'Phase 1',
    });

    expect(service.listImports(projectId).summary.total).toBeGreaterThan(0);
    expect(service.listCandidates(projectId, new URLSearchParams()).total).toBeGreaterThan(100);
    expect(service.listCharacters(projectId).characters).toHaveLength(15);
    expect(service.getGraph(projectId, new URLSearchParams()).edges.length).toBeGreaterThan(10);
    expect(service.getTimeline(projectId, new URLSearchParams()).events).toHaveLength(35);
    expect(service.listConflicts(projectId, new URLSearchParams('status=open')).conflicts.length)
      .toBeGreaterThan(0);
  });

  it('updates review state and creates review candidates for sensitive character edits', () => {
    const service = resetAuthorUiServiceForTests('review-user');
    const projectId = service.listProjects().projects[0].id;
    const candidate = service.listCandidates(projectId, new URLSearchParams('status=candidate'))
      .candidates[0];

    const decision = service.decideCandidate(projectId, candidate.id, { action: 'approve' });
    expect(decision).toMatchObject({
      candidate_id: candidate.id,
      new_status: 'canon',
    });

    const character = service.listCharacters(projectId).characters[0];
    const patch = service.updateCharacter(projectId, character.id, {
      field: 'knowledge_state.known_facts',
      value: [],
    });
    expect(patch.review_required).toBe(true);
    expect(patch.candidate_id).toMatch(/^candidate-/);
  });

  it('blocks unsafe field paths and does not mutate object prototypes', () => {
    const service = resetAuthorUiServiceForTests('field-path-user');
    const projectId = service.listProjects().projects[0].id;
    const character = service.listCharacters(projectId).characters[0];

    try {
      expect(() =>
        service.updateCharacter(projectId, character.id, {
          field: '__proto__.polluted',
          value: 'yes',
        })
      ).toThrow('field path is not allowed');
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

  it('returns not found instead of auto-creating arbitrary projects', () => {
    const service = resetAuthorUiServiceForTests('project-guard-user');

    expect(() => service.listImports('missing-project')).toThrow('Project not found: missing-project');
    expect(service.listProjects().projects.map((project) => project.id)).not.toContain('missing-project');
  });

  it('applies candidate, graph, and timeline contract filters', () => {
    const service = resetAuthorUiServiceForTests('filter-user');
    const projectId = service.listProjects().projects[0].id;

    const scoped = service.listCandidates(projectId, new URLSearchParams('scope=short1&page_size=100'));
    expect(scoped.total).toBeGreaterThan(0);
    expect(scoped.candidates.every((candidate) => candidate.tags.includes('short1'))).toBe(true);

    const sourceFiltered = service.listCandidates(
      projectId,
      new URLSearchParams('source_id=character_registry.json&page_size=100')
    );
    expect(sourceFiltered.total).toBeGreaterThan(0);
    expect(sourceFiltered.candidates.every((candidate) =>
      candidate.source.file_path.endsWith('character_registry.json')
    )).toBe(true);

    const created = service.createCandidate(projectId, {
      content: 'Tier filter candidate',
      type: 'fact',
      tags: ['tier:2', 'short1'],
    });
    const tierFiltered = service.listCandidates(projectId, new URLSearchParams('tier=2&page_size=100'));
    expect(tierFiltered.candidates.map((candidate) => candidate.id)).toContain(created.candidate_id);

    const graph = service.getGraph(projectId, new URLSearchParams('scope=short1&type=person&time_state=D1'));
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.nodes.every((node) => node.type === 'person')).toBe(true);
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    expect(graph.edges.every((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))).toBe(true);

    const timeline = service.getTimeline(projectId, new URLSearchParams('day_range=[D1,D3]'));
    expect(timeline.events.length).toBeGreaterThan(0);
    expect(timeline.events.every((event) => ['D1', 'D2', 'D3'].includes(event.day))).toBe(true);

    const characterId = service.listCharacters(projectId).characters[0].id;
    const characterTimeline = service.getTimeline(projectId, new URLSearchParams(`character_ids=${characterId}`));
    const characterTail = characterId.split('.').pop() ?? characterId;
    expect(characterTimeline.events.length).toBeGreaterThan(0);
    expect(characterTimeline.events.every((event) =>
      event.who.includes(characterId) || event.who.includes(characterTail)
    )).toBe(true);
  });

  it('runs deterministic scene simulations and promotes simulation candidates', () => {
    const service = resetAuthorUiServiceForTests('simulation-user');
    const projectId = service.listProjects().projects[0].id;
    const character = service.listCharacters(projectId).characters[0];

    const run = service.runSimulation(projectId, {
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
    const simulation = service.getSimulation(projectId, run.simulation_id);
    expect(simulation.status).toBe('complete');
    expect(simulation.candidates).toHaveLength(3);
    expect(simulation.trace_metadata.deterministic).toBe(true);

    const replay = service.replaySimulation(projectId, run.simulation_id);
    expect(replay.replay_status).toBe('deterministic');

    const promoted = service.createCandidate(projectId, {
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
    const character = service.listCharacters(projectId).characters
      .find((item) => item.id === 'knot.short1.char.sori');

    const result = await service.generateCharacterBacklog(projectId, character?.id ?? '', {
      items_per_category: 5,
    });

    expect(result.character_id).toBe('knot.short1.char.sori');
    expect(result.candidate_ids).toHaveLength(20);
    expect(result.conflicts_detected).toBe(0);
    expect(result.export_markdown).toContain('§X.6 backlog candidates');

    const backlogCandidates = service
      .listCandidates(projectId, new URLSearchParams('source_id=backlog.knot.short1.char.sori&page_size=25'))
      .candidates;
    expect(backlogCandidates).toHaveLength(20);
    expect(backlogCandidates.every((candidate) => candidate.tags.includes('backlog'))).toBe(true);
    expect(backlogCandidates.every((candidate) => candidate.target_entity_id === 'knot.short1.char.sori')).toBe(true);
  });

  it('records mutation audit logs and replays deterministic decisions without raw secrets', async () => {
    const service = resetAuthorUiServiceForTests('audit-user');
    const projectId = service.listProjects().projects[0].id;
    const character = service.listCharacters(projectId).characters[0];
    const run = service.runSimulation(projectId, {
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

    const audit = service.listAuditLogs(projectId, new URLSearchParams('limit=50'));
    const eventTypes = audit.audit_logs.map((entry) => entry.event_type);

    expect(eventTypes).toEqual(expect.arrayContaining([
      'simulation.run',
      'backlog.generated',
      'candidate.added',
      'byok.updated',
    ]));
    expect(JSON.stringify(audit)).not.toContain('raw-secret-test');

    const replay = service.replayAuditDecision(projectId, run.decision_id);
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

    const uploaded = service.listImports(projectId).imports.find((item) => item.id === result.import_id);
    expect(uploaded).toMatchObject({
      parse_status: 'parsed',
      extract_status: 'extracted',
      candidate_count: 1,
      storage_key: `knot/${result.import_id}/sori.md`,
      parser_version: 'author-parser-md-v1',
    });
    expect(uploaded?.parsed_text_preview).toContain('Parsed canon body');

    const candidates = service.listCandidates(projectId, new URLSearchParams(`source_id=${result.import_id}`));
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

    const uploaded = service.listImports(projectId).imports.find((item) => item.id === result.import_id);
    expect(uploaded).toMatchObject({
      parse_status: 'failed',
      extract_status: 'failed',
      error_message: 'unsupported_format',
    });
  });
});
