import type { EvalCaseInput, EvalCaseMetrics } from '@/lib/fall/eval/types';
import {
  KNOT_AUTHOR_EVAL_V1_SCHEMA_VERSION,
  type AuthorEvalCase,
  type AuthorEvalResult,
} from './types';

export const AUTHOR_MEMORY_V3_FALL_METADATA_KEY = 'author_memory_v3' as const;

export function authorEvalCaseToFallInput(testCase: AuthorEvalCase): EvalCaseInput {
  return {
    query: testCase.prompt,
    metadata: {
      [AUTHOR_MEMORY_V3_FALL_METADATA_KEY]: {
        schemaVersion: KNOT_AUTHOR_EVAL_V1_SCHEMA_VERSION,
        caseId: testCase.id,
        caseKind: testCase.kind,
        expected: testCase.expected,
        tags: testCase.tags ?? [],
        metadata: testCase.metadata ?? {},
      },
    },
  };
}

export function authorEvalResultToFallMetrics(
  testCase: AuthorEvalCase,
  result: AuthorEvalResult
): EvalCaseMetrics {
  return {
    author_memory_v3_score: result.score,
    [`author_memory_v3_${testCase.kind}`]: result.passed ? 1 : 0,
  };
}

export function authorEvalResultToFallDebug(result: AuthorEvalResult): Record<string, unknown> {
  return {
    authorMemoryV3: {
      schemaVersion: result.schemaVersion,
      memorySnapshotHash: result.memorySnapshotHash,
      sideEffectKeys: result.sideEffectKeys,
      failures: result.failures,
      metadata: result.metadata ?? {},
    },
  };
}
