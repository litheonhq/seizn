type DegradedSearchRow = {
  id: string;
  content: string;
  memory_type?: string | null;
};

type DegradedSearchError = {
  message?: string | null;
};

type DegradedSearchQueryBuilder = {
  eq: (column: string, value: string | boolean) => DegradedSearchQueryBuilder;
  order: (
    column: string,
    options: { ascending: boolean }
  ) => DegradedSearchQueryBuilder;
  limit: (value: number) => DegradedSearchQueryBuilder;
  or: (
    expression: string
  ) => PromiseLike<{ data: DegradedSearchRow[] | null; error: DegradedSearchError | null }>;
  ilike: (
    column: string,
    value: string
  ) => PromiseLike<{ data: DegradedSearchRow[] | null; error: DegradedSearchError | null }>;
};

type DegradedSearchClient = {
  from: (table: 'memories') => {
    select: (columns: string) => DegradedSearchQueryBuilder;
  };
};

export type DegradedKeywordSearchResult = {
  id: string;
  content: string;
  memory_type?: string;
  similarity: number;
};

function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}

export function shouldUseDegradedKeywordSearchFallback(error: Error): boolean {
  const message = error.message.toLowerCase();
  const missingSearchFunction =
    message.includes('does not exist') &&
    (message.includes('keyword_search_memories') ||
      message.includes('hybrid_search_memories') ||
      message.includes('search_memories'));

  return (
    message.includes('operator does not exist: text = uuid') ||
    missingSearchFunction
  );
}

export async function runDegradedKeywordSearch(params: {
  supabase: unknown;
  userId: string;
  queryText: string;
  namespaceParam?: string | null;
  limit: number;
}): Promise<{ results: DegradedKeywordSearchResult[]; error: Error | null }> {
  const supabase = params.supabase as DegradedSearchClient;

  let queryBuilder = supabase
    .from('memories')
    .select('id, content, memory_type, created_at')
    .eq('user_id', params.userId)
    .eq('is_deleted', false);

  if (params.namespaceParam) {
    queryBuilder = queryBuilder.eq('namespace', params.namespaceParam);
  }

  queryBuilder = queryBuilder
    .order('created_at', { ascending: false })
    .limit(params.limit);

  const normalizedQuery = params.queryText.trim();
  if (normalizedQuery.length > 0) {
    const terms = Array.from(
      new Set(
        normalizedQuery
          .toLowerCase()
          .split(/\s+/)
          .map((term) => term.replace(/[^\p{L}\p{N}_-]/gu, ''))
          .filter((term) => term.length >= 2)
      )
    ).slice(0, 5);

    const { data, error } =
      terms.length > 0
        ? await queryBuilder.or(
            terms
              .map((term) => `content.ilike.%${escapeLikePattern(term)}%`)
              .join(',')
          )
        : await queryBuilder.ilike(
            'content',
            `%${escapeLikePattern(normalizedQuery)}%`
          );

    if (error) {
      return {
        results: [],
        error: new Error(error.message || 'degraded_keyword_search_failed'),
      };
    }

    return {
      results: (data || []).map((row, index) => ({
        id: row.id,
        content: row.content,
        memory_type: row.memory_type || undefined,
        similarity: Math.max(0.1, 1 - index * 0.05),
      })),
      error: null,
    };
  }

  const { data, error } = await queryBuilder.ilike('content', '%%');
  if (error) {
    return {
      results: [],
      error: new Error(error.message || 'degraded_keyword_search_failed'),
    };
  }

  return {
    results: (data || []).map((row, index) => ({
      id: row.id,
      content: row.content,
      memory_type: row.memory_type || undefined,
      similarity: Math.max(0.1, 1 - index * 0.05),
    })),
    error: null,
  };
}
