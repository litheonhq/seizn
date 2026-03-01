import type { SearchMode } from '@/lib/memory/auto-router';

export type SearchExecutionMode = Exclude<SearchMode, 'auto'>;
export type SearchFallbackReason = 'search_error' | 'zero_results' | 'post_filter_zero_results';

export interface SearchFallbackInfo {
  applied: boolean;
  from: SearchExecutionMode;
  to: 'keyword';
  reason: SearchFallbackReason;
}

export interface ExecuteMemorySearchParams<TRow> {
  rpcCall: (
    fn:
      | 'keyword_search_memories'
      | 'hybrid_search_memories'
      | 'search_memories'
      | 'keyword_search_memories_bounded'
      | 'hybrid_search_memories_bounded'
      | 'search_memories_bounded',
    args: Record<string, unknown>
  ) => Promise<{ data: TRow[] | null; error: unknown }>;
  initialMode: SearchExecutionMode;
  queryText: string;
  userId: string;
  limit: number;
  namespaceParam: string | null;
  threshold: number;
  searchTimeoutMs?: number;
  createQueryEmbedding: (query: string) => Promise<number[]>;
  applyFilters: (input: TRow[] | null) => TRow[] | null;
}

export interface ExecuteMemorySearchResult<TRow> {
  results: TRow[] | null;
  resolvedMode: SearchExecutionMode;
  fallback: SearchFallbackInfo | null;
  error: Error | null;
}

function normalizeError(error: unknown): Error | null {
  if (!error) return null;
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);
  if (typeof error === 'object' && error !== null) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.length > 0) {
      return new Error(maybeMessage);
    }
  }
  return new Error('unknown_search_error');
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number | undefined,
  label: 'embedding' | 'rpc'
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label}_timeout`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function runModeSearch<TRow>(
  params: ExecuteMemorySearchParams<TRow>,
  mode: SearchExecutionMode
): Promise<{ data: TRow[] | null; error: Error | null }> {
  const useBoundedRpc = Boolean(params.searchTimeoutMs && params.searchTimeoutMs > 0);
  const timeoutArgs = useBoundedRpc ? { statement_timeout_ms: params.searchTimeoutMs } : {};

  try {
    if (mode === 'keyword') {
      const { data, error } = await withTimeout(
        params.rpcCall(useBoundedRpc ? 'keyword_search_memories_bounded' : 'keyword_search_memories', {
          query_text: params.queryText,
          match_user_id: params.userId,
          match_count: params.limit,
          match_namespace: params.namespaceParam,
          ...timeoutArgs,
        }),
        params.searchTimeoutMs,
        'rpc'
      );
      return { data, error: normalizeError(error) };
    }

    if (mode === 'hybrid') {
      const queryEmbedding = await withTimeout(
        params.createQueryEmbedding(params.queryText),
        params.searchTimeoutMs,
        'embedding'
      );
      const { data, error } = await withTimeout(
        params.rpcCall(useBoundedRpc ? 'hybrid_search_memories_bounded' : 'hybrid_search_memories', {
          query_text: params.queryText,
          query_embedding: queryEmbedding,
          match_user_id: params.userId,
          match_count: params.limit,
          match_threshold: params.threshold,
          match_namespace: params.namespaceParam,
          keyword_weight: 0.3,
          vector_weight: 0.7,
          ...timeoutArgs,
        }),
        params.searchTimeoutMs,
        'rpc'
      );
      return { data, error: normalizeError(error) };
    }

    const queryEmbedding = await withTimeout(
      params.createQueryEmbedding(params.queryText),
      params.searchTimeoutMs,
      'embedding'
    );
    const { data, error } = await withTimeout(
      params.rpcCall(useBoundedRpc ? 'search_memories_bounded' : 'search_memories', {
        query_embedding: queryEmbedding,
        match_user_id: params.userId,
        match_count: params.limit,
        match_threshold: params.threshold,
        match_namespace: params.namespaceParam,
        ...timeoutArgs,
      }),
      params.searchTimeoutMs,
      'rpc'
    );
    return { data, error: normalizeError(error) };
  } catch (error) {
    return { data: null, error: normalizeError(error) };
  }
}

export async function executeMemorySearch<TRow>(
  params: ExecuteMemorySearchParams<TRow>
): Promise<ExecuteMemorySearchResult<TRow>> {
  let results: TRow[] | null = null;
  let searchError: Error | null = null;
  let resolvedMode: SearchExecutionMode = params.initialMode;
  let fallback: SearchFallbackInfo | null = null;

  const tryKeywordFallback = async (reason: SearchFallbackReason): Promise<boolean> => {
    if (resolvedMode === 'keyword') return false;
    const fromMode = resolvedMode;
    const { data: fallbackData, error: fallbackError } = await runModeSearch(
      params,
      'keyword'
    );

    if (!fallbackError && fallbackData && fallbackData.length > 0) {
      results = fallbackData;
      fallback = {
        applied: true,
        from: fromMode,
        to: 'keyword',
        reason,
      };
      resolvedMode = 'keyword';
      searchError = null;
      return true;
    }

    if (fallbackError) {
      searchError = fallbackError;
    }
    return false;
  };

  const initialSearch = await runModeSearch(params, params.initialMode);
  results = initialSearch.data;
  searchError = initialSearch.error;

  if (searchError && params.initialMode !== 'keyword') {
    await tryKeywordFallback('search_error');
  }
  if (searchError) {
    return { results, resolvedMode, fallback, error: searchError };
  }

  if ((!results || results.length === 0) && params.initialMode !== 'keyword') {
    await tryKeywordFallback('zero_results');
  }

  results = params.applyFilters(results);

  if ((!results || results.length === 0) && resolvedMode !== 'keyword') {
    const recovered = await tryKeywordFallback('post_filter_zero_results');
    if (recovered) {
      results = params.applyFilters(results);
    }
  }

  return { results, resolvedMode, fallback, error: null };
}
