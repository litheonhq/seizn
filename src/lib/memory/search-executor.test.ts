import { describe, expect, it } from 'vitest';
import {
  executeMemorySearch,
  type ExecuteMemorySearchParams,
  type SearchExecutionMode,
} from '@/lib/memory/search-executor';

type Row = { id: string; content?: string };

type RpcFn =
  | 'keyword_search_memories'
  | 'hybrid_search_memories'
  | 'search_memories'
  | 'keyword_search_memories_bounded'
  | 'hybrid_search_memories_bounded'
  | 'search_memories_bounded';

function createRpcStub(
  plan: Partial<Record<RpcFn, Array<{ data: Row[] | null; error: unknown }>>>
): ExecuteMemorySearchParams<Row>['rpcCall'] {
  return async (fn) => {
    const queue = plan[fn];
    if (!queue || queue.length === 0) {
      throw new Error(`No stub response configured for ${fn}`);
    }
    return queue.shift() as { data: Row[] | null; error: unknown };
  };
}

function baseParams(
  overrides: Partial<ExecuteMemorySearchParams<Row>>
): ExecuteMemorySearchParams<Row> {
  const params: ExecuteMemorySearchParams<Row> = {
    rpcCall: async () => ({ data: [], error: null }),
    initialMode: 'keyword',
    queryText: 'test query',
    userId: 'user-1',
    limit: 10,
    namespaceParam: null,
    threshold: 0.7,
    createQueryEmbedding: async () => [0.1, 0.2],
    applyFilters: (input) => input,
  };
  return { ...params, ...overrides };
}

describe('executeMemorySearch', () => {
  it('returns keyword results without fallback when keyword search succeeds', async () => {
    const result = await executeMemorySearch<Row>(
      baseParams({
        rpcCall: createRpcStub({
          keyword_search_memories: [{ data: [{ id: 'k1' }], error: null }],
        }),
        initialMode: 'keyword',
      })
    );

    expect(result.error).toBeNull();
    expect(result.resolvedMode).toBe('keyword');
    expect(result.fallback).toBeNull();
    expect(result.results).toEqual([{ id: 'k1' }]);
  });

  it('falls back to keyword when semantic search errors', async () => {
    const result = await executeMemorySearch<Row>(
      baseParams({
        rpcCall: createRpcStub({
          search_memories: [{ data: null, error: { message: 'rpc failed' } }],
          keyword_search_memories: [{ data: [{ id: 'fallback-1' }], error: null }],
        }),
        initialMode: 'vector',
      })
    );

    expect(result.error).toBeNull();
    expect(result.resolvedMode).toBe('keyword');
    expect(result.fallback?.reason).toBe('search_error');
    expect(result.results).toEqual([{ id: 'fallback-1' }]);
  });

  it('falls back to keyword on zero results before filters', async () => {
    const result = await executeMemorySearch<Row>(
      baseParams({
        rpcCall: createRpcStub({
          hybrid_search_memories: [{ data: [], error: null }],
          keyword_search_memories: [{ data: [{ id: 'fallback-2' }], error: null }],
        }),
        initialMode: 'hybrid',
      })
    );

    expect(result.error).toBeNull();
    expect(result.resolvedMode).toBe('keyword');
    expect(result.fallback?.reason).toBe('zero_results');
    expect(result.results).toEqual([{ id: 'fallback-2' }]);
  });

  it('falls back to keyword when filters remove all results', async () => {
    let filterRuns = 0;
    const result = await executeMemorySearch<Row>(
      baseParams({
        rpcCall: createRpcStub({
          search_memories: [{ data: [{ id: 's1' }], error: null }],
          keyword_search_memories: [{ data: [{ id: 'fallback-3' }], error: null }],
        }),
        initialMode: 'vector',
        applyFilters: (input) => {
          filterRuns += 1;
          if (filterRuns === 1) return [];
          return input;
        },
      })
    );

    expect(result.error).toBeNull();
    expect(result.resolvedMode).toBe('keyword');
    expect(result.fallback?.reason).toBe('post_filter_zero_results');
    expect(result.results).toEqual([{ id: 'fallback-3' }]);
  });

  it('returns error when keyword mode fails and no fallback is possible', async () => {
    const result = await executeMemorySearch<Row>(
      baseParams({
        rpcCall: createRpcStub({
          keyword_search_memories: [{ data: null, error: { message: 'keyword failed' } }],
        }),
        initialMode: 'keyword' as SearchExecutionMode,
      })
    );

    expect(result.error).not.toBeNull();
    expect(result.error?.message).toBe('keyword failed');
    expect(result.fallback).toBeNull();
  });

  it('falls back to keyword when vector embedding times out', async () => {
    const result = await executeMemorySearch<Row>(
      baseParams({
        rpcCall: createRpcStub({
          keyword_search_memories_bounded: [{ data: [{ id: 'timeout-fallback' }], error: null }],
        }),
        initialMode: 'vector',
        searchTimeoutMs: 5,
        createQueryEmbedding: async () =>
          await new Promise<number[]>((resolve) => setTimeout(() => resolve([0.1, 0.2]), 20)),
      })
    );

    expect(result.error).toBeNull();
    expect(result.resolvedMode).toBe('keyword');
    expect(result.fallback?.reason).toBe('search_error');
    expect(result.results).toEqual([{ id: 'timeout-fallback' }]);
  });

  it('returns timeout error when keyword search times out', async () => {
    const result = await executeMemorySearch<Row>(
      baseParams({
        rpcCall: async () =>
          await new Promise((resolve) =>
            setTimeout(() => resolve({ data: [{ id: 'late' }], error: null }), 20)
          ),
        initialMode: 'keyword',
        searchTimeoutMs: 5,
      })
    );

    expect(result.error?.message).toBe('rpc_timeout');
    expect(result.fallback).toBeNull();
  });

  it('uses bounded RPC names when timeout budget is enabled', async () => {
    const calledFns: string[] = [];
    const result = await executeMemorySearch<Row>(
      baseParams({
        rpcCall: async (fn) => {
          calledFns.push(fn);
          return { data: [{ id: 'bounded-1' }], error: null };
        },
        initialMode: 'keyword',
        searchTimeoutMs: 100,
      })
    );

    expect(result.error).toBeNull();
    expect(result.results).toEqual([{ id: 'bounded-1' }]);
    expect(calledFns).toEqual(['keyword_search_memories_bounded']);
  });
});
