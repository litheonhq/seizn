import { describe, expect, it } from 'vitest';

import {
  AUTHOR_MEMORY_V3_FALL_METADATA_KEY,
  authorEvalCasesToFallInputs,
  authorEvalCaseToFallInput,
  authorEvalResultToFallDebug,
  authorEvalResultToFallMetrics,
  importAuthorEvalCasesToFallDataset,
  type AuthorEvalCase,
  type AuthorEvalResult,
} from '@/lib/author/memory-v3';
import type { createDataset } from '@/lib/fall/eval/dataset';

const testCase: AuthorEvalCase = {
  schemaVersion: 'seizn.knot_author_eval.v1',
  id: 'case-1',
  kind: 'relationship_continuity',
  prompt: 'What does Yui currently know about Sori?',
  expected: {
    mustInclude: ['Yui distrusts Sori'],
    mustExclude: ['Yui knows the hidden archive'],
  },
  tags: ['knot', 'relationship'],
  metadata: { characterIds: ['yui', 'sori'] },
};

const result: AuthorEvalResult = {
  schemaVersion: 'seizn.knot_author_eval.v1',
  caseId: 'case-1',
  passed: false,
  score: 0,
  memorySnapshotHash: 'snapshot-1',
  sideEffectKeys: ['effect-1'],
  output: 'Yui knows the hidden archive.',
  failures: ['included forbidden text: Yui knows the hidden archive'],
};

describe('Author Memory v3 Fall eval adapter', () => {
  it('stores Author eval case details in Fall case metadata', () => {
    const fallInput = authorEvalCaseToFallInput(testCase);
    const metadata = fallInput.metadata?.[AUTHOR_MEMORY_V3_FALL_METADATA_KEY] as Record<
      string,
      unknown
    >;

    expect(fallInput.query).toBe(testCase.prompt);
    expect(fallInput.expected_answer).toBe('Yui distrusts Sori');
    expect(metadata.caseId).toBe('case-1');
    expect(metadata.caseKind).toBe('relationship_continuity');
    expect(metadata.tags).toEqual(['knot', 'relationship']);
  });

  it('maps Author result score into Fall custom metrics', () => {
    expect(authorEvalResultToFallMetrics(testCase, result)).toEqual({
      author_memory_v3_score: 0,
      author_memory_v3_relationship_continuity: 0,
    });
  });

  it('keeps replay evidence in Fall debug payload shape', () => {
    expect(authorEvalResultToFallDebug(result)).toEqual({
      authorMemoryV3: {
        schemaVersion: 'seizn.knot_author_eval.v1',
        memorySnapshotHash: 'snapshot-1',
        sideEffectKeys: ['effect-1'],
        failures: ['included forbidden text: Yui knows the hidden archive'],
        metadata: {},
      },
    });
  });

  it('creates Fall dataset input from Author cases', () => {
    const inputs = authorEvalCasesToFallInputs([testCase]);

    expect(inputs).toHaveLength(1);
    expect(inputs[0].metadata?.[AUTHOR_MEMORY_V3_FALL_METADATA_KEY]).toMatchObject({
      caseId: 'case-1',
      caseKind: 'relationship_continuity',
    });
  });

  it('imports Author cases into a Fall dataset with Author metadata', async () => {
    const createDatasetFn = async (params: Parameters<typeof createDataset>[0]) => ({
      dataset: {
        id: 'dataset-1',
        userId: params.userId,
        name: params.input.name,
        description: params.input.description,
        source: params.input.source,
        caseCount: params.input.cases?.length,
        metadata: params.input.metadata,
        createdAt: '2026-05-02T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
      },
      casesCreated: params.input.cases?.length ?? 0,
    });

    const output = await importAuthorEvalCasesToFallDataset({
      userId: 'user-1',
      projectId: 'knot',
      name: 'KNOT Author Eval Seed',
      cases: [testCase],
      createDatasetFn,
    });

    expect(output.casesCreated).toBe(1);
    expect(output.dataset.metadata?.[AUTHOR_MEMORY_V3_FALL_METADATA_KEY]).toMatchObject({
      schemaVersion: 'seizn.author_memory_v3.v1',
      projectId: 'knot',
      source: 'author_memory_v3',
      caseCount: 1,
    });
  });
});
