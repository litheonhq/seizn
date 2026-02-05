/**
 * SeiznCheckpointer Unit Tests
 *
 * Tests the LangGraph checkpoint saver backed by Supabase.
 * All Supabase calls are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SeiznCheckpointer,
  createSeiznCheckpointer,
  type Checkpoint,
  type CheckpointMetadata,
  type RunnableConfig,
} from './checkpointer';

// ---------------------------------------------------------------------------
// Mock Supabase
// ---------------------------------------------------------------------------

function mockCheckpointRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    thread_id: 'thread-abc',
    checkpoint_ns: '',
    checkpoint_id: 'cp-001',
    parent_checkpoint_id: null,
    type: 'json',
    checkpoint: {
      v: 1,
      id: 'cp-001',
      ts: '2026-01-01T00:00:00Z',
      channel_values: { messages: [] },
      channel_versions: { messages: 1 },
      versions_seen: {},
      pending_sends: [],
    },
    metadata: {
      source: 'input' as const,
      step: 0,
      writes: null,
      parents: {},
    },
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockSupabase() {
  let queryResult: { data: unknown; error: unknown } = { data: null, error: null };

  const builder: Record<string, unknown> = {};
  const methods = [
    'select', 'eq', 'lt', 'contains', 'order', 'limit', 'single',
    'insert', 'upsert', 'delete', 'update',
  ];

  for (const m of methods) {
    builder[m] = vi.fn().mockReturnValue(builder);
  }

  // Make the builder thenable so `await query` works
  (builder as any).then = (resolve: (v: unknown) => void) => {
    resolve(queryResult);
    return Promise.resolve(queryResult);
  };

  const supabase = {
    from: vi.fn().mockReturnValue(builder),
    _setResult(result: { data: unknown; error: unknown }) {
      queryResult = result;
    },
    _builder: builder,
  };

  return supabase;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SeiznCheckpointer', () => {
  let supabase: ReturnType<typeof createMockSupabase>;
  let checkpointer: SeiznCheckpointer;

  beforeEach(() => {
    supabase = createMockSupabase();
    checkpointer = new SeiznCheckpointer({ supabase: supabase as any });
  });

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  describe('constructor', () => {
    it('throws when supabase is not provided', () => {
      expect(() => new SeiznCheckpointer({ supabase: null as any })).toThrow(
        'SeiznCheckpointer requires a configured Supabase client'
      );
    });

    it('uses default table names', () => {
      const cp = new SeiznCheckpointer({ supabase: supabase as any });
      expect(cp).toBeDefined();
    });

    it('accepts custom table names', () => {
      const cp = new SeiznCheckpointer({
        supabase: supabase as any,
        checkpointTable: 'custom_cp',
        writesTable: 'custom_wr',
      });
      expect(cp).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // getTuple
  // -------------------------------------------------------------------------

  describe('getTuple', () => {
    it('throws when thread_id is missing', async () => {
      await expect(checkpointer.getTuple({ configurable: undefined } as any)).rejects.toThrow(
        'thread_id is required'
      );
    });

    it('returns undefined when no checkpoint exists', async () => {
      supabase._setResult({ data: [], error: null });
      const result = await checkpointer.getTuple({
        configurable: { thread_id: 'thread-abc' },
      });
      expect(result).toBeUndefined();
    });

    it('returns checkpoint tuple when found', async () => {
      const row = mockCheckpointRow();
      supabase._setResult({ data: [row], error: null });

      const result = await checkpointer.getTuple({
        configurable: { thread_id: 'thread-abc' },
      });

      expect(result).toBeDefined();
      expect(result!.config.configurable?.thread_id).toBe('thread-abc');
      expect(result!.checkpoint.id).toBe('cp-001');
      expect(result!.metadata?.step).toBe(0);
    });

    it('includes parentConfig when parent exists', async () => {
      const row = mockCheckpointRow({ parent_checkpoint_id: 'cp-000' });
      supabase._setResult({ data: [row], error: null });

      const result = await checkpointer.getTuple({
        configurable: { thread_id: 'thread-abc' },
      });

      expect(result!.parentConfig).toBeDefined();
      expect(result!.parentConfig!.configurable?.checkpoint_id).toBe('cp-000');
    });

    it('fetches specific checkpoint_id when provided', async () => {
      const row = mockCheckpointRow();
      supabase._setResult({ data: [row], error: null });

      await checkpointer.getTuple({
        configurable: { thread_id: 'thread-abc', checkpoint_id: 'cp-001' },
      });

      expect(supabase._builder.eq).toHaveBeenCalledWith('checkpoint_id', 'cp-001');
    });

    it('throws on Supabase error', async () => {
      supabase._setResult({ data: null, error: { message: 'DB error' } });
      await expect(
        checkpointer.getTuple({ configurable: { thread_id: 'thread-abc' } })
      ).rejects.toThrow('Failed to get checkpoint');
    });
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  describe('list', () => {
    it('throws when thread_id is missing', async () => {
      const gen = checkpointer.list({} as any);
      await expect(gen.next()).rejects.toThrow('thread_id is required');
    });

    it('yields checkpoints from Supabase', async () => {
      const rows = [
        mockCheckpointRow({ checkpoint_id: 'cp-002' }),
        mockCheckpointRow({ checkpoint_id: 'cp-001' }),
      ];
      supabase._setResult({ data: rows, error: null });

      const results = [];
      for await (const tuple of checkpointer.list({
        configurable: { thread_id: 'thread-abc' },
      })) {
        results.push(tuple);
      }

      expect(results).toHaveLength(2);
    });

    it('applies limit option', async () => {
      supabase._setResult({ data: [], error: null });

      const results = [];
      for await (const tuple of checkpointer.list(
        { configurable: { thread_id: 'thread-abc' } },
        { limit: 5 }
      )) {
        results.push(tuple);
      }

      expect(supabase._builder.limit).toHaveBeenCalledWith(5);
    });

    it('throws on Supabase error', async () => {
      supabase._setResult({ data: null, error: { message: 'List error' } });

      const gen = checkpointer.list({ configurable: { thread_id: 'thread-abc' } });
      await expect(gen.next()).rejects.toThrow('Failed to list checkpoints');
    });
  });

  // -------------------------------------------------------------------------
  // put
  // -------------------------------------------------------------------------

  describe('put', () => {
    const checkpoint: Checkpoint = {
      v: 1,
      id: 'cp-002',
      ts: '2026-01-01T00:00:00Z',
      channel_values: { messages: ['hello'] },
      channel_versions: { messages: 1 },
      versions_seen: {},
      pending_sends: [],
    };

    const metadata: CheckpointMetadata = {
      source: 'loop',
      step: 1,
      writes: null,
      parents: {},
    };

    it('throws when thread_id is missing', async () => {
      await expect(
        checkpointer.put({} as any, checkpoint, metadata, {})
      ).rejects.toThrow('thread_id is required');
    });

    it('saves checkpoint and returns updated config', async () => {
      supabase._setResult({ data: null, error: null });

      const config: RunnableConfig = {
        configurable: { thread_id: 'thread-abc', checkpoint_id: 'cp-001' },
      };

      const result = await checkpointer.put(config, checkpoint, metadata, { messages: 2 });

      expect(result.configurable?.thread_id).toBe('thread-abc');
      expect(result.configurable?.checkpoint_id).toBe('cp-002');
      expect(supabase.from).toHaveBeenCalledWith('langgraph_checkpoints');
      expect(supabase._builder.upsert).toHaveBeenCalled();
    });

    it('merges newVersions into channel_versions', async () => {
      supabase._setResult({ data: null, error: null });

      const config: RunnableConfig = {
        configurable: { thread_id: 'thread-abc' },
      };

      await checkpointer.put(config, checkpoint, metadata, { messages: 5 });

      const upsertCall = (supabase._builder.upsert as any).mock.calls[0][0];
      expect(upsertCall.checkpoint.channel_versions.messages).toBe(5);
    });

    it('throws on Supabase error', async () => {
      supabase._setResult({ data: null, error: { message: 'Save error' } });

      await expect(
        checkpointer.put(
          { configurable: { thread_id: 'thread-abc' } },
          checkpoint,
          metadata,
          {}
        )
      ).rejects.toThrow('Failed to save checkpoint');
    });
  });

  // -------------------------------------------------------------------------
  // putWrites
  // -------------------------------------------------------------------------

  describe('putWrites', () => {
    it('throws when thread_id is missing', async () => {
      await expect(
        checkpointer.putWrites({} as any, [['ch', 'val']], 'task-1')
      ).rejects.toThrow('thread_id is required');
    });

    it('throws when checkpoint_id is missing', async () => {
      await expect(
        checkpointer.putWrites(
          { configurable: { thread_id: 'thread-abc' } },
          [['ch', 'val']],
          'task-1'
        )
      ).rejects.toThrow('checkpoint_id is required');
    });

    it('does nothing for empty writes', async () => {
      await checkpointer.putWrites(
        { configurable: { thread_id: 'thread-abc', checkpoint_id: 'cp-001' } },
        [],
        'task-1'
      );
      // from() should not have been called for writes
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('persists writes with correct structure', async () => {
      supabase._setResult({ data: null, error: null });

      await checkpointer.putWrites(
        { configurable: { thread_id: 'thread-abc', checkpoint_id: 'cp-001' } },
        [['messages', { role: 'user', content: 'hi' }], ['state', { count: 1 }]],
        'task-1'
      );

      expect(supabase.from).toHaveBeenCalledWith('langgraph_writes');
      const upsertCall = (supabase._builder.upsert as any).mock.calls[0][0];
      expect(upsertCall).toHaveLength(2);
      expect(upsertCall[0].channel).toBe('messages');
      expect(upsertCall[0].idx).toBe(0);
      expect(upsertCall[1].channel).toBe('state');
      expect(upsertCall[1].idx).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // deleteThread
  // -------------------------------------------------------------------------

  describe('deleteThread', () => {
    it('deletes from both tables', async () => {
      supabase._setResult({ data: null, error: null });

      await checkpointer.deleteThread('thread-abc');

      // from() called for both tables
      expect(supabase.from).toHaveBeenCalledWith('langgraph_checkpoints');
      expect(supabase.from).toHaveBeenCalledWith('langgraph_writes');
    });

    it('filters by namespace when provided', async () => {
      supabase._setResult({ data: null, error: null });

      await checkpointer.deleteThread('thread-abc', 'ns-1');

      // eq should be called with checkpoint_ns
      expect(supabase._builder.eq).toHaveBeenCalledWith('checkpoint_ns', 'ns-1');
    });
  });

  // -------------------------------------------------------------------------
  // getWrites
  // -------------------------------------------------------------------------

  describe('getWrites', () => {
    it('throws when thread_id is missing', async () => {
      await expect(checkpointer.getWrites({} as any)).rejects.toThrow(
        'thread_id is required'
      );
    });

    it('throws when checkpoint_id is missing', async () => {
      await expect(
        checkpointer.getWrites({ configurable: { thread_id: 'thread-abc' } })
      ).rejects.toThrow('checkpoint_id is required');
    });

    it('returns empty array when no writes', async () => {
      supabase._setResult({ data: [], error: null });

      const result = await checkpointer.getWrites({
        configurable: { thread_id: 'thread-abc', checkpoint_id: 'cp-001' },
      });

      expect(result).toEqual([]);
    });

    it('returns writes as [channel, value] tuples', async () => {
      supabase._setResult({
        data: [
          { channel: 'messages', value: 'hello', idx: 0 },
          { channel: 'state', value: { count: 1 }, idx: 1 },
        ],
        error: null,
      });

      const result = await checkpointer.getWrites({
        configurable: { thread_id: 'thread-abc', checkpoint_id: 'cp-001' },
      });

      expect(result).toEqual([
        ['messages', 'hello'],
        ['state', { count: 1 }],
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // Factory
  // -------------------------------------------------------------------------

  describe('createSeiznCheckpointer', () => {
    it('returns a SeiznCheckpointer instance', () => {
      const cp = createSeiznCheckpointer({ supabase: supabase as any });
      expect(cp).toBeInstanceOf(SeiznCheckpointer);
    });
  });
});
