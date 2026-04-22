import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { buildSnapshotContentHash, type ReplaySnapshotRecord } from '@/lib/replay/snapshot';
import {
  buildToolStubHash,
  buildToolStubInputHash,
} from '@/lib/replay/tool-stub';
import {
  diffReplays,
  replayResultFromSnapshot,
  replaySnapshot,
} from '@/lib/replay/runner';
import { POST as rerunPOST } from '@/app/api/replay/[snapshotId]/rerun/route';
import { GET as diffGET } from '@/app/api/replay/[snapshotId]/diff/route';

const authState = vi.hoisted(() => ({
  auth: vi.fn(),
}));

const dbState = vi.hoisted(() => ({
  snapshots: new Map<string, Record<string, unknown>>(),
  diffs: [] as Record<string, unknown>[],
  insertCalls: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  organizationId: '00000000-0000-4000-8000-000000000222',
  profilePlan: 'pro',
  subscriptionEndsAt: null as string | null,
}));

vi.mock('@/lib/auth', () => ({
  auth: authState.auth,
}));

vi.mock('@/lib/server/logger', () => ({
  logServerError: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(() => ({
    from: (table: string) => createBuilder(table),
  })),
}));

const TRACE_ID = '00000000-0000-4000-8000-000000000111';
const USER_ID = 'profile-1';

describe('replay runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.snapshots.clear();
    dbState.diffs.length = 0;
    dbState.insertCalls.length = 0;
    dbState.organizationId = '00000000-0000-4000-8000-000000000222';
    dbState.profilePlan = 'pro';
    dbState.subscriptionEndsAt = null;
    authState.auth.mockResolvedValue({ user: { id: USER_ID } });

    const snapshot = makeSnapshot();
    dbState.snapshots.set(snapshot.trace_id, snapshot as unknown as Record<string, unknown>);
  });

  it('replays a known snapshot with the same content hash', async () => {
    const snapshot = dbState.snapshots.get(TRACE_ID) as unknown as ReplaySnapshotRecord;
    const replayed = await replaySnapshot(TRACE_ID, { organizationId: snapshot.organization_id });
    const diff = diffReplays(replayResultFromSnapshot(snapshot), replayed);

    expect(replayed.contentHash).toBe(snapshot.content_hash);
    expect(replayed.outputContentHash).toBe(buildSnapshotContentHash(snapshot.response_body));
    expect(diff.matches).toBe(true);
    expect(diff.outputContentHashChanged).toBe(false);
  });

  it('reports changed memory writes in the structured diff', () => {
    const originalSnapshot = makeSnapshot();
    const tamperedSnapshot = makeSnapshot({
      memory_writes: [
        {
          entityId: 'npc_mira',
          memoryId: 'mem-1',
          op: 'update',
          payload: { content: 'new gate' },
          timestamp: '2026-04-22T00:00:02.000Z',
        },
      ],
    });

    const diff = diffReplays(
      replayResultFromSnapshot(originalSnapshot),
      replayResultFromSnapshot(tamperedSnapshot)
    );

    expect(diff.matches).toBe(false);
    expect(diff.memoryWritesChanged).toHaveLength(1);
    expect(diff.memoryWritesChanged[0].original?.payload).toEqual({ content: 'old gate' });
    expect(diff.memoryWritesChanged[0].replayed?.payload).toEqual({ content: 'new gate' });
  });

  it('surfaces missing tool stubs as tool call mismatches', async () => {
    const snapshot = dbState.snapshots.get(TRACE_ID) as unknown as ReplaySnapshotRecord;
    const replayed = await replaySnapshot(TRACE_ID, {
      organizationId: snapshot.organization_id,
      stubs: new Map(),
    });
    const diff = diffReplays(replayResultFromSnapshot(snapshot), replayed);

    expect(replayed.missingToolStubs).toHaveLength(1);
    expect(diff.toolCallMismatches.some((item) => item.reason === 'missing_replay_stub')).toBe(
      true
    );
  });

  it('returns 403 for non-Pro rerun requests', async () => {
    dbState.profilePlan = 'studio';

    const response = await rerunPOST(makeRequest(`/api/replay/${TRACE_ID}/rerun`, 'POST'), {
      params: Promise.resolve({ snapshotId: TRACE_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('plan_required');
    expect(dbState.diffs).toHaveLength(0);
  });

  it('persists a replay diff and returns it through the diff route', async () => {
    const postResponse = await rerunPOST(makeRequest(`/api/replay/${TRACE_ID}/rerun`, 'POST'), {
      params: Promise.resolve({ snapshotId: TRACE_ID }),
    });
    const postBody = await postResponse.json();

    expect(postResponse.status).toBe(200);
    expect(postBody.data.diff.matches).toBe(true);
    expect(dbState.insertCalls[0].table).toBe('replay_diffs');
    expect(dbState.diffs).toHaveLength(1);

    const getResponse = await diffGET(makeRequest(`/api/replay/${TRACE_ID}/diff`, 'GET'), {
      params: Promise.resolve({ snapshotId: TRACE_ID }),
    });
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getBody.data.diff.matches).toBe(true);
    expect(getBody.data.seedMatch).toBe(true);
    expect(getBody.data.outputMatch).toBe(true);
  });

  it('returns 404 when a diff has not been generated', async () => {
    const response = await diffGET(makeRequest(`/api/replay/${TRACE_ID}/diff`, 'GET'), {
      params: Promise.resolve({ snapshotId: TRACE_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('not_found');
  });
});

function createBuilder(table: string) {
  const filters: Record<string, unknown> = {};
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((key: string, value: unknown) => {
      filters[key] = value;
      return builder;
    }),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => {
      if (table === 'profiles') {
        return {
          data: {
            organization_id: dbState.organizationId,
            plan: dbState.profilePlan,
            subscription_ends_at: dbState.subscriptionEndsAt,
          },
          error: null,
        };
      }

      if (table === 'replay_snapshots') {
        const snapshot = dbState.snapshots.get(String(filters.trace_id));
        if (!snapshot) return { data: null, error: null };
        if (
          filters.organization_id &&
          snapshot.organization_id !== filters.organization_id
        ) {
          return { data: null, error: null };
        }
        return { data: snapshot, error: null };
      }

      if (table === 'replay_diffs') {
        const diff = dbState.diffs.find(
          (item) =>
            item.snapshot_id === filters.snapshot_id &&
            item.organization_id === filters.organization_id
        );
        return { data: diff ?? null, error: null };
      }

      return { data: null, error: null };
    }),
    insert: vi.fn(async (payload: Record<string, unknown>) => {
      dbState.insertCalls.push({ table, payload });
      if (table === 'replay_diffs') {
        dbState.diffs.unshift({
          id: 'diff-1',
          replayed_at: '2026-04-22T00:00:10.000Z',
          created_at: '2026-04-22T00:00:10.000Z',
          ...payload,
        });
      }
      return { data: null, error: null };
    }),
  };

  return builder;
}

function makeRequest(path: string, method: string): NextRequest {
  return new NextRequest(new URL(path, 'https://test.seizn.com'), { method });
}

function makeSnapshot(overrides: Partial<ReplaySnapshotRecord> = {}): ReplaySnapshotRecord {
  const toolInput = { prompt: 'open the old gate' };
  const toolOutput = { text: 'gate opened' };
  const inputHash = buildToolStubInputHash(toolInput);
  const stubHash = buildToolStubHash('llm.test.model', toolInput);

  const base: ReplaySnapshotRecord = {
    trace_id: TRACE_ID,
    organization_id: '00000000-0000-4000-8000-000000000222',
    api_key_id: null,
    endpoint: '/api/replay-fixture',
    request_body: { query: 'old gate' },
    response_body: { answer: 'The old gate is open.' },
    memory_reads: [
      {
        entityId: 'npc_mira',
        memoryId: 'mem-0',
        timestamp: '2026-04-22T00:00:01.000Z',
      },
    ],
    memory_writes: [
      {
        entityId: 'npc_mira',
        memoryId: 'mem-1',
        op: 'update',
        payload: { content: 'old gate' },
        timestamp: '2026-04-22T00:00:02.000Z',
      },
    ],
    tool_calls: [
      {
        name: 'llm.test.model',
        args: toolInput,
        result: toolOutput,
        input: toolInput,
        output: toolOutput,
        latencyMs: 8,
        inputHash,
        stubHash,
        timestamp: '2026-04-22T00:00:03.000Z',
      },
    ],
    llm_seed: 42,
    llm_model: 'test-model',
    llm_provider: 'test-provider',
    stub_hash: stubHash,
    content_hash: '',
    duration_ms: 12,
    created_at: '2026-04-22T00:00:04.000Z',
    ...overrides,
  };

  base.content_hash = buildSnapshotContentHash({
    traceId: base.trace_id,
    endpoint: base.endpoint,
    requestBody: base.request_body,
    responseBody: base.response_body,
    memoryReads: base.memory_reads,
    memoryWrites: base.memory_writes,
    toolCalls: base.tool_calls,
    llmSeed: base.llm_seed,
    llmModel: base.llm_model,
    llmProvider: base.llm_provider,
  });

  return base;
}
