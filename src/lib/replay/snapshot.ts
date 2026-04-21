import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  getReplayCapture,
  withReplayCapture,
  type ReplayCapture,
} from './capture';
import { logServerError } from '@/lib/server/logger';

export interface ReplaySnapshotRecord {
  trace_id: string;
  organization_id: string;
  api_key_id: string | null;
  endpoint: string;
  request_body: unknown;
  response_body: unknown;
  memory_reads: unknown[];
  memory_writes: unknown[];
  tool_calls: unknown[];
  llm_seed: number | null;
  llm_model: string | null;
  llm_provider: string | null;
  stub_hash: string | null;
  content_hash: string;
  duration_ms: number;
  created_at: string;
}

export function canonicalizeForReplay(value: unknown): string {
  return JSON.stringify(sortForReplay(value));
}

export function buildSnapshotContentHash(value: unknown): string {
  return createHash('sha256').update(canonicalizeForReplay(value)).digest('hex');
}

export async function persistSnapshot(
  capture: ReplayCapture,
  meta: {
    organizationId: string;
    apiKeyId?: string;
    endpoint: string;
    requestBody: unknown;
    responseBody: unknown;
    durationMs: number;
  }
): Promise<{ traceId: string; contentHash: string }> {
  const snapshotPayload = {
    traceId: capture.traceId,
    endpoint: meta.endpoint,
    requestBody: meta.requestBody,
    responseBody: meta.responseBody,
    memoryReads: capture.memoryReads,
    memoryWrites: capture.memoryWrites,
    toolCalls: capture.toolCalls,
    llmSeed: capture.llmSeed ?? null,
    llmModel: capture.llmModel ?? null,
    llmProvider: capture.llmProvider ?? null,
  };
  const contentHash = buildSnapshotContentHash(snapshotPayload);
  const stubHash = buildSnapshotStubHash(capture.toolCalls);

  const supabase = createServerClient();
  const { error } = await supabase
    .from('replay_snapshots')
    .upsert({
      trace_id: capture.traceId,
      organization_id: meta.organizationId,
      api_key_id: meta.apiKeyId ?? null,
      endpoint: meta.endpoint,
      request_body: meta.requestBody,
      response_body: meta.responseBody,
      memory_reads: capture.memoryReads,
      memory_writes: capture.memoryWrites,
      tool_calls: capture.toolCalls,
      llm_seed: capture.llmSeed ?? null,
      llm_model: capture.llmModel ?? null,
      llm_provider: capture.llmProvider ?? null,
      stub_hash: stubHash,
      content_hash: contentHash,
      duration_ms: Math.max(0, Math.round(meta.durationMs)),
    }, { onConflict: 'trace_id' });

  if (error) {
    throw error;
  }

  return { traceId: capture.traceId, contentHash };
}

export async function loadSnapshot(
  traceId: string,
  organizationId: string
): Promise<ReplaySnapshotRecord | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('replay_snapshots')
    .select('*')
    .eq('trace_id', traceId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) throw error;
  return (data as ReplaySnapshotRecord | null) ?? null;
}

export async function listSnapshots(
  organizationId: string,
  opts: { limit?: number; after?: string | null; endpoint?: string | null } = {}
): Promise<ReplaySnapshotRecord[]> {
  const supabase = createServerClient();
  let query = supabase
    .from('replay_snapshots')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 50, 1), 100));

  if (opts.after) query = query.lt('created_at', opts.after);
  if (opts.endpoint) query = query.eq('endpoint', opts.endpoint);

  const { data, error } = await query;
  if (error) throw error;
  return (data as ReplaySnapshotRecord[]) ?? [];
}

export async function resolveReplayOrganizationId(
  userId: string,
  apiKeyId?: string | null
): Promise<string | null> {
  const supabase = createServerClient();

  if (apiKeyId) {
    try {
      const { data: apiKey } = await supabase
        .from('api_keys')
        .select('organization_id')
        .eq('id', apiKeyId)
        .maybeSingle();
      if (typeof apiKey?.organization_id === 'string') return apiKey.organization_id;
    } catch {
      // Optional replay organization path. Continue to user/org membership lookup.
    }
  }

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .maybeSingle();
    if (typeof profile?.organization_id === 'string') return profile.organization_id;
  } catch {
    // Optional replay organization path. Continue to membership lookup.
  }

  try {
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    return typeof membership?.organization_id === 'string' ? membership.organization_id : null;
  } catch {
    return null;
  }
}

export async function captureNextRoute(
  request: NextRequest,
  endpoint: string,
  requestBody: unknown,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const startedAt = Date.now();
  const { result, capture } = await withReplayCapture(
    {
      endpoint,
      requestBody,
      traceId: request.headers.get('x-seizn-trace-id') || request.headers.get('x-trace-id'),
    },
    handler
  );

  result.headers.set('X-Seizn-Replay-Trace-Id', capture.traceId);

  const organizationId = capture.organizationId;
  if (!organizationId) {
    return result;
  }

  try {
    const responseBody = await readResponseBody(result);
    await persistSnapshot(capture, {
      organizationId,
      apiKeyId: capture.apiKeyId,
      endpoint,
      requestBody,
      responseBody,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    logServerError('[replay] Snapshot persistence failed', error, {
      endpoint,
      traceId: capture.traceId,
    });
  }

  return result;
}

export function getActiveReplayTraceId(): string | null {
  return getReplayCapture()?.traceId ?? null;
}

export function buildSnapshotStubHash(toolCalls: unknown[]): string | null {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return null;
  return buildSnapshotContentHash(
    toolCalls.map((call) => {
      if (!call || typeof call !== 'object') return call;
      const record = call as Record<string, unknown>;
      const input = 'input' in record ? record.input : record.args;
      const name = record.name;
      const inputHash =
        typeof record.inputHash === 'string' ? record.inputHash : buildSnapshotContentHash(input);
      const stubHash =
        typeof record.stubHash === 'string'
          ? record.stubHash
          : buildSnapshotContentHash({ name, input });
      return {
        name,
        inputHash,
        stubHash,
      };
    })
  );
}

async function readResponseBody(response: NextResponse): Promise<unknown> {
  const clone = response.clone();
  const contentType = clone.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return clone.json().catch(() => null);
  }
  return clone.text().catch(() => null);
}

function sortForReplay(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForReplay);
  }

  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    return Object.keys(input)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortForReplay(input[key]);
        return acc;
      }, {});
  }

  return value;
}
