/**
 * Summer RAG Gateway - Reranker Service
 *
 * Provides a unified interface for document reranking with:
 * - Multiple provider support (Cohere, Voyage, Cross-Encoder)
 * - Batch processing for efficiency
 * - Caching for repeated query+docs combinations
 * - Cost tracking via Flight Recorder
 */

import { getRedis } from '@/lib/redis';
import {
  startTrace,
  addEvent,
  finishTrace,
  calculateTraceCost,
  type TraceHandle,
} from '@/lib/fall/flight-recorder';
import { createHash } from 'crypto';

// ============================================
// Types
// ============================================

export type RerankerModel = 'cohere' | 'voyage' | 'cross_encoder' | 'bm25';

export interface RerankDocument {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface RerankOptions {
  model?: RerankerModel;
  top_k?: number;
  /** Custom model ID for cross_encoder */
  customModelId?: string;
  /** Skip cache lookup */
  skipCache?: boolean;
  /** Include trace in response */
  includeTrace?: boolean;
}

export interface RerankResultItem {
  id: string;
  content: string;
  score: number;
  original_rank: number;
  new_rank: number;
  metadata?: Record<string, unknown>;
}

export interface RerankResponse {
  results: RerankResultItem[];
  latency_ms: number;
  model: RerankerModel;
  cost_usd?: number;
  cache_hit?: boolean;
  trace?: {
    traceId: string;
    requestId: string;
  };
}

export interface RerankParams {
  userId: string;
  apiKeyId?: string;
  plan: string;
  query: string;
  documents: RerankDocument[];
  options?: RerankOptions;
}

// ============================================
// Cost Rates (USD per unit)
// ============================================

const COST_RATES = {
  cohere: {
    perQuery: 0.001, // $0.001 per query
    perDocument: 0.0001, // $0.0001 per document
  },
  voyage: {
    perQuery: 0.0005, // $0.0005 per query
    perDocument: 0.00005, // $0.00005 per document
  },
  cross_encoder: {
    perQuery: 0, // Self-hosted, no API cost
    perDocument: 0,
  },
  bm25: {
    perQuery: 0, // Local computation
    perDocument: 0,
  },
};

// ============================================
// Cache Configuration
// ============================================

const RERANK_CACHE_PREFIX = 'rerank:';
const RERANK_CACHE_TTL = 60 * 60 * 24; // 24 hours

/**
 * Generate a cache key for the query+documents combination
 */
function generateCacheKey(query: string, documents: RerankDocument[], model: RerankerModel): string {
  const docIds = documents.map((d) => d.id).sort().join('|');
  const hash = createHash('sha256')
    .update(`${model}:${query}:${docIds}`)
    .digest('hex')
    .slice(0, 16);
  return `${RERANK_CACHE_PREFIX}${hash}`;
}

/**
 * Get cached rerank results
 */
async function getCachedRerank(cacheKey: string): Promise<RerankResultItem[] | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const cached = await redis.get<RerankResultItem[]>(cacheKey);
    return cached;
  } catch (error) {
    console.error('Redis get error (rerank cache):', error);
    return null;
  }
}

/**
 * Set cached rerank results
 */
async function setCachedRerank(cacheKey: string, results: RerankResultItem[]): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(cacheKey, results, { ex: RERANK_CACHE_TTL });
  } catch (error) {
    console.error('Redis set error (rerank cache):', error);
  }
}

// ============================================
// Provider Implementations
// ============================================

/**
 * Cohere Rerank v3
 */
async function rerankWithCohere(
  query: string,
  documents: RerankDocument[],
  topK: number
): Promise<{ results: Array<{ index: number; score: number }>; tokensUsed?: number }> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) {
    throw new Error('COHERE_API_KEY not configured');
  }

  const response = await fetch('https://api.cohere.ai/v1/rerank', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.COHERE_RERANK_MODEL || 'rerank-english-v3.0',
      query,
      documents: documents.map((d) => d.content),
      top_n: topK,
      return_documents: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cohere rerank error: ${error}`);
  }

  const data = await response.json() as {
    results: Array<{ index: number; relevance_score: number }>;
    meta?: { billed_units?: { search_units: number } };
  };

  return {
    results: data.results.map((r) => ({
      index: r.index,
      score: r.relevance_score,
    })),
    tokensUsed: data.meta?.billed_units?.search_units,
  };
}

/**
 * Voyage Rerank
 */
async function rerankWithVoyage(
  query: string,
  documents: RerankDocument[],
  topK: number
): Promise<{ results: Array<{ index: number; score: number }> }> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error('VOYAGE_API_KEY not configured');
  }

  const response = await fetch('https://api.voyageai.com/v1/rerank', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.VOYAGE_RERANK_MODEL || 'rerank-2',
      query,
      documents: documents.map((d) => d.content),
      top_k: topK,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Voyage rerank error: ${error}`);
  }

  const data = await response.json() as {
    data: Array<{ index: number; relevance_score: number }>;
  };

  return {
    results: data.data.map((r) => ({
      index: r.index,
      score: r.relevance_score,
    })),
  };
}

/**
 * Local BM25 Reranker
 */
function rerankWithBM25(
  query: string,
  documents: RerankDocument[],
  topK: number
): { results: Array<{ index: number; score: number }> } {
  // BM25 parameters
  const K1 = 1.2;
  const B = 0.75;

  // Simple tokenizer
  const tokenize = (text: string): string[] =>
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);

  // Stop words
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'shall', 'can', 'of', 'at', 'by', 'for', 'with',
    'about', 'to', 'from', 'in', 'on', 'and', 'or', 'not', 'but', 'if', 'then',
    'this', 'that', 'these', 'those', 'it', 'its', 'as', 'so', 'such',
  ]);

  const filterTokens = (tokens: string[]): string[] =>
    tokens.filter((t) => !stopWords.has(t));

  // Tokenize query and documents
  const queryTokens = filterTokens(tokenize(query));
  const docData = documents.map((doc, idx) => {
    const tokens = filterTokens(tokenize(doc.content));
    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1);
    }
    return { idx, tokens, tf };
  });

  // Calculate average document length
  const totalLen = docData.reduce((sum, d) => sum + d.tokens.length, 0);
  const avgDocLen = totalLen / Math.max(docData.length, 1);

  // Calculate IDF
  const N = docData.length;
  const idf = new Map<string, number>();
  for (const term of new Set(queryTokens)) {
    const docsWithTerm = docData.filter((d) => d.tf.has(term)).length;
    const idfValue = Math.log(1 + (N - docsWithTerm + 0.5) / (docsWithTerm + 0.5));
    idf.set(term, Math.max(0, idfValue));
  }

  // Calculate BM25 scores
  const scores = docData.map((d) => {
    let score = 0;
    const docLen = d.tokens.length;

    for (const term of queryTokens) {
      const tf = d.tf.get(term) ?? 0;
      if (tf === 0) continue;

      const idfValue = idf.get(term) ?? 0;
      const numerator = tf * (K1 + 1);
      const denominator = tf + K1 * (1 - B + B * (docLen / avgDocLen));
      score += idfValue * (numerator / denominator);
    }

    return { index: d.idx, score };
  });

  // Sort by score and take top_k
  scores.sort((a, b) => b.score - a.score);
  return { results: scores.slice(0, topK) };
}

/**
 * Cross-Encoder Reranker (Self-hosted)
 */
async function rerankWithCrossEncoder(
  query: string,
  documents: RerankDocument[],
  topK: number,
  modelId?: string
): Promise<{ results: Array<{ index: number; score: number }> }> {
  const endpoint = process.env.CROSS_ENCODER_ENDPOINT;
  if (!endpoint) {
    // Fallback to BM25 if no endpoint configured
    console.warn('CROSS_ENCODER_ENDPOINT not configured, falling back to BM25');
    return rerankWithBM25(query, documents, topK);
  }

  const model = modelId || process.env.CROSS_ENCODER_MODEL || 'ms-marco-MiniLM-L-6-v2';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.CROSS_ENCODER_API_KEY && {
        Authorization: `Bearer ${process.env.CROSS_ENCODER_API_KEY}`,
      }),
    },
    body: JSON.stringify({
      model,
      query,
      documents: documents.map((d) => d.content),
      top_k: topK,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cross-encoder rerank error: ${error}`);
  }

  const data = await response.json() as {
    results: Array<{ index: number; score: number }>;
  };

  return { results: data.results };
}

// ============================================
// Main Rerank Function
// ============================================

/**
 * Rerank documents based on query relevance
 */
export async function rerank(params: RerankParams): Promise<RerankResponse> {
  const startTime = Date.now();
  const {
    userId,
    apiKeyId,
    plan,
    query,
    documents,
    options = {},
  } = params;

  const model: RerankerModel = options.model || 'cohere';
  const topK = options.top_k ?? Math.min(documents.length, 10);
  const skipCache = options.skipCache ?? false;
  const includeTrace = options.includeTrace ?? false;

  // Generate request ID
  const requestId = `rerank_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Start trace if needed
  let traceHandle: TraceHandle | undefined;
  if (includeTrace) {
    traceHandle = await startTrace({
      requestId,
      userId,
      apiKeyId,
      plan,
      queryText: query,
      source: 'api',
      config: {
        rerankEnabled: true,
        rerankModel: model,
        rerankTopN: topK,
      },
    });
  }

  try {
    // Check cache first
    const cacheKey = generateCacheKey(query, documents, model);
    let cacheHit = false;

    if (!skipCache) {
      const cached = await getCachedRerank(cacheKey);
      if (cached) {
        cacheHit = true;
        const latencyMs = Date.now() - startTime;

        if (traceHandle) {
          addEvent(traceHandle, 'cache_hit', {
            cacheKey,
            resultCount: cached.length,
          });
          await finishTrace(traceHandle, {
            resultsCount: cached.length,
            timingsMs: { total: latencyMs, cache: latencyMs },
          });
        }

        return {
          results: cached.slice(0, topK),
          latency_ms: latencyMs,
          model,
          cache_hit: true,
          ...(includeTrace && traceHandle && {
            trace: {
              traceId: traceHandle.traceId,
              requestId: traceHandle.requestId,
            },
          }),
        };
      }
    }

    // Record rerank event
    if (traceHandle) {
      addEvent(traceHandle, 'rerank', {
        model,
        documentCount: documents.length,
        topK,
      });
    }

    // Call appropriate provider
    let rawResults: Array<{ index: number; score: number }>;

    switch (model) {
      case 'cohere': {
        const cohereResult = await rerankWithCohere(query, documents, topK);
        rawResults = cohereResult.results;
        break;
      }
      case 'voyage': {
        const voyageResult = await rerankWithVoyage(query, documents, topK);
        rawResults = voyageResult.results;
        break;
      }
      case 'cross_encoder': {
        const ceResult = await rerankWithCrossEncoder(
          query,
          documents,
          topK,
          options.customModelId
        );
        rawResults = ceResult.results;
        break;
      }
      case 'bm25':
      default: {
        const bm25Result = rerankWithBM25(query, documents, topK);
        rawResults = bm25Result.results;
        break;
      }
    }

    // Map results with original and new ranks
    const results: RerankResultItem[] = rawResults.map((r, newRank) => {
      const doc = documents[r.index];
      return {
        id: doc.id,
        content: doc.content,
        score: r.score,
        original_rank: r.index + 1,
        new_rank: newRank + 1,
        metadata: doc.metadata,
      };
    });

    // Calculate cost
    const rates = COST_RATES[model];
    const costUsd = rates.perQuery + rates.perDocument * documents.length;

    // Cache results
    if (!skipCache && results.length > 0) {
      setCachedRerank(cacheKey, results).catch(console.error);
    }

    const latencyMs = Date.now() - startTime;

    // Finish trace
    if (traceHandle) {
      const traceCost = calculateTraceCost({
        rerankItems: documents.length,
      });
      await finishTrace(traceHandle, {
        resultsCount: results.length,
        timingsMs: { total: latencyMs, rerank: latencyMs },
        cost: {
          ...traceCost,
          rerank: costUsd,
          total: costUsd,
        },
      });
    }

    return {
      results,
      latency_ms: latencyMs,
      model,
      cost_usd: costUsd,
      cache_hit: cacheHit,
      ...(includeTrace && traceHandle && {
        trace: {
          traceId: traceHandle.traceId,
          requestId: traceHandle.requestId,
        },
      }),
    };
  } catch (error) {
    // Record error in trace
    if (traceHandle) {
      addEvent(traceHandle, 'error', {
        error: error instanceof Error ? error.message : String(error),
      });
      await finishTrace(traceHandle, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }
}

// ============================================
// Batch Rerank (for multiple queries)
// ============================================

export interface BatchRerankParams {
  userId: string;
  apiKeyId?: string;
  plan: string;
  requests: Array<{
    query: string;
    documents: RerankDocument[];
  }>;
  options?: RerankOptions;
}

export interface BatchRerankResponse {
  results: RerankResponse[];
  total_latency_ms: number;
  total_cost_usd: number;
}

/**
 * Batch rerank multiple query-document sets
 */
export async function batchRerank(params: BatchRerankParams): Promise<BatchRerankResponse> {
  const startTime = Date.now();
  const { userId, apiKeyId, plan, requests, options } = params;

  // Process all requests in parallel
  const results = await Promise.all(
    requests.map((req) =>
      rerank({
        userId,
        apiKeyId,
        plan,
        query: req.query,
        documents: req.documents,
        options: {
          ...options,
          includeTrace: false, // Disable individual traces for batch
        },
      })
    )
  );

  const totalLatencyMs = Date.now() - startTime;
  const totalCostUsd = results.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);

  return {
    results,
    total_latency_ms: totalLatencyMs,
    total_cost_usd: totalCostUsd,
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get available reranker models
 */
export function getAvailableModels(): Array<{
  id: RerankerModel;
  name: string;
  description: string;
  costPerQuery: number;
  costPerDocument: number;
}> {
  return [
    {
      id: 'cohere',
      name: 'Cohere Rerank v3',
      description: 'High-quality neural reranking with excellent accuracy',
      costPerQuery: COST_RATES.cohere.perQuery,
      costPerDocument: COST_RATES.cohere.perDocument,
    },
    {
      id: 'voyage',
      name: 'Voyage Rerank',
      description: 'Cost-effective neural reranking with good accuracy',
      costPerQuery: COST_RATES.voyage.perQuery,
      costPerDocument: COST_RATES.voyage.perDocument,
    },
    {
      id: 'cross_encoder',
      name: 'Cross-Encoder (Self-hosted)',
      description: 'Self-hosted cross-encoder model for privacy-sensitive use cases',
      costPerQuery: COST_RATES.cross_encoder.perQuery,
      costPerDocument: COST_RATES.cross_encoder.perDocument,
    },
    {
      id: 'bm25',
      name: 'BM25 (Local)',
      description: 'Fast, local lexical reranking with no API cost',
      costPerQuery: COST_RATES.bm25.perQuery,
      costPerDocument: COST_RATES.bm25.perDocument,
    },
  ];
}

/**
 * Estimate cost for a rerank operation
 */
export function estimateRerankCost(
  model: RerankerModel,
  documentCount: number
): number {
  const rates = COST_RATES[model] ?? COST_RATES.bm25;
  return rates.perQuery + rates.perDocument * documentCount;
}
