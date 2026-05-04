import { canonicalize, type JsonValue } from './canonical';
import { evaluateAuthorOutput } from './eval';
import {
  authorEvalCaseToFallInput,
  authorEvalResultToFallDebug,
  authorEvalResultToFallMetrics,
} from './fall-adapter';
import { runAuthorSideEffect, type AuthorSideEffectStore } from './replay';
import { createAuthorMemorySnapshot } from './snapshot';
import {
  createAuthorAuditLogEntry,
  hashAuthorAuditPrompt,
  type AuthorAuditLogEntry,
  type AuthorAuditLogStore,
} from '@/lib/author/audit';
import type {
  AuthorEvalCase,
  AuthorEvalResult,
  AuthorMemoryRecord,
  AuthorMemorySnapshot,
  AuthorReplayMode,
  AuthorSideEffectRecord,
  AuthorSideEffectRequest,
} from './types';
import {
  applyAuthorEvalVerifierResult,
  type AuthorEvalVerifier,
} from './verifier';

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
  verifier?: AuthorEvalVerifier;
  userId?: string;
  auditLog?: AuthorAuditLogStore;
  parentDecisionId?: string;
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
  const snapshotAudit = await logRunnerAudit(params, 'simulation.run', {
    step: 'snapshot',
    project_id: params.projectId,
    snapshot_hash: snapshot.snapshotHash,
    item_count: snapshot.itemCount,
  }, {
    parentDecisionId: params.parentDecisionId,
  });
  const sideEffect = await runAuthorSideEffect({
    request: params.request,
    mode: params.mode,
    store: params.store,
    capturedAt: params.capturedAt,
    live: params.live,
  });
  const sideEffectAudit = await logRunnerAudit(params, 'simulation.run', {
    step: 'side_effect',
    mode: params.mode,
    side_effect_key: sideEffect.key,
    output_hash: hashAuthorAuditPrompt(sideEffect.output),
  }, {
    parentDecisionId: snapshotAudit?.decisionId,
    llmMeta: params.request.kind === 'llm'
      ? {
          provider: params.request.provider,
          model: params.request.model,
          operation: params.request.operation,
          prompt_hash: hashAuthorAuditPrompt(params.request.input),
        }
      : undefined,
  });
  const output = params.outputToText
    ? params.outputToText(sideEffect.output)
    : defaultOutputToText(sideEffect.output);
  let result = evaluateAuthorOutput({
    testCase: params.testCase,
    output,
    memorySnapshotHash: snapshot.snapshotHash,
    sideEffectKeys: [sideEffect.key],
  });
  if (params.verifier) {
    const verifierResult = await params.verifier.verify({
      testCase: params.testCase,
      output,
      records: params.records,
      snapshot,
      sideEffect,
    });
    result = applyAuthorEvalVerifierResult(result, verifierResult);
  }
  await logRunnerAudit(params, params.mode === 'replay' ? 'simulation.replay' : 'simulation.run', {
    step: 'eval_result',
    case_id: params.testCase.id,
    passed: result.passed,
    score: result.score,
    memory_snapshot_hash: result.memorySnapshotHash,
    side_effect_keys: result.sideEffectKeys,
    output_hash: hashAuthorAuditPrompt(result.output),
    deterministic: params.mode !== 'off',
  }, {
    parentDecisionId: sideEffectAudit?.decisionId ?? snapshotAudit?.decisionId,
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

async function logRunnerAudit(
  params: RunAuthorEvalCaseParams,
  eventType: 'simulation.run' | 'simulation.replay',
  payload: unknown,
  options: {
    parentDecisionId?: string;
    llmMeta?: AuthorAuditLogEntry['llmMeta'];
  } = {}
): Promise<AuthorAuditLogEntry | undefined> {
  if (!params.auditLog || !params.userId || !params.projectId) {
    return undefined;
  }

  const entry = createAuthorAuditLogEntry({
    userId: params.userId,
    projectId: params.projectId,
    eventType,
    payload,
    llmMeta: options.llmMeta,
    parentDecisionId: options.parentDecisionId,
  });
  await params.auditLog.log(entry);
  return entry;
}
