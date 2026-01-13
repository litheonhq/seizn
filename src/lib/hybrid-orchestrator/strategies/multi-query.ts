/**
 * Multi-Query Expansion Strategy
 *
 * Generates multiple query variations and aggregates results
 * for improved recall on complex or ambiguous queries.
 */

import { createServerClient } from '@/lib/supabase';
import { getVectorStore } from '@/lib/summer/vectorstore';
import { getEmbeddingProvider } from '@/lib/summer/embedding';
import type { VectorSearchResult } from '@/lib/summer/types';
import type {
  MultiQueryStrategyParams,
  StrategyResult,
  StrategyExecutionResult,
  QueryExpansionCache,
} from '../types';

/**
 * Execute multi-query expansion strategy
 *
 * 1. Expand the original query into multiple variations
 * 2. Execute vector search for each variation
 * 3. Aggregate and deduplicate results
 *
 * @param query - Original query text
 * @param queryEmbedding - Pre-computed embedding for original query
 * @param collectionId - Collection to search
 * @param userId - User ID for RLS
 * @param params - Multi-query strategy parameters
 * @returns Strategy execution result with timing
 */
export async function multiQuerySearch(
  query: string,
  queryEmbedding: number[],
  collectionId: string,
  userId: string,
  params: MultiQueryStrategyParams
): Promise<StrategyExecutionResult> {
  const startTime = performance.now();

  try {
    // Step 1: Get expanded queries
    const expandedQueries = await getExpandedQueries(
      query,
      userId,
      params.num_expansions,
      params.expansion_method,
      params.use_cache ?? true
    );

    // Step 2: Generate embeddings for expanded queries
    const embeddingProvider = getEmbeddingProvider();
    const allQueries = [query, ...expandedQueries];
    const allEmbeddings = await embeddingProvider.embed(allQueries, 'query');

    // Use pre-computed embedding for original query if available
    allEmbeddings[0] = queryEmbedding;

    // Step 3: Execute searches in parallel
    const vectorStore = getVectorStore();
    const searchPromises = allEmbeddings.map((embedding) =>
      vectorStore.search({
        userId,
        collectionId,
        queryEmbedding: embedding,
        topK: params.top_k,
      })
    );

    const searchResultsArray = await Promise.all(searchPromises);

    // Step 4: Aggregate and deduplicate results
    const aggregatedResults = aggregateResults(searchResultsArray);
    const latencyMs = performance.now() - startTime;

    return {
      strategyType: 'multi_query',
      results: aggregatedResults,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = performance.now() - startTime;
    return {
      strategyType: 'multi_query',
      results: [],
      latencyMs,
      error:
        error instanceof Error ? error.message : 'Multi-query search failed',
    };
  }
}

/**
 * Get expanded queries (with caching)
 */
async function getExpandedQueries(
  query: string,
  userId: string,
  numExpansions: number,
  method: 'llm' | 'synonyms' | 'embedding_nn',
  useCache: boolean
): Promise<string[]> {
  const queryHash = hashQuery(query);

  // Check cache first
  if (useCache) {
    const cached = await getCachedExpansion(userId, queryHash);
    if (cached) {
      await incrementCacheHit(userId, queryHash);
      return cached.expandedQueries.slice(0, numExpansions);
    }
  }

  // Generate expansions
  let expandedQueries: string[];

  switch (method) {
    case 'llm':
      expandedQueries = await expandWithLLM(query, numExpansions);
      break;
    case 'synonyms':
      expandedQueries = expandWithSynonyms(query, numExpansions);
      break;
    case 'embedding_nn':
      expandedQueries = await expandWithEmbeddingNN(query, numExpansions);
      break;
    default:
      expandedQueries = [];
  }

  // Cache the expansion
  if (useCache && expandedQueries.length > 0) {
    await cacheExpansion(userId, query, queryHash, expandedQueries, method);
  }

  return expandedQueries;
}

/**
 * Expand query using LLM
 */
async function expandWithLLM(
  query: string,
  numExpansions: number
): Promise<string[]> {
  // In production, this would call an LLM API
  // For now, return simple variations
  const variations: string[] = [];

  // Simple rule-based expansion (placeholder for LLM)
  const questionWords = ['what', 'how', 'why', 'when', 'where', 'which'];
  const queryLower = query.toLowerCase();

  // Add question form if not already a question
  if (!questionWords.some((w) => queryLower.startsWith(w))) {
    variations.push(`What is ${query}?`);
    variations.push(`How does ${query} work?`);
  }

  // Add broader/narrower variations
  variations.push(`${query} explained`);
  variations.push(`${query} definition`);
  variations.push(`examples of ${query}`);

  return variations.slice(0, numExpansions);
}

/**
 * Expand query using synonyms (simple rule-based)
 */
function expandWithSynonyms(query: string, numExpansions: number): string[] {
  // Simple synonym mapping (in production, use a thesaurus API)
  const synonymMap: Record<string, string[]> = {
    create: ['make', 'generate', 'build'],
    delete: ['remove', 'erase', 'clear'],
    update: ['modify', 'change', 'edit'],
    find: ['search', 'locate', 'discover'],
    error: ['issue', 'problem', 'bug'],
    fix: ['resolve', 'repair', 'correct'],
    fast: ['quick', 'rapid', 'efficient'],
    slow: ['sluggish', 'delayed', 'lagging'],
  };

  const words = query.toLowerCase().split(/\s+/);
  const variations: string[] = [];

  for (const word of words) {
    const synonyms = synonymMap[word];
    if (synonyms) {
      for (const synonym of synonyms) {
        const variation = query.replace(
          new RegExp(`\\b${word}\\b`, 'gi'),
          synonym
        );
        if (variation !== query && !variations.includes(variation)) {
          variations.push(variation);
        }
      }
    }
  }

  return variations.slice(0, numExpansions);
}

/**
 * Expand query using embedding nearest neighbors
 * (placeholder - would require a pre-computed query bank)
 */
async function expandWithEmbeddingNN(
  query: string,
  numExpansions: number
): Promise<string[]> {
  // In production, this would:
  // 1. Embed the query
  // 2. Find nearest neighbor queries from a pre-built query bank
  // 3. Return similar queries

  // For now, return empty (fall back to original query only)
  return [];
}

/**
 * Aggregate results from multiple searches
 */
function aggregateResults(
  searchResultsArray: VectorSearchResult[][]
): StrategyResult[] {
  // Map to track best score per chunk
  const chunkBestScore = new Map<
    string,
    { score: number; data: VectorSearchResult }
  >();

  for (const results of searchResultsArray) {
    for (const result of results) {
      const existing = chunkBestScore.get(result.chunkId);
      if (!existing || result.similarity > existing.score) {
        chunkBestScore.set(result.chunkId, {
          score: result.similarity,
          data: result,
        });
      }
    }
  }

  // Convert to array and sort by score
  const aggregated = Array.from(chunkBestScore.entries())
    .map(([id, { score, data }]) => ({
      id,
      score,
      rank: 0, // Will be set after sorting
      data,
    }))
    .sort((a, b) => b.score - a.score);

  // Assign ranks
  aggregated.forEach((result, index) => {
    result.rank = index + 1;
  });

  return aggregated;
}

/**
 * Simple hash function for query caching
 */
function hashQuery(query: string): string {
  let hash = 0;
  const normalized = query.toLowerCase().trim();
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

/**
 * Get cached expansion from database
 */
async function getCachedExpansion(
  userId: string,
  queryHash: string
): Promise<QueryExpansionCache | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('multi_query_cache')
    .select('*')
    .eq('user_id', userId)
    .eq('original_query_hash', queryHash)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) {
    return null;
  }

  return {
    originalQuery: data.original_query,
    expandedQueries: data.expanded_queries,
    expansionMethod: data.expansion_method,
    hitCount: data.hit_count,
    expiresAt: new Date(data.expires_at),
  };
}

/**
 * Cache expansion in database
 */
async function cacheExpansion(
  userId: string,
  query: string,
  queryHash: string,
  expandedQueries: string[],
  method: 'llm' | 'synonyms' | 'embedding_nn'
): Promise<void> {
  const supabase = createServerClient();

  await supabase.from('multi_query_cache').upsert({
    user_id: userId,
    original_query_hash: queryHash,
    original_query: query,
    expanded_queries: expandedQueries,
    expansion_method: method,
    hit_count: 0,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
  });
}

/**
 * Increment cache hit count
 */
async function incrementCacheHit(
  userId: string,
  queryHash: string
): Promise<void> {
  const supabase = createServerClient();

  await supabase.rpc('increment_mq_cache_hit', {
    p_user_id: userId,
    p_query_hash: queryHash,
  });
}

/**
 * Validate multi-query strategy parameters
 */
export function validateMultiQueryParams(
  params: Partial<MultiQueryStrategyParams>
): MultiQueryStrategyParams {
  return {
    top_k: Math.max(1, Math.min(50, params.top_k ?? 10)),
    num_expansions: Math.max(1, Math.min(5, params.num_expansions ?? 3)),
    expansion_method: params.expansion_method ?? 'synonyms',
    use_cache: params.use_cache ?? true,
  };
}

/**
 * Default multi-query strategy parameters
 */
export const DEFAULT_MULTI_QUERY_PARAMS: MultiQueryStrategyParams = {
  top_k: 10,
  num_expansions: 3,
  expansion_method: 'synonyms',
  use_cache: true,
};
