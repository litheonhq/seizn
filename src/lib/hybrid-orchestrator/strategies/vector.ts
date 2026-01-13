/**
 * Vector Search Strategy
 *
 * Uses semantic similarity via embeddings to find relevant documents.
 */

import { getVectorStore } from '@/lib/summer/vectorstore';
import type { VectorSearchResult } from '@/lib/summer/types';
import type {
  VectorStrategyParams,
  StrategyResult,
  StrategyExecutionResult,
} from '../types';

/**
 * Execute vector search strategy
 *
 * @param query - Query text (used for logging/tracing)
 * @param queryEmbedding - Pre-computed query embedding
 * @param collectionId - Collection to search
 * @param userId - User ID for RLS
 * @param params - Vector strategy parameters
 * @returns Strategy execution result with timing
 */
export async function vectorSearch(
  query: string,
  queryEmbedding: number[],
  collectionId: string,
  userId: string,
  params: VectorStrategyParams
): Promise<StrategyExecutionResult> {
  const startTime = performance.now();

  try {
    const vectorStore = getVectorStore();

    const searchResults = await vectorStore.search({
      userId,
      collectionId,
      queryEmbedding,
      topK: params.top_k,
      threshold: params.threshold,
      searchEf: params.search_ef,
    });

    const results = mapToStrategyResults(searchResults);
    const latencyMs = performance.now() - startTime;

    return {
      strategyType: 'vector',
      results,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = performance.now() - startTime;
    return {
      strategyType: 'vector',
      results: [],
      latencyMs,
      error: error instanceof Error ? error.message : 'Vector search failed',
    };
  }
}

/**
 * Map vector search results to strategy results format
 */
function mapToStrategyResults(
  searchResults: VectorSearchResult[]
): StrategyResult[] {
  return searchResults.map((result, index) => ({
    id: result.chunkId,
    score: result.similarity,
    rank: index + 1,
    data: result,
  }));
}

/**
 * Validate vector strategy parameters
 */
export function validateVectorParams(
  params: Partial<VectorStrategyParams>
): VectorStrategyParams {
  return {
    top_k: Math.max(1, Math.min(100, params.top_k ?? 20)),
    threshold: Math.max(0, Math.min(1, params.threshold ?? 0)),
    search_ef: params.search_ef ? Math.max(10, params.search_ef) : undefined,
  };
}

/**
 * Default vector strategy parameters
 */
export const DEFAULT_VECTOR_PARAMS: VectorStrategyParams = {
  top_k: 20,
  threshold: 0.5,
};
