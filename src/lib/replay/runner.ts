import { createServerClient } from '@/lib/supabase';
import {
  buildSnapshotContentHash,
  type ReplaySnapshotRecord,
} from './snapshot';
import {
  recordLLMCall,
  recordMemoryRead,
  recordMemoryWrite,
  recordToolCall as recordCapturedToolCall,
  withReplayCapture,
  type ReplayCapture,
  type ReplayMemoryRead,
  type ReplayMemoryWrite,
  type ReplayToolCall,
  type ReplayToolStubMap,
} from './capture';
import {
  buildToolStubHash,
  buildToolStubInputHash,
  buildToolStubKey,
  loadToolStubs,
  type LoadedReplayToolStub,
} from './tool-stub';

export interface ReplayMissingToolStub {
  name: string;
  input: unknown;
  stubKey: string;
}

export interface ReplayResult {
  snapshotId: string;
  traceId: string;
  organizationId: string;
  apiKeyId: string | null;
  endpoint: string;
  requestBody: unknown;
  responseBody: unknown;
  memoryReads: ReplayMemoryRead[];
  memoryWrites: ReplayMemoryWrite[];
  toolCalls: ReplayToolCall[];
  llmSeed: number | null;
  llmModel: string | null;
  llmProvider: string | null;
  contentHash: string;
  outputContentHash: string;
  durationMs: number;
  replayedAt: string;
  missingToolStubs: ReplayMissingToolStub[];
}

export interface ReplayMemoryWriteChange {
  key: string;
  original: ReplayMemoryWrite | null;
  replayed: ReplayMemoryWrite | null;
}

export interface ReplayToolCallMismatch {
  index: number;
  name: string | null;
  reason:
    | 'missing_replay_call'
    | 'extra_replay_call'
    | 'name_changed'
    | 'input_changed'
    | 'output_changed'
    | 'stub_hash_changed'
    | 'missing_replay_stub';
  original: ReplayToolCall | null;
  replayed: ReplayToolCall | null;
  stubKey?: string;
}

export interface ReplayDiff {
  matches: boolean;
  memoryReadsAdded: ReplayMemoryRead[];
  memoryReadsRemoved: ReplayMemoryRead[];
  memoryWritesChanged: ReplayMemoryWriteChange[];
  toolCallMismatches: ReplayToolCallMismatch[];
  llmSeedMismatch: boolean;
  outputContentHashChanged: boolean;
  originalContentHash: string;
  replayedContentHash: string;
}

export interface ReplayDiffRecord {
  id: string;
  snapshot_id: string;
  replayed_at: string;
  diff: ReplayDiff;
  organization_id: string;
  seed_match: boolean;
  output_match: boolean;
  created_at: string;
}

export interface ReplaySnapshotExecutorContext {
  snapshot: ReplaySnapshotRecord;
  stubs: ReplayToolStubMap;
  missingToolStubs: ReplayMissingToolStub[];
}

export type ReplaySnapshotExecutor = (
  ctx: ReplaySnapshotExecutorContext
) => Promise<unknown>;

export interface ReplaySnapshotOptions {
  organizationId?: string;
  userId?: string;
  stubs?: ReplayToolStubMap;
  executor?: ReplaySnapshotExecutor;
}

export async function replaySnapshot(
  snapshotId: string,
  options: ReplaySnapshotOptions = {}
): Promise<ReplayResult> {
  const snapshot = await loadReplaySnapshotRecord(snapshotId, options.organizationId);
  if (!snapshot) {
    throw new ReplaySnapshotNotFoundError(snapshotId);
  }

  const stubs = options.stubs ?? (await loadToolStubs(snapshot.trace_id));
  const missingToolStubs: ReplayMissingToolStub[] = [];

  const { result, capture } = await withReplayCapture(
    {
      traceId: snapshot.trace_id,
      organizationId: snapshot.organization_id,
      apiKeyId: snapshot.api_key_id ?? undefined,
      userId: options.userId,
      endpoint: snapshot.endpoint,
      requestBody: snapshot.request_body,
      mode: 'replay',
      stubs,
    },
    () =>
      options.executor
        ? options.executor({ snapshot, stubs, missingToolStubs })
        : replaySnapshotDeterministically(snapshot, stubs, missingToolStubs)
  );

  return buildReplayResultFromCapture(snapshot, capture, result, missingToolStubs);
}

export function replayResultFromSnapshot(snapshot: ReplaySnapshotRecord): ReplayResult {
  const responseBody = snapshot.response_body;
  return {
    snapshotId: snapshot.trace_id,
    traceId: snapshot.trace_id,
    organizationId: snapshot.organization_id,
    apiKeyId: snapshot.api_key_id,
    endpoint: snapshot.endpoint,
    requestBody: snapshot.request_body,
    responseBody,
    memoryReads: normalizeArray<ReplayMemoryRead>(snapshot.memory_reads),
    memoryWrites: normalizeArray<ReplayMemoryWrite>(snapshot.memory_writes),
    toolCalls: normalizeArray<ReplayToolCall>(snapshot.tool_calls),
    llmSeed: snapshot.llm_seed,
    llmModel: snapshot.llm_model,
    llmProvider: snapshot.llm_provider,
    contentHash: snapshot.content_hash,
    outputContentHash: buildSnapshotContentHash(responseBody),
    durationMs: snapshot.duration_ms,
    replayedAt: snapshot.created_at,
    missingToolStubs: [],
  };
}

export function diffReplays(original: ReplayResult, replayed: ReplayResult): ReplayDiff {
  const memoryReadsAdded = diffArrayByKey(
    replayed.memoryReads,
    original.memoryReads,
    memoryReadKey
  );
  const memoryReadsRemoved = diffArrayByKey(
    original.memoryReads,
    replayed.memoryReads,
    memoryReadKey
  );
  const memoryWritesChanged = diffMemoryWrites(original.memoryWrites, replayed.memoryWrites);
  const toolCallMismatches = diffToolCalls(
    original.toolCalls,
    replayed.toolCalls,
    replayed.missingToolStubs
  );
  const llmSeedMismatch = original.llmSeed !== replayed.llmSeed;
  const outputContentHashChanged = original.outputContentHash !== replayed.outputContentHash;

  const matches =
    memoryReadsAdded.length === 0 &&
    memoryReadsRemoved.length === 0 &&
    memoryWritesChanged.length === 0 &&
    toolCallMismatches.length === 0 &&
    !llmSeedMismatch &&
    !outputContentHashChanged;

  return {
    matches,
    memoryReadsAdded,
    memoryReadsRemoved,
    memoryWritesChanged,
    toolCallMismatches,
    llmSeedMismatch,
    outputContentHashChanged,
    originalContentHash: original.contentHash,
    replayedContentHash: replayed.contentHash,
  };
}

export async function loadReplaySnapshotRecord(
  snapshotId: string,
  organizationId?: string
): Promise<ReplaySnapshotRecord | null> {
  const supabase = createServerClient();
  let query = supabase
    .from('replay_snapshots')
    .select('*')
    .eq('trace_id', snapshotId);

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data as ReplaySnapshotRecord | null) ?? null;
}

export async function persistReplayDiff(params: {
  snapshotId: string;
  organizationId: string;
  diff: ReplayDiff;
}): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from('replay_diffs').insert({
    snapshot_id: params.snapshotId,
    organization_id: params.organizationId,
    diff: params.diff,
    seed_match: !params.diff.llmSeedMismatch,
    output_match: !params.diff.outputContentHashChanged,
  });

  if (error) throw error;
}

export async function loadLatestReplayDiff(
  snapshotId: string,
  organizationId: string
): Promise<ReplayDiffRecord | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('replay_diffs')
    .select('*')
    .eq('snapshot_id', snapshotId)
    .eq('organization_id', organizationId)
    .order('replayed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as ReplayDiffRecord | null) ?? null;
}

export class ReplaySnapshotNotFoundError extends Error {
  constructor(snapshotId: string) {
    super(`Replay snapshot not found: ${snapshotId}`);
    this.name = 'ReplaySnapshotNotFoundError';
  }
}

async function replaySnapshotDeterministically(
  snapshot: ReplaySnapshotRecord,
  stubs: ReplayToolStubMap,
  missingToolStubs: ReplayMissingToolStub[]
): Promise<unknown> {
  recordLLMCall({
    seed: typeof snapshot.llm_seed === 'number' ? snapshot.llm_seed : undefined,
    model: snapshot.llm_model ?? undefined,
    provider: snapshot.llm_provider ?? undefined,
  });

  for (const read of normalizeArray<ReplayMemoryRead>(snapshot.memory_reads)) {
    if (!read.entityId || !read.memoryId) continue;
    recordMemoryRead({
      entityId: read.entityId,
      memoryId: read.memoryId,
      timestamp: read.timestamp,
    });
  }

  for (const write of normalizeArray<ReplayMemoryWrite>(snapshot.memory_writes)) {
    if (!write.entityId || !write.memoryId) continue;
    recordMemoryWrite({
      entityId: write.entityId,
      memoryId: write.memoryId,
      op: write.op,
      payload: write.payload,
      timestamp: write.timestamp,
    });
  }

  for (const call of normalizeArray<ReplayToolCall>(snapshot.tool_calls)) {
    replayToolCallFromStub(call, stubs, missingToolStubs);
  }

  return snapshot.response_body;
}

function replayToolCallFromStub(
  call: ReplayToolCall,
  stubs: Map<string, LoadedReplayToolStub>,
  missingToolStubs: ReplayMissingToolStub[]
): void {
  if (!call.name) return;
  const input = 'input' in call ? call.input : call.args;
  const stubKey = buildToolStubKey(call.name, input);
  const stub = stubs.get(stubKey);

  if (!stub) {
    missingToolStubs.push({ name: call.name, input, stubKey });
    return;
  }

  recordCapturedToolCall({
    name: call.name,
    args: input,
    result: stub.output,
    input,
    output: stub.output,
    latencyMs: stub.latencyMs,
    inputHash: call.inputHash ?? buildToolStubInputHash(input),
    stubHash: stub.stubHash ?? call.stubHash ?? buildToolStubHash(call.name, input),
    timestamp: call.timestamp,
  });
}

function buildReplayResultFromCapture(
  snapshot: ReplaySnapshotRecord,
  capture: ReplayCapture,
  responseBody: unknown,
  missingToolStubs: ReplayMissingToolStub[]
): ReplayResult {
  const contentHash = buildSnapshotContentHash({
    traceId: capture.traceId,
    endpoint: capture.endpoint,
    requestBody: capture.requestBody,
    responseBody,
    memoryReads: capture.memoryReads,
    memoryWrites: capture.memoryWrites,
    toolCalls: capture.toolCalls,
    llmSeed: capture.llmSeed ?? null,
    llmModel: capture.llmModel ?? null,
    llmProvider: capture.llmProvider ?? null,
  });

  return {
    snapshotId: snapshot.trace_id,
    traceId: capture.traceId,
    organizationId: snapshot.organization_id,
    apiKeyId: snapshot.api_key_id,
    endpoint: capture.endpoint,
    requestBody: capture.requestBody,
    responseBody,
    memoryReads: capture.memoryReads,
    memoryWrites: capture.memoryWrites,
    toolCalls: capture.toolCalls,
    llmSeed: capture.llmSeed ?? null,
    llmModel: capture.llmModel ?? null,
    llmProvider: capture.llmProvider ?? null,
    contentHash,
    outputContentHash: buildSnapshotContentHash(responseBody),
    durationMs: snapshot.duration_ms,
    replayedAt: new Date().toISOString(),
    missingToolStubs,
  };
}

function diffArrayByKey<T>(
  left: T[],
  right: T[],
  keyFor: (value: T) => string
): T[] {
  const rightKeys = new Set(right.map(keyFor));
  return left.filter((value) => !rightKeys.has(keyFor(value)));
}

function diffMemoryWrites(
  original: ReplayMemoryWrite[],
  replayed: ReplayMemoryWrite[]
): ReplayMemoryWriteChange[] {
  const originalByKey = mapByKey(original, memoryWriteKey);
  const replayedByKey = mapByKey(replayed, memoryWriteKey);
  const keys = Array.from(new Set([...originalByKey.keys(), ...replayedByKey.keys()])).sort();
  const changes: ReplayMemoryWriteChange[] = [];

  for (const key of keys) {
    const originalWrite = originalByKey.get(key) ?? null;
    const replayedWrite = replayedByKey.get(key) ?? null;
    if (canonicalComparable(originalWrite?.payload) === canonicalComparable(replayedWrite?.payload)) {
      continue;
    }
    changes.push({ key, original: originalWrite, replayed: replayedWrite });
  }

  return changes;
}

function diffToolCalls(
  original: ReplayToolCall[],
  replayed: ReplayToolCall[],
  missingToolStubs: ReplayMissingToolStub[]
): ReplayToolCallMismatch[] {
  const mismatches: ReplayToolCallMismatch[] = [];
  const length = Math.max(original.length, replayed.length);

  for (let index = 0; index < length; index += 1) {
    const originalCall = original[index] ?? null;
    const replayedCall = replayed[index] ?? null;
    const mismatch = diffToolCallAtIndex(index, originalCall, replayedCall);
    if (mismatch) mismatches.push(mismatch);
  }

  for (const missing of missingToolStubs) {
    mismatches.push({
      index: mismatches.length,
      name: missing.name,
      reason: 'missing_replay_stub',
      original: null,
      replayed: null,
      stubKey: missing.stubKey,
    });
  }

  return mismatches;
}

function diffToolCallAtIndex(
  index: number,
  original: ReplayToolCall | null,
  replayed: ReplayToolCall | null
): ReplayToolCallMismatch | null {
  if (original && !replayed) {
    return {
      index,
      name: original.name,
      reason: 'missing_replay_call',
      original,
      replayed: null,
    };
  }

  if (!original && replayed) {
    return {
      index,
      name: replayed.name,
      reason: 'extra_replay_call',
      original: null,
      replayed,
    };
  }

  if (!original || !replayed) return null;

  if (original.name !== replayed.name) {
    return { index, name: original.name, reason: 'name_changed', original, replayed };
  }
  if (toolInputHash(original) !== toolInputHash(replayed)) {
    return { index, name: original.name, reason: 'input_changed', original, replayed };
  }
  if ((original.stubHash ?? null) !== (replayed.stubHash ?? null)) {
    return { index, name: original.name, reason: 'stub_hash_changed', original, replayed };
  }
  if (canonicalComparable(toolOutput(original)) !== canonicalComparable(toolOutput(replayed))) {
    return { index, name: original.name, reason: 'output_changed', original, replayed };
  }

  return null;
}

function mapByKey<T>(values: T[], keyFor: (value: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const value of values) {
    map.set(keyFor(value), value);
  }
  return map;
}

function memoryReadKey(read: ReplayMemoryRead): string {
  return canonicalComparable({
    entityId: read.entityId,
    memoryId: read.memoryId,
  });
}

function memoryWriteKey(write: ReplayMemoryWrite): string {
  return canonicalComparable({
    entityId: write.entityId,
    memoryId: write.memoryId,
    op: write.op,
  });
}

function toolInputHash(call: ReplayToolCall): string {
  return call.inputHash ?? buildToolStubInputHash('input' in call ? call.input : call.args);
}

function toolOutput(call: ReplayToolCall): unknown {
  return 'output' in call ? call.output : call.result;
}

function canonicalComparable(value: unknown): string {
  return buildSnapshotContentHash(value ?? null);
}

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
