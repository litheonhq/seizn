import { describe, expect, it } from 'vitest';

import {
  InMemoryAuthorSideEffectStore,
  runAuthorEvalCase,
  type AuthorEvalCase,
  type AuthorMemoryRecord,
  type AuthorSideEffectRequest,
} from '@/lib/author/memory-v3';

const testCase: AuthorEvalCase = {
  schemaVersion: 'seizn.knot_author_eval.v1',
  id: 'case-student-current',
  kind: 'invalidated_fact_exclusion',
  prompt: 'What is Sori in current canon?',
  expected: {
    mustInclude: ['Sori is a student'],
    mustExclude: ['Sori is an agent'],
  },
};

const records: AuthorMemoryRecord[] = [
  {
    id: 'student-current',
    kind: 'world_rule',
    status: 'canon',
    content: 'Sori is a student.',
  },
];

const request: AuthorSideEffectRequest = {
  kind: 'llm',
  provider: 'anthropic',
  model: 'claude-opus-4.7',
  operation: 'answer-author-eval-case',
  input: {
    prompt: testCase.prompt,
  },
  params: {
    temperature: 0,
  },
};

describe('Author Memory v3 eval runner', () => {
  it('runs an Author eval case and returns Fall-compatible evidence', async () => {
    const output = await runAuthorEvalCase({
      testCase,
      records,
      request,
      mode: 'record',
      store: new InMemoryAuthorSideEffectStore(),
      projectId: 'knot',
      generatedAt: '2026-05-02T00:00:00.000Z',
      capturedAt: '2026-05-02T00:00:00.000Z',
      live: () => ({ text: 'Sori is a student in the current canon.' }),
    });

    expect(output.result.passed).toBe(true);
    expect(output.result.memorySnapshotHash).toBe(output.snapshot.snapshotHash);
    expect(output.result.sideEffectKeys).toEqual([output.sideEffect.key]);
    expect(output.fall.caseInput.query).toBe(testCase.prompt);
    expect(output.fall.metrics).toEqual({
      author_memory_v3_score: 1,
      author_memory_v3_invalidated_fact_exclusion: 1,
    });
    expect(output.fall.debug.authorMemoryV3).toMatchObject({
      memorySnapshotHash: output.snapshot.snapshotHash,
      sideEffectKeys: [output.sideEffect.key],
      failures: [],
    });
  });

  it('supports replay mode from a previously recorded side effect', async () => {
    const store = new InMemoryAuthorSideEffectStore();
    const recorded = await runAuthorEvalCase({
      testCase,
      records,
      request,
      mode: 'record',
      store,
      live: () => ({ answer: 'Sori is a student.' }),
    });
    const replayed = await runAuthorEvalCase({
      testCase,
      records,
      request,
      mode: 'replay',
      store,
      live: () => {
        throw new Error('live provider must not be called during replay');
      },
    });

    expect(replayed.sideEffect).toEqual(recorded.sideEffect);
    expect(replayed.result).toEqual(recorded.result);
  });
});
