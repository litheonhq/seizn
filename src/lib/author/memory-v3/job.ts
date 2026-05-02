import type { JsonValue } from './canonical';
import { runAuthorEvalCase, type RunAuthorEvalCaseOutput } from './runner';
import type { AuthorMemoryV3Store } from './store';
import type {
  AuthorEvalCase,
  AuthorMemoryRecord,
  AuthorReplayMode,
  AuthorSideEffectRequest,
} from './types';

export interface AuthorEvalJobCase {
  testCase: AuthorEvalCase;
  request: AuthorSideEffectRequest;
  outputToText?: (output: JsonValue) => string;
}

export interface RunAuthorEvalJobParams {
  projectId: string;
  runId?: string;
  records: AuthorMemoryRecord[];
  cases: AuthorEvalJobCase[];
  store: AuthorMemoryV3Store;
  mode: AuthorReplayMode;
  generatedAt?: string;
  capturedAt?: string;
  live: (input: {
    testCase: AuthorEvalCase;
    request: AuthorSideEffectRequest;
    caseIndex: number;
  }) => Promise<JsonValue> | JsonValue;
}

export interface AuthorEvalJobSummary {
  runId: string;
  projectId: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  averageScore: number;
  memorySnapshotHash: string;
  sideEffectKeys: string[];
}

export interface RunAuthorEvalJobOutput {
  runId: string;
  cases: RunAuthorEvalCaseOutput[];
  summary: AuthorEvalJobSummary;
}

export async function runAuthorEvalJob(
  params: RunAuthorEvalJobParams
): Promise<RunAuthorEvalJobOutput> {
  if (params.cases.length === 0) {
    throw new Error('Author Memory v3 eval job requires at least one case');
  }

  const runId = params.runId ?? crypto.randomUUID();
  const outputs: RunAuthorEvalCaseOutput[] = [];

  await params.store.saveRecords({
    projectId: params.projectId,
    records: params.records,
    mode: 'replace',
  });

  for (const [caseIndex, jobCase] of params.cases.entries()) {
    const output = await runAuthorEvalCase({
      testCase: jobCase.testCase,
      records: params.records,
      request: jobCase.request,
      store: params.store,
      mode: params.mode,
      projectId: params.projectId,
      generatedAt: params.generatedAt,
      capturedAt: params.capturedAt,
      outputToText: jobCase.outputToText,
      live: () =>
        params.live({
          testCase: jobCase.testCase,
          request: jobCase.request,
          caseIndex,
        }),
    });

    await params.store.saveSnapshot(output.snapshot);
    await params.store.saveEvalResult({
      projectId: params.projectId,
      runId,
      result: output.result,
      createdAt: params.capturedAt,
      metadata: {
        caseIndex,
        evalKind: jobCase.testCase.kind,
      },
    });
    outputs.push(output);
  }

  const summary = summarizeAuthorEvalJob({
    runId,
    projectId: params.projectId,
    outputs,
  });

  return {
    runId,
    cases: outputs,
    summary,
  };
}

function summarizeAuthorEvalJob(params: {
  runId: string;
  projectId: string;
  outputs: RunAuthorEvalCaseOutput[];
}): AuthorEvalJobSummary {
  const totalCases = params.outputs.length;
  const passedCases = params.outputs.filter((output) => output.result.passed).length;
  const scoreSum = params.outputs.reduce((sum, output) => sum + output.result.score, 0);
  const sideEffectKeys = params.outputs.flatMap((output) => output.result.sideEffectKeys);

  return {
    runId: params.runId,
    projectId: params.projectId,
    totalCases,
    passedCases,
    failedCases: totalCases - passedCases,
    averageScore: totalCases === 0 ? 0 : scoreSum / totalCases,
    memorySnapshotHash: params.outputs[0].snapshot.snapshotHash,
    sideEffectKeys,
  };
}
