import { describe, expect, it } from 'vitest';
import {
  diffSnapshotRecords,
  findFirstDivergence,
  replaySnapshotRecord,
} from '@/lib/replay/replay';
import {
  buildSnapshotContentHash,
  type ReplaySnapshotRecord,
} from '@/lib/replay/snapshot';

describe('replay engine', () => {
  it('finds the first stable divergence path', () => {
    const divergence = findFirstDivergence(
      { response: { memories: [{ id: 'm1', content: 'old' }] } },
      { response: { memories: [{ id: 'm1', content: 'new' }] } }
    );

    expect(divergence).toEqual({
      path: '$.response.memories[0].content',
      original: 'old',
      replayed: 'new',
    });
  });

  it('replays a mocked snapshot without recalling providers or tools', () => {
    const snapshot = makeSnapshot({
      response_body: { answer: 'Mira remembers the old gate.' },
      memory_reads: [{ entityId: 'npc_mira', memoryId: 'mem_1' }],
      tool_calls: [{ name: 'weather', args: {}, result: 'clear' }],
    });

    const replay = replaySnapshotRecord(snapshot, { mockLLM: true, mockTools: true });

    expect(replay.matchesOriginal).toBe(true);
    expect(replay.newResponseBody).toEqual(snapshot.response_body);
    expect(replay.newCapture.memoryReads).toHaveLength(1);
  });

  it('diffs two snapshots at the response divergence point', () => {
    const a = makeSnapshot({ response_body: { answer: 'old' } });
    const b = makeSnapshot({ response_body: { answer: 'new' } });

    expect(diffSnapshotRecords(a, b)).toEqual({
      path: '$.response_body.answer',
      original: 'old',
      replayed: 'new',
    });
  });
});

function makeSnapshot(overrides: Partial<ReplaySnapshotRecord>): ReplaySnapshotRecord {
  const base: ReplaySnapshotRecord = {
    trace_id: '00000000-0000-4000-8000-000000000001',
    organization_id: '00000000-0000-4000-8000-000000000010',
    api_key_id: null,
    endpoint: '/api/v1/memories',
    request_body: { query: 'gate' },
    response_body: { answer: 'ok' },
    memory_reads: [],
    memory_writes: [],
    tool_calls: [],
    llm_seed: null,
    llm_model: null,
    llm_provider: null,
    stub_hash: null,
    content_hash: '',
    duration_ms: 12,
    created_at: '2026-04-21T00:00:00.000Z',
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
