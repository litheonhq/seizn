import { canonicalize, type JsonValue } from './canonical';
import { evaluateAuthorOutput } from './eval';
import {
  authorEvalCaseToFallInput,
  authorEvalResultToFallDebug,
  authorEvalResultToFallMetrics,
} from './fall-adapter';
import { runAuthorSideEffect, type AuthorSideEffectStore } from './replay';
import { createAuthorMemorySnapshot } from './snapshot';
import type {
  AuthorEvalCase,
  AuthorEvalResult,
  AuthorMemoryRecord,
  AuthorMemorySnapshot,
  AuthorReplayMode,
  AuthorSideEffectRecord,
  AuthorSideEffectRequest,
} from './types';

export interface RunAuthorEvalCaseParams {
  testCase: AuthorEvalCase;
  records: AuthorMemoryRecord[];
  request: AuthorSideEffectRequest;
  store: AuthorSideEffectStore;
  mode: AuthorReplayMode;
  projectId?: string;
  generatedAt?: string;
  capturedAt?: string;
  live: () => Promise<JsonValue> | JsonValue;
  outputToText?: (output: JsonValue) => string;
}

export interface RunAuthorEvalCaseOutput {
  snapshot: AuthorMemorySnapshot;
  sideEffect: AuthorSideEffectRecord;
  result: AuthorEvalResult;
  fall: {
    caseInput: ReturnType<typeof authorEvalCaseToFallInput>;
    metrics: ReturnType<typeof authorEvalResultToFallMetrics>;
    debug: ReturnType<typeof authorEvalResultToFallDebug>;
  };
}

export async function runAuthorEvalCase(
  params: RunAuthorEvalCaseParams
): Promise<RunAuthorEvalCaseOutput> {
  const snapshot = createAuthorMemorySnapshot({
    projectId: params.projectId,
    records: params.records,
    generatedAt: params.generatedAt,
  });
  const sideEffect = await runAuthorSideEffect({
    request: params.request,
    mode: params.mode,
    store: params.store,
    capturedAt: params.capturedAt,
    live: params.live,
  });
  const output = params.outputToText
    ? params.outputToText(sideEffect.output)
    : defaultOutputToText(sideEffect.output);
  const result = evaluateAuthorOutput({
    testCase: params.testCase,
    output,
    memorySnapshotHash: snapshot.snapshotHash,
    sideEffectKeys: [sideEffect.key],
  });

  return {
    snapshot,
    sideEffect,
    result,
    fall: {
      caseInput: authorEvalCaseToFallInput(params.testCase),
      metrics: authorEvalResultToFallMetrics(params.testCase, result),
      debug: authorEvalResultToFallDebug(result),
    },
  };
}

function defaultOutputToText(output: JsonValue): string {
  if (typeof output === 'string') {
    return output;
  }

  if (output && typeof output === 'object' && !Array.isArray(output)) {
    const record = output as Record<string, JsonValue>;
    for (const key of ['text', 'content', 'answer', 'finalText']) {
      const value = record[key];
      if (typeof value === 'string') {
        return value;
      }
    }
  }

  return JSON.stringify(canonicalize(output));
}
