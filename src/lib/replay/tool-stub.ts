import { createHash } from 'node:crypto';
import { createServerClient } from '@/lib/supabase';
import { canonicalizeForReplay } from './snapshot';
import {
  getReplayCapture,
  recordToolCall as recordCapturedToolCall,
  type ReplayToolStubMap,
  type ReplayToolStubValue,
} from './capture';

export interface ReplayToolCallInput {
  name: string;
  input: unknown;
  output: unknown;
  latencyMs: number;
  timestamp?: Date | string;
}

export interface ReplayToolCallRecord {
  name: string;
  input: unknown;
  output: unknown;
  latencyMs: number;
  inputHash: string;
  stubHash: string;
}

export type LoadedReplayToolStub = ReplayToolStubValue;

export class ReplayStubMissingError extends Error {
  readonly stubKey: string;

  constructor(name: string, stubKey: string) {
    super(`Replay stub missing for ${name}`);
    this.name = 'ReplayStubMissingError';
    this.stubKey = stubKey;
  }
}

export function sha256ReplayValue(value: unknown): string {
  return createHash('sha256').update(canonicalizeForReplay(value)).digest('hex');
}

export function buildToolStubInputHash(input: unknown): string {
  return sha256ReplayValue(input);
}

export function buildToolStubHash(name: string, input: unknown): string {
  return sha256ReplayValue({ name, input });
}

export function buildToolStubKey(name: string, input: unknown): string {
  return `${name}:${buildToolStubInputHash(input)}`;
}

export function recordToolCall(
  traceId: string | null | undefined,
  params: ReplayToolCallInput
): ReplayToolCallRecord {
  const inputHash = buildToolStubInputHash(params.input);
  const stubHash = buildToolStubHash(params.name, params.input);
  const latencyMs = Math.max(0, Math.round(params.latencyMs));
  const record: ReplayToolCallRecord = {
    name: params.name,
    input: params.input,
    output: params.output,
    latencyMs,
    inputHash,
    stubHash,
  };

  const capture = getReplayCapture();
  if (!capture) return record;

  if (traceId && traceId !== capture.traceId) {
    throw new Error(`Replay trace mismatch: expected ${capture.traceId}, got ${traceId}`);
  }

  recordCapturedToolCall({
    name: params.name,
    args: params.input,
    result: params.output,
    input: params.input,
    output: params.output,
    latencyMs,
    inputHash,
    stubHash,
    timestamp: params.timestamp,
  });

  return record;
}

export function resolveReplayToolStub<TOutput = unknown>(
  name: string,
  input: unknown
): TOutput | undefined {
  const capture = getReplayCapture();
  if (!capture || capture.mode !== 'replay') return undefined;

  const stubKey = buildToolStubKey(name, input);
  const stub = capture.stubs?.get(stubKey);
  if (!stub) {
    throw new ReplayStubMissingError(name, stubKey);
  }

  recordCapturedToolCall({
    name,
    args: input,
    result: stub.output,
    input,
    output: stub.output,
    latencyMs: stub.latencyMs,
    inputHash: buildToolStubInputHash(input),
    stubHash: stub.stubHash ?? buildToolStubHash(name, input),
  });

  return stub.output as TOutput;
}

export async function loadToolStubs(
  traceId: string
): Promise<Map<string, LoadedReplayToolStub>> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('replay_snapshots')
    .select('tool_calls')
    .eq('trace_id', traceId)
    .maybeSingle();

  if (error) throw error;

  const stubs: ReplayToolStubMap = new Map();
  const toolCalls = Array.isArray(data?.tool_calls) ? data.tool_calls : [];
  for (const rawCall of toolCalls) {
    if (!isRecord(rawCall) || typeof rawCall.name !== 'string') continue;
    const input = 'input' in rawCall ? rawCall.input : rawCall.args;
    const output = 'output' in rawCall ? rawCall.output : rawCall.result;
    const latencyMs = typeof rawCall.latencyMs === 'number' ? rawCall.latencyMs : 0;
    const stubHash =
      typeof rawCall.stubHash === 'string'
        ? rawCall.stubHash
        : buildToolStubHash(rawCall.name, input);

    stubs.set(buildToolStubKey(rawCall.name, input), {
      output,
      latencyMs,
      stubHash,
    });
  }

  return stubs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
