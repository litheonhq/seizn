/**
 * Keyword Search Strategy
 *
 * Uses BM25-based keyword matching for precise term retrieval.
 */

import { getVectorStore } from '@/lib/summer/vectorstore';
import type { VectorSearchResult } from '@/lib/summer/types';
import type {
  KeywordStrategyParams,
  StrategyResult,
  StrategyExecutionResult,
} from '../types';

/**
 * Execute keyword search strategy
 *
 * Uses the vector store's keyword search capability (typically PostgreSQL
 * full-text search with ts_rank or custom BM25 implementation).
 *
 * @param query - Query text for keyword matching
 * @param collectionId - Collection to search
 * @param userId - User ID for RLS
 * @param params - Keyword strategy parameters
 * @returns Strategy execution result with timing
 */
export async function keywordSearch(
  query: string,
  collectionId: string,
  userId: string,
  params: KeywordStrategyParams
): Promise<StrategyExecutionResult> {
  const startTime = performance.now();

  try {
    const vectorStore = getVectorStore();

    // Apply boost terms to query if specified
    const boostedQuery = applyBoostTerms(query, params.boost_terms);

    const searchResults = await vectorStore.keywordSearch({
      userId,
      collectionId,
      queryText: boostedQuery,
      topK: params.top_k,
    });

    const results = mapToStrategyResults(searchResults);
    const latencyMs = performance.now() - startTime;

    return {
      strategyType: 'keyword',
      results,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = performance.now() - startTime;
    return {
      strategyType: 'keyword',
      results: [],
      latencyMs,
      error: error instanceof Error ? error.message : 'Keyword search failed',
    };
  }
}

/**
 * Apply boost terms to query
 *
 * Boost terms are repeated in the query to increase their importance
 * in BM25 scoring. This is a simple approach; more sophisticated
 * implementations might use query-time boosting.
 */
function applyBoostTerms(
  query: string,
  boostTerms?: Record<string, number>
): string {
  if (!boostTerms || Object.keys(boostTerms).length === 0) {
    return query;
  }

  const words = query.toLowerCase().split(/\s+/);
  const boostedWords: string[] = [];

  for (const word of words) {
    const boost = boostTerms[word] ?? 1;
    // Repeat word based on boost factor (max 5x to prevent abuse)
    const repeatCount = Math.min(5, Math.max(1, Math.round(boost)));
    for (let i = 0; i < repeatCount; i++) {
      boostedWords.push(word);
    }
  }

  return boostedWords.join(' ');
}

/**
 * Map keyword search results to strategy results format
 */
function mapToStrategyResults(
  searchResults: VectorSearchResult[]
): StrategyResult[] {
  return searchResults.map((result, index) => ({
    id: result.chunkId,
    // For keyword search, keywordRank or similarity can be used as score
    score: result.keywordRank ?? result.similarity ?? 0,
    rank: index + 1,
    data: result,
  }));
}

/**
 * Validate keyword strategy parameters
 */
export function validateKeywordParams(
  params: Partial<KeywordStrategyParams>
): KeywordStrategyParams {
  const validated: KeywordStrategyParams = {
    top_k: Math.max(1, Math.min(100, params.top_k ?? 20)),
  };

  // Validate boost terms if provided
  if (params.boost_terms) {
    const sanitizedBoostTerms: Record<string, number> = {};
    for (const [term, boost] of Object.entries(params.boost_terms)) {
      if (typeof term === 'string' && typeof boost === 'number') {
        // Clamp boost between 0.1 and 10
        sanitizedBoostTerms[term.toLowerCase()] = Math.max(
          0.1,
          Math.min(10, boost)
        );
      }
    }
    if (Object.keys(sanitizedBoostTerms).length > 0) {
      validated.boost_terms = sanitizedBoostTerms;
    }
  }

  return validated;
}

/**
 * Default keyword strategy parameters
 */
export const DEFAULT_KEYWORD_PARAMS: KeywordStrategyParams = {
  top_k: 20,
};

/**
 * Extract potential boost terms from domain context
 *
 * This is a helper for suggesting boost terms based on domain.
 * In production, this could be trained from user feedback.
 */
export function suggestBoostTermsForDomain(
  domain: string
): Record<string, number> {
  const domainBoosts: Record<string, Record<string, number>> = {
    legal: {
      contract: 1.5,
      agreement: 1.5,
      clause: 1.3,
      liability: 1.4,
      warranty: 1.3,
    },
    medical: {
      diagnosis: 1.5,
      treatment: 1.4,
      symptom: 1.3,
      medication: 1.4,
      patient: 1.2,
    },
    technical: {
      api: 1.5,
      function: 1.3,
      error: 1.4,
      configuration: 1.3,
      parameter: 1.3,
    },
    financial: {
      revenue: 1.5,
      profit: 1.4,
      investment: 1.4,
      risk: 1.3,
      compliance: 1.4,
    },
  };

  return domainBoosts[domain.toLowerCase()] ?? {};
}
