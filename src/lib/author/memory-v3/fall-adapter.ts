import { createDataset } from '@/lib/fall/eval/dataset';
import type {
  CreateDatasetInput,
  EvalCaseInput,
  EvalCaseMetrics,
  EvalDataset,
} from '@/lib/fall/eval/types';
import {
  AUTHOR_MEMORY_V3_SCHEMA_VERSION,
  KNOT_AUTHOR_EVAL_V1_SCHEMA_VERSION,
  type AuthorEvalCase,
  type AuthorEvalResult,
} from './types';

export const AUTHOR_MEMORY_V3_FALL_METADATA_KEY = 'author_memory_v3' as const;

type CreateDatasetFn = typeof createDataset;

export interface ImportAuthorEvalCasesToFallDatasetInput {
  userId: string;
  projectId: string;
  name: string;
  description?: string;
  cases: AuthorEvalCase[];
  metadata?: Record<string, unknown>;
  createDatasetFn?: CreateDatasetFn;
}

export interface ImportAuthorEvalCasesToFallDatasetOutput {
  dataset: EvalDataset;
  casesCreated: number;
}

export function authorEvalCaseToFallInput(testCase: AuthorEvalCase): EvalCaseInput {
  return {
    query: testCase.prompt,
    expected_answer: expectedAnswerForFall(testCase),
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

export function authorEvalCasesToFallInputs(testCases: AuthorEvalCase[]): EvalCaseInput[] {
  return testCases.map(authorEvalCaseToFallInput);
}

export async function importAuthorEvalCasesToFallDataset(
  input: ImportAuthorEvalCasesToFallDatasetInput
): Promise<ImportAuthorEvalCasesToFallDatasetOutput> {
  const createDatasetImpl = input.createDatasetFn ?? createDataset;
  const datasetInput: CreateDatasetInput = {
    name: input.name,
    description: input.description,
    source: 'import',
    cases: authorEvalCasesToFallInputs(input.cases),
    metadata: {
      ...input.metadata,
      [AUTHOR_MEMORY_V3_FALL_METADATA_KEY]: {
        schemaVersion: AUTHOR_MEMORY_V3_SCHEMA_VERSION,
        projectId: input.projectId,
        source: 'author_memory_v3',
        caseCount: input.cases.length,
      },
    },
  };

  return createDatasetImpl({
    userId: input.userId,
    input: datasetInput,
  });
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

function expectedAnswerForFall(testCase: AuthorEvalCase): string | undefined {
  const mustInclude = testCase.expected.mustInclude ?? [];
  if (mustInclude.length === 0) {
    return undefined;
  }

  return mustInclude.join('\n');
}
