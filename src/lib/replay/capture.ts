import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface ReplayMemoryRead {
  entityId: string;
  memoryId: string;
  timestamp: string;
}

export interface ReplayMemoryWrite {
  entityId: string;
  memoryId: string;
  op: 'create' | 'update' | 'delete' | 'deduplicate' | string;
  payload: unknown;
  timestamp: string;
}

export interface ReplayToolCall {
  name: string;
  args: unknown;
  result: unknown;
  input?: unknown;
  output?: unknown;
  latencyMs?: number;
  inputHash?: string;
  stubHash?: string;
  timestamp: string;
}

export type ReplayCaptureMode = 'record' | 'replay';

export interface ReplayToolStubValue {
  output: unknown;
  latencyMs: number;
  stubHash?: string;
}

export type ReplayToolStubMap = Map<string, ReplayToolStubValue>;

export interface ReplayCapture {
  traceId: string;
  organizationId?: string;
  apiKeyId?: string;
  userId?: string;
  mode: ReplayCaptureMode;
  stubs?: ReplayToolStubMap;
  endpoint: string;
  requestBody: unknown;
  memoryReads: ReplayMemoryRead[];
  memoryWrites: ReplayMemoryWrite[];
  toolCalls: ReplayToolCall[];
  llmSeed?: number;
  llmModel?: string;
  llmProvider?: string;
}

export interface ReplayCaptureContext {
  organizationId?: string;
  apiKeyId?: string;
  userId?: string;
  endpoint: string;
  requestBody: unknown;
  traceId?: string | null;
  mode?: ReplayCaptureMode;
  stubs?: ReplayToolStubMap;
}

const captureStorage = new AsyncLocalStorage<ReplayCapture>();

function isUuid(value: string | null | undefined): value is string {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export function normalizeReplayTraceId(candidate?: string | null): string {
  return isUuid(candidate) ? candidate : randomUUID();
}

export function getReplayCapture(): ReplayCapture | undefined {
  return captureStorage.getStore();
}

export function isReplayCaptureActive(): boolean {
  return Boolean(getReplayCapture());
}

export async function withReplayCapture<T>(
  ctx: ReplayCaptureContext,
  fn: () => Promise<T>
): Promise<{ result: T; capture: ReplayCapture; traceId: string }> {
  const capture: ReplayCapture = {
    traceId: normalizeReplayTraceId(ctx.traceId),
    organizationId: ctx.organizationId,
    apiKeyId: ctx.apiKeyId,
    userId: ctx.userId,
    mode: ctx.mode ?? 'record',
    stubs: ctx.stubs,
    endpoint: ctx.endpoint,
    requestBody: ctx.requestBody,
    memoryReads: [],
    memoryWrites: [],
    toolCalls: [],
  };

  const result = await captureStorage.run(capture, fn);
  return { result, capture, traceId: capture.traceId };
}

export function setReplayActor(params: {
  organizationId?: string | null;
  apiKeyId?: string | null;
  userId?: string | null;
}): void {
  const capture = getReplayCapture();
  if (!capture) return;

  if (params.organizationId) capture.organizationId = params.organizationId;
  if (params.apiKeyId) capture.apiKeyId = params.apiKeyId;
  if (params.userId) capture.userId = params.userId;
}

export function recordMemoryRead(params: {
  entityId: string;
  memoryId: string;
  timestamp?: Date | string;
}): void {
  const capture = getReplayCapture();
  if (!capture) return;

  capture.memoryReads.push({
    entityId: params.entityId,
    memoryId: params.memoryId,
    timestamp: normalizeTimestamp(params.timestamp),
  });
}

export function recordMemoryReads(
  memories: Array<{ id?: unknown; agent_id?: unknown; session_id?: unknown; user_id?: unknown }>,
  fallbackEntityId: string
): void {
  for (const memory of memories) {
    const memoryId = typeof memory.id === 'string' ? memory.id : String(memory.id ?? '');
    if (!memoryId) continue;
    const entityId =
      typeof memory.agent_id === 'string'
        ? memory.agent_id
        : typeof memory.session_id === 'string'
          ? memory.session_id
          : typeof memory.user_id === 'string'
            ? memory.user_id
            : fallbackEntityId;
    recordMemoryRead({ entityId, memoryId });
  }
}

export function recordMemoryWrite(params: {
  entityId: string;
  memoryId: string;
  op: ReplayMemoryWrite['op'];
  payload: unknown;
  timestamp?: Date | string;
}): void {
  const capture = getReplayCapture();
  if (!capture) return;

  capture.memoryWrites.push({
    entityId: params.entityId,
    memoryId: params.memoryId,
    op: params.op,
    payload: params.payload,
    timestamp: normalizeTimestamp(params.timestamp),
  });
}

export function recordToolCall(params: {
  name: string;
  args: unknown;
  result: unknown;
  input?: unknown;
  output?: unknown;
  latencyMs?: number;
  inputHash?: string;
  stubHash?: string;
  timestamp?: Date | string;
}): void {
  const capture = getReplayCapture();
  if (!capture) return;

  capture.toolCalls.push({
    name: params.name,
    args: params.args,
    result: params.result,
    input: params.input,
    output: params.output,
    latencyMs: params.latencyMs,
    inputHash: params.inputHash,
    stubHash: params.stubHash,
    timestamp: normalizeTimestamp(params.timestamp),
  });
}

export function recordLLMCall(params: {
  seed?: number;
  model?: string;
  provider?: string;
}): void {
  const capture = getReplayCapture();
  if (!capture) return;

  if (typeof params.seed === 'number') capture.llmSeed = params.seed;
  if (params.model) capture.llmModel = params.model;
  if (params.provider) capture.llmProvider = params.provider;
}

function normalizeTimestamp(value?: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}
