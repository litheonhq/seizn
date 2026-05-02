import { describe, expect, it } from 'vitest';

import {
  InMemoryAuthorMemoryV3Store,
  runAuthorEvalJob,
  type AuthorEvalCase,
  type AuthorMemoryRecord,
  type AuthorSideEffectRequest,
} from '@/lib/author/memory-v3';

const records: AuthorMemoryRecord[] = [
  {
    id: 'fact-current-student',
    kind: 'world_rule',
    status: 'canon',
    content: 'Sori is a student.',
    entityIds: ['sori'],
  },
];

const cases: AuthorEvalCase[] = [
  {
    schemaVersion: 'seizn.knot_author_eval.v1',
    id: 'case-current-role',
    kind: 'invalidated_fact_exclusion',
    prompt: 'What is Sori in current canon?',
    expected: {
      mustInclude: ['student'],
      mustExclude: ['agent'],
    },
  },
  {
    schemaVersion: 'seizn.knot_author_eval.v1',
    id: 'case-persona-tone',
    kind: 'persona_consistency',
    prompt: 'Answer as Sori.',
    expected: {
      mustInclude: ['student'],
    },
  },
];

function requestFor(testCase: AuthorEvalCase): AuthorSideEffectRequest {
  return {
    kind: 'llm',
    provider: 'anthropic',
    model: 'claude-opus-4.7',
    operation: 'answer-author-eval-case',
    input: { prompt: testCase.prompt },
    params: { temperature: 0 },
  };
}

describe('Author Memory v3 eval job runner', () => {
  it('runs cases sequentially and persists job evidence', async () => {
    const store = new InMemoryAuthorMemoryV3Store();
    const seenCaseIds: string[] = [];
    const job = await runAuthorEvalJob({
      projectId: 'knot',
      runId: 'run-knot-1',
      records,
      cases: cases.map((testCase) => ({
        testCase,
        request: requestFor(testCase),
      })),
      store,
      mode: 'record',
      generatedAt: '2026-05-02T00:00:00.000Z',
      capturedAt: '2026-05-02T00:00:00.000Z',
      live: ({ testCase }) => {
        seenCaseIds.push(testCase.id);
        return { text: 'Sori is a student in the current canon.' };
      },
    });

    expect(seenCaseIds).toEqual(['case-current-role', 'case-persona-tone']);
    expect(job.summary).toMatchObject({
      runId: 'run-knot-1',
      projectId: 'knot',
      totalCases: 2,
      passedCases: 2,
      failedCases: 0,
      averageScore: 1,
    });
    expect(job.summary.sideEffectKeys).toHaveLength(2);

    await expect(store.listRecords('knot')).resolves.toEqual(records);
    await expect(store.getSnapshot('knot', job.summary.memorySnapshotHash)).resolves.toMatchObject({
      snapshotHash: job.summary.memorySnapshotHash,
      itemCount: 1,
    });
    await expect(store.listEvalResults('knot', 'run-knot-1')).resolves.toHaveLength(2);
  });

  it('fails closed when no eval cases are provided', async () => {
    await expect(
      runAuthorEvalJob({
        projectId: 'knot',
        records,
        cases: [],
        store: new InMemoryAuthorMemoryV3Store(),
        mode: 'record',
        live: () => ({ text: 'unused' }),
      })
    ).rejects.toThrow('requires at least one case');
  });
});
