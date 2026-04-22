import {
  buildSnapshotContentHash,
  loadSnapshot,
  type ReplaySnapshotRecord,
} from './snapshot';
import type { ReplayCapture } from './capture';

export interface ReplayDivergence {
  path: string;
  original: unknown;
  replayed: unknown;
}

export async function replaySnapshot(
  traceId: string,
  organizationId: string,
  options: { mockLLM?: boolean; mockTools?: boolean } = {}
): Promise<{
  newCapture: ReplayCapture;
  newResponseBody: unknown;
  matchesOriginal: boolean;
  divergence?: ReplayDivergence;
}> {
  const snapshot = await loadSnapshot(traceId, organizationId);
  if (!snapshot) {
    throw new Error('Replay snapshot not found');
  }

  return replaySnapshotRecord(snapshot, options);
}

export function replaySnapshotRecord(
  snapshot: ReplaySnapshotRecord,
  _options: { mockLLM?: boolean; mockTools?: boolean } = {}
): {
  newCapture: ReplayCapture;
  newResponseBody: unknown;
  matchesOriginal: boolean;
  divergence?: ReplayDivergence;
} {
  const newCapture: ReplayCapture = {
    traceId: snapshot.trace_id,
    organizationId: snapshot.organization_id,
    apiKeyId: snapshot.api_key_id ?? undefined,
    mode: 'replay',
    endpoint: snapshot.endpoint,
    requestBody: snapshot.request_body,
    memoryReads: normalizeArray(snapshot.memory_reads),
    memoryWrites: normalizeArray(snapshot.memory_writes),
    toolCalls: normalizeArray(snapshot.tool_calls),
    llmSeed: snapshot.llm_seed ?? undefined,
    llmModel: snapshot.llm_model ?? undefined,
    llmProvider: snapshot.llm_provider ?? undefined,
  };

  const replayedHash = buildSnapshotContentHash({
    traceId: newCapture.traceId,
    endpoint: snapshot.endpoint,
    requestBody: snapshot.request_body,
    responseBody: snapshot.response_body,
    memoryReads: newCapture.memoryReads,
    memoryWrites: newCapture.memoryWrites,
    toolCalls: newCapture.toolCalls,
    llmSeed: newCapture.llmSeed ?? null,
    llmModel: newCapture.llmModel ?? null,
    llmProvider: newCapture.llmProvider ?? null,
  });

  const divergence = findFirstDivergence(
    { content_hash: snapshot.content_hash },
    { content_hash: replayedHash }
  );

  return {
    newCapture,
    newResponseBody: snapshot.response_body,
    matchesOriginal: !divergence,
    divergence,
  };
}

export function diffSnapshotRecords(
  a: ReplaySnapshotRecord,
  b: ReplaySnapshotRecord
): ReplayDivergence | undefined {
  return findFirstDivergence(
    {
      endpoint: a.endpoint,
      request_body: a.request_body,
      response_body: a.response_body,
      memory_reads: a.memory_reads,
      memory_writes: a.memory_writes,
      tool_calls: a.tool_calls,
      llm_seed: a.llm_seed,
      llm_model: a.llm_model,
      llm_provider: a.llm_provider,
    },
    {
      endpoint: b.endpoint,
      request_body: b.request_body,
      response_body: b.response_body,
      memory_reads: b.memory_reads,
      memory_writes: b.memory_writes,
      tool_calls: b.tool_calls,
      llm_seed: b.llm_seed,
      llm_model: b.llm_model,
      llm_provider: b.llm_provider,
    }
  );
}

export function findFirstDivergence(
  original: unknown,
  replayed: unknown,
  path = '$'
): ReplayDivergence | undefined {
  if (Object.is(original, replayed)) return undefined;

  if (Array.isArray(original) && Array.isArray(replayed)) {
    const length = Math.max(original.length, replayed.length);
    for (let index = 0; index < length; index += 1) {
      const child = findFirstDivergence(original[index], replayed[index], `${path}[${index}]`);
      if (child) return child;
    }
    return undefined;
  }

  if (isRecord(original) && isRecord(replayed)) {
    const keys = Array.from(new Set([...Object.keys(original), ...Object.keys(replayed)])).sort();
    for (const key of keys) {
      const child = findFirstDivergence(original[key], replayed[key], `${path}.${key}`);
      if (child) return child;
    }
    return undefined;
  }

  return { path, original, replayed };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
