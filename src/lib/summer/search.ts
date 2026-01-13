/**
 * Summer RAG Gateway - Search Module
 *
 * Provides unified search interface with:
 * - Vector (semantic) search
 * - Keyword (BM25) search
 * - Hybrid search with RRF (Reciprocal Rank Fusion)
 * - Metadata filtering
 * - Flight Recorder integration
 */

import { randomUUID } from 'crypto';
import { getEmbeddingProvider } from './embedding';
import { getVectorStore } from './vectorstore';
import { LocalBM25RerankProvider } from './rerank/local-bm25';
import type { VectorSearchResult, RetrievalMode } from './types';
import { startTrace, addEvent, finishTrace, startSpan, endSpan } from '@/lib/fall/flight-recorder';

// ============================================
// Types
// ============================================

/**
 * Search type alias - same as RetrievalMode but named for external API clarity
 */
export type SearchType = RetrievalMode;

export interface SearchFilter {
  /** Field name in metadata */
  field: string;
  /** Comparison operator */
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'startsWith';
  /** Value to compare against */
  value: unknown;
}

export interface DateRangeFilter {
  /** Start date (inclusive) */
  start?: string;
  /** End date (inclusive) */
  end?: string;
  /** Field name for date (default: 'created_at') */
  field?: string;
}

export interface SearchOptions {
  /** Number of results to return (default: 10) */
  top_k?: number;
  /** Type of search (default: 'hybrid') */
  search_type?: SearchType;
  /**
   * Hybrid search alpha parameter
   * 0.0 = full keyword, 1.0 = full vector
   * (default: 0.7)
   */
  hybrid_alpha?: number;
  /** Metadata filters */
  filters?: SearchFilter[];
  /** Date range filter */
  date_range?: DateRangeFilter;
  /** Category filter (shorthand for metadata filter) */
  category?: string | string[];
  /** Minimum similarity threshold for vector search (default: 0.5) */
  threshold?: number;
  /** HNSW ef_search parameter (default: 40) */
  search_ef?: number;
  /** Include trace in response */
  include_trace?: boolean;
}

export interface SearchResult {
  /** Chunk ID */
  id: string;
  /** Document ID */
  document_id: string;
  /** Chunk content */
  content: string;
  /** Relevance score (0-1, higher is better) */
  score: number;
  /** Chunk metadata */
  metadata: Record<string, unknown>;
  /** Source of the result */
  source?: string;
  /** Original vector similarity (for hybrid) */
  vector_score?: number;
  /** Original keyword rank (for hybrid) */
  keyword_rank?: number;
}

export interface SearchResponse {
  /** Search results */
  results: SearchResult[];
  /** Total latency in milliseconds */
  latency_ms: number;
  /** Search type used */
  search_type: SearchType;
  /** Trace information (if requested) */
  trace?: {
    request_id: string;
    timings: {
      embed_ms?: number;
      vector_search_ms?: number;
      keyword_search_ms?: number;
      rrf_fusion_ms?: number;
      filter_ms?: number;
      total_ms: number;
    };
    config: {
      top_k: number;
      hybrid_alpha?: number;
      threshold: number;
      search_ef: number;
      filter_count: number;
    };
  };
}

export interface SearchParams {
  /** User ID for access control */
  userId: string;
  /** API Key ID (optional) */
  apiKeyId?: string;
  /** User plan */
  plan: string;
  /** Collection ID */
  collectionId: string;
  /** Search query */
  query: string;
  /** Search options */
  options?: SearchOptions;
}

// ============================================
// RRF (Reciprocal Rank Fusion) Implementation
// ============================================

const RRF_K = 60; // Standard RRF constant

interface RRFItem {
  id: string;
  vectorRank?: number;
  keywordRank?: number;
  rrfScore: number;
  original: VectorSearchResult;
}

/**
 * Reciprocal Rank Fusion combines rankings from multiple sources
 * Score = sum(1 / (k + rank)) for each source
 */
function reciprocalRankFusion(
  vectorResults: VectorSearchResult[],
  keywordResults: VectorSearchResult[],
  alpha: number,
  topK: number
): VectorSearchResult[] {
  const itemMap = new Map<string, RRFItem>();

  // Process vector results
  vectorResults.forEach((result, index) => {
    const rank = index + 1;
    const vectorScore = alpha / (RRF_K + rank);

    const existing = itemMap.get(result.chunkId);
    if (existing) {
      existing.vectorRank = rank;
      existing.rrfScore += vectorScore;
    } else {
      itemMap.set(result.chunkId, {
        id: result.chunkId,
        vectorRank: rank,
        rrfScore: vectorScore,
        original: result,
      });
    }
  });

  // Process keyword results
  keywordResults.forEach((result, index) => {
    const rank = index + 1;
    const keywordScore = (1 - alpha) / (RRF_K + rank);

    const existing = itemMap.get(result.chunkId);
    if (existing) {
      existing.keywordRank = rank;
      existing.rrfScore += keywordScore;
    } else {
      itemMap.set(result.chunkId, {
        id: result.chunkId,
        keywordRank: rank,
        rrfScore: keywordScore,
        original: result,
      });
    }
  });

  // Sort by RRF score and take top K
  const sorted = Array.from(itemMap.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, topK);

  // Convert back to VectorSearchResult with combined scores
  return sorted.map((item) => ({
    ...item.original,
    similarity: item.original.similarity,
    keywordRank: item.keywordRank,
    combinedScore: item.rrfScore,
    source: item.original.source ?? 'managed',
  }));
}

// ============================================
// Filter Implementation
// ============================================

function applyFilters(
  results: VectorSearchResult[],
  filters: SearchFilter[],
  dateRange?: DateRangeFilter
): VectorSearchResult[] {
  return results.filter((result) => {
    // Apply metadata filters
    for (const filter of filters) {
      const value = result.metadata[filter.field];

      if (!matchesFilter(value, filter)) {
        return false;
      }
    }

    // Apply date range filter
    if (dateRange) {
      const field = dateRange.field ?? 'created_at';
      const dateValue = result.metadata[field];

      if (dateValue) {
        const date = new Date(String(dateValue));

        if (dateRange.start && date < new Date(dateRange.start)) {
          return false;
        }

        if (dateRange.end && date > new Date(dateRange.end)) {
          return false;
        }
      }
    }

    return true;
  });
}

function matchesFilter(value: unknown, filter: SearchFilter): boolean {
  switch (filter.operator) {
    case 'eq':
      return value === filter.value;

    case 'neq':
      return value !== filter.value;

    case 'gt':
      return typeof value === 'number' && value > (filter.value as number);

    case 'gte':
      return typeof value === 'number' && value >= (filter.value as number);

    case 'lt':
      return typeof value === 'number' && value < (filter.value as number);

    case 'lte':
      return typeof value === 'number' && value <= (filter.value as number);

    case 'in':
      return Array.isArray(filter.value) && filter.value.includes(value);

    case 'nin':
      return Array.isArray(filter.value) && !filter.value.includes(value);

    case 'contains':
      return typeof value === 'string' &&
             value.toLowerCase().includes(String(filter.value).toLowerCase());

    case 'startsWith':
      return typeof value === 'string' &&
             value.toLowerCase().startsWith(String(filter.value).toLowerCase());

    default:
      return true;
  }
}

/**
 * Convert category shorthand to proper filter
 */
function buildFiltersFromOptions(options: SearchOptions): SearchFilter[] {
  const filters: SearchFilter[] = [...(options.filters ?? [])];

  if (options.category) {
    const categories = Array.isArray(options.category)
      ? options.category
      : [options.category];

    filters.push({
      field: 'category',
      operator: categories.length > 1 ? 'in' : 'eq',
      value: categories.length > 1 ? categories : categories[0],
    });
  }

  return filters;
}

// ============================================
// Main Search Function
// ============================================

/**
 * Execute unified search against a collection
 */
export async function search(params: SearchParams): Promise<SearchResponse> {
  const requestId = randomUUID();
  const startTime = Date.now();

  const options = params.options ?? {};
  const topK = options.top_k ?? 10;
  const searchType = options.search_type ?? 'hybrid';
  const hybridAlpha = options.hybrid_alpha ?? 0.7;
  const threshold = options.threshold ?? 0.5;
  const searchEf = options.search_ef ?? 40;
  const filters = buildFiltersFromOptions(options);
  const includeTrace = options.include_trace ?? false;

  // Initialize trace
  const traceHandle = await startTrace({
    requestId,
    userId: params.userId,
    apiKeyId: params.apiKeyId,
    plan: params.plan,
    collectionId: params.collectionId,
    queryText: params.query,
    autopilotEnabled: false,
    config: {
      searchType: searchType === 'vector' ? 'semantic' : searchType === 'keyword' ? 'keyword' : 'hybrid',
      topK,
      hybridAlpha,
    },
    source: 'api',
  });

  const timings: {
    embed_ms?: number;
    vector_search_ms?: number;
    keyword_search_ms?: number;
    rrf_fusion_ms?: number;
    filter_ms?: number;
    total_ms: number;
  } = { total_ms: 0 };

  try {
    let results: VectorSearchResult[] = [];

    // Vector search (semantic)
    if (searchType === 'vector' || searchType === 'hybrid') {
      // Embed query
      const embedSpan = startSpan(traceHandle, 'embedding', { query_length: params.query.length });
      const embedStart = Date.now();

      const embedder = getEmbeddingProvider();
      const [queryEmbedding] = await embedder.embed([params.query], 'query');

      timings.embed_ms = Date.now() - embedStart;
      endSpan(traceHandle, embedSpan, { dimensions: embedder.dimensions, latency_ms: timings.embed_ms });

      addEvent(traceHandle, 'embed', {
        provider: embedder.id,
        dimensions: embedder.dimensions,
        latency_ms: timings.embed_ms,
      });

      // Vector search
      const vectorSpan = startSpan(traceHandle, 'vector_search', { top_k: topK, threshold, search_ef: searchEf });
      const vectorStart = Date.now();

      const store = getVectorStore();
      const vectorResults = await store.search({
        userId: params.userId,
        collectionId: params.collectionId,
        queryEmbedding,
        topK: searchType === 'hybrid' ? topK * 2 : topK,
        threshold,
        searchEf,
      });

      timings.vector_search_ms = Date.now() - vectorStart;
      endSpan(traceHandle, vectorSpan, { result_count: vectorResults.length, latency_ms: timings.vector_search_ms });

      addEvent(traceHandle, 'candidates', {
        source: 'vector',
        count: vectorResults.length,
        latency_ms: timings.vector_search_ms,
        results: vectorResults.slice(0, 20).map((r, i) => ({
          rank: i + 1,
          chunkId: r.chunkId,
          similarity: r.similarity,
        })),
      });

      if (searchType === 'vector') {
        results = vectorResults;
      } else {
        // Hybrid: also do keyword search
        const keywordSpan = startSpan(traceHandle, 'keyword_search', { top_k: topK * 2 });
        const keywordStart = Date.now();

        const keywordResults = await store.keywordSearch({
          userId: params.userId,
          collectionId: params.collectionId,
          queryText: params.query,
          topK: topK * 2,
        });

        timings.keyword_search_ms = Date.now() - keywordStart;
        endSpan(traceHandle, keywordSpan, { result_count: keywordResults.length, latency_ms: timings.keyword_search_ms });

        addEvent(traceHandle, 'candidates', {
          source: 'keyword',
          count: keywordResults.length,
          latency_ms: timings.keyword_search_ms,
          results: keywordResults.slice(0, 20).map((r, i) => ({
            rank: i + 1,
            chunkId: r.chunkId,
            keywordRank: r.keywordRank,
          })),
        });

        // RRF fusion
        const rrfStart = Date.now();
        results = reciprocalRankFusion(vectorResults, keywordResults, hybridAlpha, topK);
        timings.rrf_fusion_ms = Date.now() - rrfStart;

        addEvent(traceHandle, 'rerank', {
          provider: 'rrf',
          alpha: hybridAlpha,
          vector_count: vectorResults.length,
          keyword_count: keywordResults.length,
          fused_count: results.length,
          latency_ms: timings.rrf_fusion_ms,
        });
      }
    } else {
      // Keyword-only search
      const keywordSpan = startSpan(traceHandle, 'keyword_search', { top_k: topK });
      const keywordStart = Date.now();

      const store = getVectorStore();
      results = await store.keywordSearch({
        userId: params.userId,
        collectionId: params.collectionId,
        queryText: params.query,
        topK,
      });

      timings.keyword_search_ms = Date.now() - keywordStart;
      endSpan(traceHandle, keywordSpan, { result_count: results.length, latency_ms: timings.keyword_search_ms });

      addEvent(traceHandle, 'candidates', {
        source: 'keyword',
        count: results.length,
        latency_ms: timings.keyword_search_ms,
        results: results.slice(0, 20).map((r, i) => ({
          rank: i + 1,
          chunkId: r.chunkId,
          keywordRank: r.keywordRank,
        })),
      });
    }

    // Apply filters
    if (filters.length > 0 || options.date_range) {
      const filterStart = Date.now();
      const beforeCount = results.length;

      results = applyFilters(results, filters, options.date_range);

      timings.filter_ms = Date.now() - filterStart;

      addEvent(traceHandle, 'custom', {
        name: 'filter',
        filter_count: filters.length,
        date_range: !!options.date_range,
        before_count: beforeCount,
        after_count: results.length,
        latency_ms: timings.filter_ms,
      });
    }

    // Ensure we have at most topK results
    results = results.slice(0, topK);

    // Convert to response format
    const searchResults: SearchResult[] = results.map((r) => ({
      id: r.chunkId,
      document_id: r.documentId,
      content: r.text,
      score: normalizeScore(r, searchType),
      metadata: r.metadata,
      source: r.source,
      vector_score: searchType === 'hybrid' ? r.similarity : undefined,
      keyword_rank: searchType === 'hybrid' ? r.keywordRank : undefined,
    }));

    timings.total_ms = Date.now() - startTime;

    // Record context selection
    addEvent(traceHandle, 'context', {
      selectedChunkIds: searchResults.slice(0, 12).map((r) => r.id),
      total_results: searchResults.length,
    });

    // Finish trace
    await finishTrace(traceHandle, {
      effectiveConfig: {
        searchType,
        topK,
        hybridAlpha,
        threshold,
      },
      timingsMs: {
        embed: timings.embed_ms ?? 0,
        vectorSearch: timings.vector_search_ms ?? 0,
        keywordSearch: timings.keyword_search_ms ?? 0,
        rrfFusion: timings.rrf_fusion_ms ?? 0,
        filter: timings.filter_ms ?? 0,
        total: timings.total_ms,
      },
      resultsCount: searchResults.length,
    });

    return {
      results: searchResults,
      latency_ms: timings.total_ms,
      search_type: searchType,
      trace: includeTrace ? {
        request_id: requestId,
        timings,
        config: {
          top_k: topK,
          hybrid_alpha: searchType === 'hybrid' ? hybridAlpha : undefined,
          threshold,
          search_ef: searchEf,
          filter_count: filters.length,
        },
      } : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    addEvent(traceHandle, 'error', {
      message: errorMessage,
      search_type: searchType,
    });

    await finishTrace(traceHandle, {
      error: errorMessage,
      timingsMs: {
        total: Date.now() - startTime,
      },
      resultsCount: 0,
    });

    throw error;
  }
}

/**
 * Normalize score to 0-1 range based on search type
 */
function normalizeScore(result: VectorSearchResult, searchType: SearchType): number {
  switch (searchType) {
    case 'vector':
      // Cosine similarity is already 0-1
      return result.similarity;

    case 'keyword':
      // BM25 scores need normalization (use sigmoid)
      const bm25Score = result.keywordRank ?? 0;
      return 1 / (1 + Math.exp(-bm25Score / 10));

    case 'hybrid':
      // Combined score from RRF is already normalized
      return result.combinedScore ?? result.similarity;

    default:
      return result.similarity;
  }
}

// ============================================
// Alternative BM25 Local Reranker for Hybrid
// ============================================

/**
 * Alternative hybrid search using local BM25 reranker
 * (For when DB keyword search is not available)
 */
export async function hybridSearchWithLocalBM25(
  params: SearchParams & { queryEmbedding: number[] }
): Promise<VectorSearchResult[]> {
  const options = params.options ?? {};
  const topK = options.top_k ?? 10;
  const hybridAlpha = options.hybrid_alpha ?? 0.7;

  // Vector search
  const store = getVectorStore();
  const vectorResults = await store.search({
    userId: params.userId,
    collectionId: params.collectionId,
    queryEmbedding: params.queryEmbedding,
    topK: topK * 2,
    threshold: options.threshold ?? 0.5,
    searchEf: options.search_ef ?? 40,
  });

  // Local BM25 reranking
  const bm25 = new LocalBM25RerankProvider();
  const docs = vectorResults.map((r) => ({
    id: r.chunkId,
    text: r.text,
    metadata: r.metadata,
  }));

  const bm25Results = await bm25.rerank(params.query, docs, { topN: topK * 2 });

  // Build keyword results from BM25
  const keywordResults: VectorSearchResult[] = bm25Results.map((r, index) => {
    const original = vectorResults.find((v) => v.chunkId === r.id)!;
    return {
      ...original,
      keywordRank: index + 1,
      combinedScore: r.score,
    };
  });

  // RRF fusion
  return reciprocalRankFusion(vectorResults, keywordResults, hybridAlpha, topK);
}

// Re-export types
export type { VectorSearchResult };
