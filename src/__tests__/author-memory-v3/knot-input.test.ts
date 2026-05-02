import { describe, expect, it } from 'vitest';

import {
  knotEvalSeedToAuthorEvalCases,
  knotInputBundleToAuthorEvalJobPayload,
  knotInputBundleToAuthorRecords,
} from '@/lib/author/memory-v3';

const bundle = {
  characterRegistry: {
    characters: [
      {
        id: 'knot.short1.char.sori',
        name: 'Sori',
        story_role: 'protagonist',
        current_status: 'Transfer student',
        review_status: 'candidate',
        scope: ['short1'],
        tags: ['scope:short1'],
        source_provenance: {
          primary: 'worldbuilding/short1-characters.md',
        },
      },
    ],
  },
  worldRuleRegistry: {
    rules: [
      {
        id: 'knot.world.school.cheonghak',
        category: 'school',
        scope: 'short1',
        name: 'Cheonghak High',
        description: 'Short1 school setting.',
        status: 'canon',
        source: 'worldbuilding/school-life.md',
        tags: ['scope:short1'],
      },
    ],
  },
  relationshipMatrix: {
    relationships: [
      {
        id: 'knot.short1.rel.sori-nari',
        from: 'knot.short1.char.sori',
        to: 'knot.short1.char.nari',
        relationship_type: 'roommate',
        current_state: {
          trust: 'moderate',
        },
        valid_at: 'D1',
      },
    ],
  },
  timelineEventLedger: {
    events: [
      {
        id: 'knot.short1.event.d1-arrival',
        day: 'D1',
        date: '2/20',
        who: ['sori', 'nari'],
        what: 'Sori arrives and meets Nari.',
        tags: ['scope:short1'],
      },
    ],
  },
  evalSeed: {
    cases: [
      {
        case_id: 'knot.eval.001',
        category: 'author_only_leak',
        question: 'Does Sori know the author-only power name at D8?',
        expected_answer: 'No',
        expected_anti_pattern: 'The secret power name is revealed.',
        scoring: 'exact_match',
        tags: ['forbidden_leak'],
      },
    ],
  },
};

describe('KNOT input adapter', () => {
  it('maps KNOT registries to Author Memory v3 records', () => {
    const records = knotInputBundleToAuthorRecords(bundle);

    expect(records.map((record) => record.kind).sort()).toEqual([
      'event',
      'person',
      'relationship',
      'world_rule',
    ]);
    expect(records.find((record) => record.id === 'knot.short1.char.sori')).toMatchObject({
      kind: 'person',
      status: 'candidate',
      entityIds: ['knot.short1.char.sori'],
      source: {
        sourceId: 'worldbuilding/short1-characters.md',
      },
    });
    expect(records.find((record) => record.id === 'knot.world.school.cheonghak')).toMatchObject({
      kind: 'world_rule',
      status: 'canon',
    });
  });

  it('maps KNOT eval seed cases to Author eval cases', () => {
    const cases = knotEvalSeedToAuthorEvalCases(bundle.evalSeed);

    expect(cases).toEqual([
      expect.objectContaining({
        id: 'knot.eval.001',
        kind: 'invalidated_fact_exclusion',
        prompt: 'Does Sori know the author-only power name at D8?',
        expected: {
          mustInclude: ['No'],
          mustExclude: ['The secret power name is revealed.'],
        },
        tags: ['forbidden_leak', 'category:author_only_leak'],
      }),
    ]);
  });

  it('builds a replay-ready Author eval payload from KNOT input', () => {
    const payload = knotInputBundleToAuthorEvalJobPayload({
      projectId: 'knot',
      runId: 'knot-seed-run',
      bundle,
    });

    expect(payload).toMatchObject({
      projectId: 'knot',
      runId: 'knot-seed-run',
      mode: 'replay',
    });
    expect(payload.records).toHaveLength(4);
    expect(payload.cases).toHaveLength(1);
    expect(payload.cases[0].request).toMatchObject({
      kind: 'llm',
      provider: 'author-memory-v3',
      operation: 'answer-knot-author-eval-case',
    });
  });
});
