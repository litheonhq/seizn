import { describe, expect, it } from 'vitest';
import {
  buildSnapshotContentHash,
  canonicalizeForReplay,
} from '@/lib/replay/snapshot';
import { withReplayCapture, recordMemoryRead, recordMemoryWrite } from '@/lib/replay/capture';

describe('replay snapshot canonicalization', () => {
  it('hashes objects stably regardless of key order', () => {
    const a = {
      response: { b: 2, a: 1 },
      request: [{ z: true, a: false }],
    };
    const b = {
      request: [{ a: false, z: true }],
      response: { a: 1, b: 2 },
    };

    expect(canonicalizeForReplay(a)).toBe(canonicalizeForReplay(b));
    expect(buildSnapshotContentHash(a)).toBe(buildSnapshotContentHash(b));
  });

  it('captures reads and writes inside async context', async () => {
    const result = await withReplayCapture(
      {
        traceId: '00000000-0000-4000-8000-000000000001',
        endpoint: '/api/v1/memories',
        requestBody: { query: 'gate' },
      },
      async () => {
        recordMemoryRead({ entityId: 'npc_mira', memoryId: 'mem_1' });
        recordMemoryWrite({
          entityId: 'npc_mira',
          memoryId: 'mem_2',
          op: 'create',
          payload: { content: 'Mira saw the gate open.' },
        });
        return 'ok';
      }
    );

    expect(result.result).toBe('ok');
    expect(result.traceId).toBe('00000000-0000-4000-8000-000000000001');
    expect(result.capture.memoryReads).toHaveLength(1);
    expect(result.capture.memoryWrites).toHaveLength(1);
  });
});
