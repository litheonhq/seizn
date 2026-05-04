import { describe, expect, it } from 'vitest';

import fixture from '@/__tests__/fixtures/knot-author-eval-v1.json';
import {
  KNOT_AUTHOR_EVAL_V1_SCHEMA_VERSION,
  evaluateAuthorOutput,
  type AuthorEvalCase,
} from '@/lib/author/memory-v3';

describe('KNOT Author eval v1 fixture', () => {
  it('uses the locked schema version', () => {
    expect(fixture.schemaVersion).toBe(KNOT_AUTHOR_EVAL_V1_SCHEMA_VERSION);
  });

  it('passes when output includes current canon and excludes invalidated facts', () => {
    const result = evaluateAuthorOutput({
      testCase: fixture as AuthorEvalCase,
      output: 'Sori is a student in the current canon.',
      memorySnapshotHash: 'snapshot-hash',
      sideEffectKeys: ['side-effect-key'],
    });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
    expect(result.failures).toEqual([]);
  });

  it('fails when output leaks invalidated canon', () => {
    const result = evaluateAuthorOutput({
      testCase: fixture as AuthorEvalCase,
      output: 'Sori is a student. Sori is an agent.',
      memorySnapshotHash: 'snapshot-hash',
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(['included forbidden text: Sori is an agent']);
  });
});
