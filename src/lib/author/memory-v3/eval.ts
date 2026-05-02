import {
  KNOT_AUTHOR_EVAL_V1_SCHEMA_VERSION,
  type AuthorEvalCase,
  type AuthorEvalResult,
} from './types';

export function evaluateAuthorOutput(params: {
  testCase: AuthorEvalCase;
  output: string;
  memorySnapshotHash: string;
  sideEffectKeys?: string[];
  metadata?: AuthorEvalResult['metadata'];
}): AuthorEvalResult {
  const failures: string[] = [];
  const normalizedOutput = normalizeText(params.output);

  for (const expected of params.testCase.expected.mustInclude ?? []) {
    if (!normalizedOutput.includes(normalizeText(expected))) {
      failures.push(`missing required text: ${expected}`);
    }
  }

  for (const forbidden of params.testCase.expected.mustExclude ?? []) {
    if (normalizedOutput.includes(normalizeText(forbidden))) {
      failures.push(`included forbidden text: ${forbidden}`);
    }
  }

  const passed = failures.length === 0;

  return {
    schemaVersion: KNOT_AUTHOR_EVAL_V1_SCHEMA_VERSION,
    caseId: params.testCase.id,
    passed,
    score: passed ? 1 : 0,
    memorySnapshotHash: params.memorySnapshotHash,
    sideEffectKeys: params.sideEffectKeys ?? [],
    output: params.output,
    failures,
    metadata: params.metadata,
  };
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}
