import { describe, expect, it } from 'vitest';
import { resetAuthorUiServiceForTests } from '@/lib/author/ui/service';

describe('Author UI service', () => {
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

  it('validates and masks BYOK keys without returning raw secret material', () => {
    const service = resetAuthorUiServiceForTests('byok-user');

    expect(() => service.saveByok({
      provider: 'anthropic',
      api_key: 'not-a-key',
    })).toThrow('invalid provider api key');

    const saved = service.saveByok({
      provider: 'anthropic',
      api_key: 'sk-ant-test-value-1234',
    });

    expect(saved).toEqual({ valid: true, key_last_4: '1234' });
    expect(service.getByok()).toMatchObject({
      enabled: true,
      provider: 'anthropic',
      key_last_4: '1234',
      status: 'active',
    });
    expect(JSON.stringify(service.getByok())).not.toContain('sk-ant-test-value');
  });
});
