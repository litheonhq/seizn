/**
 * Why-Not Retrieval Analysis
 *
 * Analyzes why a specific document was NOT returned in a retrieval operation.
 * Provides step-by-step diagnostics through the retrieval pipeline stages.
 */

import { createServerClient } from '@/lib/supabase';
import { getEmbeddingProvider } from '@/lib/summer/embedding';
import type { StoredTrace, TraceConfig, RetrievalEvent } from '@/lib/fall/flight-recorder/types';

// ============================================
// Types
// ============================================

/**
 * Stage where a document can be blocked
 */
export type WhyNotStage = 'index' | 'permission' | 'embedding' | 'topk' | 'rerank' | 'policy';

/**
 * A single blocker that prevented document retrieval
 */
export interface WhyNotBlocker {
  /** Pipeline stage where blocking occurred */
  stage: WhyNotStage;
  /** Human-readable reason */
  reason: string;
  /** Additional details for debugging */
  details: Record<string, unknown>;
}

/**
 * Stage-by-stage status for a document
 */
export interface WhyNotStages {
  /** Document exists in summer_chunks table */
  indexed: boolean;
  /** User has permission to access the document */
  permission_allowed: boolean;
  /** Embedding similarity was above threshold */
  embedding_similar: boolean;
  /** Made it into the initial top-K candidates */
  made_top_k: boolean;
  /** Survived reranking (if applied) */
  survived_rerank: boolean;
  /** Passed policy checks (PII, TTL, scope) */
  passed_policy: boolean;
}

/**
 * Complete analysis result for a document
 */
export interface WhyNotResult {
  /** Document ID analyzed */
  document_id: string;
  /** Whether the document was found in final results */
  found: boolean;
  /** List of blockers that prevented retrieval */
  blockers: WhyNotBlocker[];
  /** Stage-by-stage status */
  stages: WhyNotStages;
  /** Embedding similarity score (if calculated) */
  similarity_score?: number;
  /** Rank in initial candidates (if present) */
  initial_rank?: number;
  /** Rank after rerank (if present) */
  rerank_rank?: number;
  /** Actionable suggestions to improve retrieval */
  suggestions: string[];
}

/**
 * Parameters for trace-based why-not analysis
 */
export interface WhyNotTraceParams {
  /** Trace ID to analyze */
  traceId: string;
  /** User ID for permission check */
  userId: string;
  /** Document ID(s) to analyze */
  documentIds: string[];
}

/**
 * Parameters for standalone why-not analysis
 */
export interface WhyNotStandaloneParams {
  /** Query text */
  query: string;
  /** User ID for permission check */
  userId: string;
  /** Collection ID to search in */
  collectionId: string;
  /** Document ID(s) to analyze */
  documentIds: string[];
  /** Optional: retrieval config to simulate */
  config?: Partial<TraceConfig>;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Generate suggestions based on blockers
 */
function generateSuggestions(blockers: WhyNotBlocker[], similarity?: number): string[] {
  const suggestions: string[] = [];

  for (const blocker of blockers) {
    switch (blocker.stage) {
      case 'index':
        suggestions.push('Re-index the document to ensure it exists in the collection.');
        suggestions.push('Verify the document was successfully chunked and embedded.');
        break;

      case 'permission':
        suggestions.push('Check that the user has access to this collection.');
        suggestions.push('Verify the document\'s collection_id matches the query collection.');
        break;

      case 'embedding':
        if (similarity !== undefined && similarity > 0.3) {
          suggestions.push(
            `Similarity score (${similarity.toFixed(3)}) is below threshold. ` +
            'Consider lowering the threshold or improving document content.'
          );
        }
        suggestions.push('Consider adding more relevant keywords to the document.');
        suggestions.push('Try using hybrid search to catch keyword matches.');
        break;

      case 'topk':
        suggestions.push('Increase top_k parameter to retrieve more candidates.');
        suggestions.push('Enable hybrid search to improve recall.');
        break;

      case 'rerank':
        suggestions.push('Increase rerank_top_n to consider more candidates.');
        suggestions.push('Document may be semantically relevant but not query-specific enough.');
        break;

      case 'policy':
        if (blocker.details.reason === 'pii') {
          suggestions.push('Document contains PII that was filtered. Review PII policies.');
        } else if (blocker.details.reason === 'ttl') {
          suggestions.push('Document has expired. Update TTL or refresh the document.');
        } else if (blocker.details.reason === 'scope') {
          suggestions.push('Document is outside allowed scope. Check scope policies.');
        }
        break;
    }
  }

  // Remove duplicates
  return [...new Set(suggestions)];
}

// ============================================
// Main Analysis Functions
// ============================================

/**
 * Analyze why a document was not returned in a specific trace
 */
export async function analyzeWhyNotFromTrace(
  params: WhyNotTraceParams
): Promise<WhyNotResult[]> {
  const supabase = createServerClient();
  const results: WhyNotResult[] = [];

  // Fetch the trace
  const { data: traceData, error: traceError } = await supabase
    .from('fall_retrieval_traces')
    .select('*')
    .eq('id', params.traceId)
    .eq('user_id', params.userId)
    .single();

  if (traceError || !traceData) {
    throw new Error(`Trace not found: ${params.traceId}`);
  }

  const trace = traceData as StoredTrace;
  const collectionId = trace.collectionId;
  const queryText = trace.queryText;
  const events = trace.trace?.events || [];
  const config = trace.effectiveConfig || {};

  // Extract candidate IDs from trace events
  const candidatesEvent = events.find(
    (e: RetrievalEvent) => e.type === 'candidates' && e.payload?.source === 'managed'
  );
  const candidateResults = (candidatesEvent?.payload?.results as Array<{
    chunkId: string;
    rank: number;
    similarity?: number;
  }>) || [];
  const candidateIds = candidateResults.map((r) => r.chunkId);

  // Extract reranked IDs from trace events
  const rerankEvent = events.find((e: RetrievalEvent) => e.type === 'rerank');
  const rerankDelta = (rerankEvent?.payload?.delta as Array<{
    id: string;
    oldRank: number;
    newRank: number;
  }>) || [];
  const rerankedIds = rerankDelta.map((d) => d.id);

  // Extract final context IDs
  const contextEvent = events.find((e: RetrievalEvent) => e.type === 'context');
  const finalIds = (contextEvent?.payload?.selectedChunkIds as string[]) || [];

  // Analyze each document
  for (const documentId of params.documentIds) {
    const result = await analyzeDocument({
      supabase,
      documentId,
      userId: params.userId,
      collectionId,
      queryText,
      config,
      candidateResults,
      candidateIds,
      rerankedIds,
      rerankDelta,
      finalIds,
      events,
    });

    results.push(result);
  }

  return results;
}

/**
 * Analyze why a document was not returned for a given query (standalone)
 */
export async function analyzeWhyNotStandalone(
  params: WhyNotStandaloneParams
): Promise<WhyNotResult[]> {
  const supabase = createServerClient();
  const results: WhyNotResult[] = [];

  // Get query embedding
  const embedder = getEmbeddingProvider();
  const [queryEmbedding] = await embedder.embed([params.query], 'query');

  // Default config
  const config: Partial<TraceConfig> = {
    topK: params.config?.topK || 10,
    rerankEnabled: params.config?.rerankEnabled || false,
    rerankTopN: params.config?.rerankTopN || 5,
    ...params.config,
  };

  // Analyze each document
  for (const documentId of params.documentIds) {
    const result = await analyzeDocumentStandalone({
      supabase,
      documentId,
      userId: params.userId,
      collectionId: params.collectionId,
      queryText: params.query,
      queryEmbedding,
      config,
    });

    results.push(result);
  }

  return results;
}

// ============================================
// Internal Analysis Helpers
// ============================================

interface AnalyzeDocumentParams {
  supabase: ReturnType<typeof createServerClient>;
  documentId: string;
  userId: string;
  collectionId?: string;
  queryText?: string;
  config: Partial<TraceConfig>;
  candidateResults: Array<{ chunkId: string; rank: number; similarity?: number }>;
  candidateIds: string[];
  rerankedIds: string[];
  rerankDelta: Array<{ id: string; oldRank: number; newRank: number }>;
  finalIds: string[];
  events: RetrievalEvent[];
}

async function analyzeDocument(params: AnalyzeDocumentParams): Promise<WhyNotResult> {
  const {
    supabase,
    documentId,
    userId,
    collectionId,
    config,
    candidateResults,
    candidateIds,
    rerankedIds,
    rerankDelta,
    finalIds,
    events,
  } = params;

  const blockers: WhyNotBlocker[] = [];
  const stages: WhyNotStages = {
    indexed: false,
    permission_allowed: false,
    embedding_similar: false,
    made_top_k: false,
    survived_rerank: false,
    passed_policy: false,
  };

  // Check if document is in final results
  const found = finalIds.includes(documentId);

  if (found) {
    // Document was found - all stages passed
    stages.indexed = true;
    stages.permission_allowed = true;
    stages.embedding_similar = true;
    stages.made_top_k = true;
    stages.survived_rerank = true;
    stages.passed_policy = true;

    const candidateInfo = candidateResults.find((r) => r.chunkId === documentId);
    const rerankInfo = rerankDelta.find((d) => d.id === documentId);

    return {
      document_id: documentId,
      found: true,
      blockers: [],
      stages,
      similarity_score: candidateInfo?.similarity,
      initial_rank: candidateInfo?.rank,
      rerank_rank: rerankInfo?.newRank,
      suggestions: [],
    };
  }

  // Stage 1: Check if document is indexed
  const { data: chunks, error: chunkError } = await supabase
    .from('summer_chunks')
    .select('id, collection_id, user_id, embedding')
    .or(`id.eq.${documentId},document_id.eq.${documentId}`)
    .limit(10);

  if (chunkError || !chunks || chunks.length === 0) {
    blockers.push({
      stage: 'index',
      reason: 'Document not found in index',
      details: { document_id: documentId },
    });

    return {
      document_id: documentId,
      found: false,
      blockers,
      stages,
      suggestions: generateSuggestions(blockers),
    };
  }

  stages.indexed = true;

  // Stage 2: Check permissions
  const chunk = chunks[0];
  const hasPermission = chunk.user_id === userId;
  const collectionMatch = !collectionId || chunk.collection_id === collectionId;

  if (!hasPermission || !collectionMatch) {
    stages.permission_allowed = false;
    blockers.push({
      stage: 'permission',
      reason: !hasPermission
        ? 'User does not have access to this document'
        : 'Document is not in the queried collection',
      details: {
        document_user_id: chunk.user_id,
        query_user_id: userId,
        document_collection_id: chunk.collection_id,
        query_collection_id: collectionId,
      },
    });

    return {
      document_id: documentId,
      found: false,
      blockers,
      stages,
      suggestions: generateSuggestions(blockers),
    };
  }

  stages.permission_allowed = true;

  // Stage 3: Check embedding similarity
  const candidateInfo = candidateResults.find(
    (r) => r.chunkId === documentId || chunks.some((c) => c.id === r.chunkId)
  );

  if (candidateInfo) {
    stages.embedding_similar = true;
    stages.made_top_k = true;
  } else {
    // Document wasn't in candidates - check if it was due to similarity
    blockers.push({
      stage: 'embedding',
      reason: 'Document did not meet similarity threshold for initial retrieval',
      details: {
        threshold: config.hybridAlpha || 0.5,
        top_k: config.topK || 10,
        candidate_count: candidateIds.length,
      },
    });

    return {
      document_id: documentId,
      found: false,
      blockers,
      stages,
      suggestions: generateSuggestions(blockers),
    };
  }

  // Stage 4: Check if made top-K
  const topK = config.topK || 10;
  if (candidateInfo && candidateInfo.rank <= topK) {
    stages.made_top_k = true;
  } else if (candidateInfo) {
    stages.made_top_k = false;
    blockers.push({
      stage: 'topk',
      reason: `Document ranked #${candidateInfo.rank}, but only top ${topK} were selected`,
      details: {
        rank: candidateInfo.rank,
        top_k: topK,
        similarity: candidateInfo.similarity,
      },
    });

    return {
      document_id: documentId,
      found: false,
      blockers,
      stages,
      similarity_score: candidateInfo.similarity,
      initial_rank: candidateInfo.rank,
      suggestions: generateSuggestions(blockers, candidateInfo.similarity),
    };
  }

  // Stage 5: Check rerank survival
  if (config.rerankEnabled && rerankedIds.length > 0) {
    const rerankInfo = rerankDelta.find((d) => d.id === documentId);

    if (rerankInfo) {
      stages.survived_rerank = true;
    } else {
      stages.survived_rerank = false;
      blockers.push({
        stage: 'rerank',
        reason: 'Document was eliminated during reranking',
        details: {
          rerank_top_n: config.rerankTopN || 5,
          initial_rank: candidateInfo?.rank,
          reranked_count: rerankedIds.length,
        },
      });

      return {
        document_id: documentId,
        found: false,
        blockers,
        stages,
        similarity_score: candidateInfo?.similarity,
        initial_rank: candidateInfo?.rank,
        suggestions: generateSuggestions(blockers, candidateInfo?.similarity),
      };
    }
  } else {
    stages.survived_rerank = true; // Rerank not applied
  }

  // Stage 6: Check policy filters
  const errorEvents = events.filter((e: RetrievalEvent) => e.type === 'error');
  const piiBlocked = errorEvents.some(
    (e: RetrievalEvent) =>
      e.payload?.reason === 'pii_blocked' &&
      (e.payload?.chunk_id === documentId || e.payload?.document_id === documentId)
  );

  if (piiBlocked) {
    stages.passed_policy = false;
    blockers.push({
      stage: 'policy',
      reason: 'Document was blocked due to PII policy',
      details: { reason: 'pii' },
    });

    return {
      document_id: documentId,
      found: false,
      blockers,
      stages,
      similarity_score: candidateInfo?.similarity,
      initial_rank: candidateInfo?.rank,
      suggestions: generateSuggestions(blockers),
    };
  }

  stages.passed_policy = true;

  // If we got here but document wasn't found, something unexpected happened
  if (!found) {
    blockers.push({
      stage: 'policy',
      reason: 'Document passed all stages but was not in final results (unknown reason)',
      details: {
        stages,
        final_ids_count: finalIds.length,
      },
    });
  }

  const rerankInfo = rerankDelta.find((d) => d.id === documentId);

  return {
    document_id: documentId,
    found,
    blockers,
    stages,
    similarity_score: candidateInfo?.similarity,
    initial_rank: candidateInfo?.rank,
    rerank_rank: rerankInfo?.newRank,
    suggestions: generateSuggestions(blockers, candidateInfo?.similarity),
  };
}

interface AnalyzeDocumentStandaloneParams {
  supabase: ReturnType<typeof createServerClient>;
  documentId: string;
  userId: string;
  collectionId: string;
  queryText: string;
  queryEmbedding: number[];
  config: Partial<TraceConfig>;
}

async function analyzeDocumentStandalone(
  params: AnalyzeDocumentStandaloneParams
): Promise<WhyNotResult> {
  const {
    supabase,
    documentId,
    userId,
    collectionId,
    queryEmbedding,
    config,
  } = params;

  const blockers: WhyNotBlocker[] = [];
  const stages: WhyNotStages = {
    indexed: false,
    permission_allowed: false,
    embedding_similar: false,
    made_top_k: false,
    survived_rerank: false,
    passed_policy: false,
  };

  // Stage 1: Check if document is indexed
  const { data: chunks, error: chunkError } = await supabase
    .from('summer_chunks')
    .select('id, collection_id, user_id, embedding, content')
    .or(`id.eq.${documentId},document_id.eq.${documentId}`)
    .eq('collection_id', collectionId)
    .limit(10);

  if (chunkError || !chunks || chunks.length === 0) {
    blockers.push({
      stage: 'index',
      reason: 'Document not found in index for this collection',
      details: { document_id: documentId, collection_id: collectionId },
    });

    return {
      document_id: documentId,
      found: false,
      blockers,
      stages,
      suggestions: generateSuggestions(blockers),
    };
  }

  stages.indexed = true;

  // Stage 2: Check permissions
  const chunk = chunks[0];
  const hasPermission = chunk.user_id === userId;

  if (!hasPermission) {
    stages.permission_allowed = false;
    blockers.push({
      stage: 'permission',
      reason: 'User does not have access to this document',
      details: {
        document_user_id: chunk.user_id,
        query_user_id: userId,
      },
    });

    return {
      document_id: documentId,
      found: false,
      blockers,
      stages,
      suggestions: generateSuggestions(blockers),
    };
  }

  stages.permission_allowed = true;

  // Stage 3: Calculate embedding similarity
  let similarity = 0;
  if (chunk.embedding && queryEmbedding) {
    // Parse embedding if it's a string
    const docEmbedding = typeof chunk.embedding === 'string'
      ? JSON.parse(chunk.embedding)
      : chunk.embedding;

    similarity = cosineSimilarity(queryEmbedding, docEmbedding);
  }

  const threshold = config.hybridAlpha || 0.5;

  if (similarity >= threshold) {
    stages.embedding_similar = true;
  } else {
    stages.embedding_similar = false;
    blockers.push({
      stage: 'embedding',
      reason: `Similarity score (${similarity.toFixed(3)}) is below threshold (${threshold})`,
      details: {
        similarity,
        threshold,
        content_preview: chunk.content?.slice(0, 100),
      },
    });

    return {
      document_id: documentId,
      found: false,
      blockers,
      stages,
      similarity_score: similarity,
      suggestions: generateSuggestions(blockers, similarity),
    };
  }

  // Stage 4: Simulate top-K ranking
  // This would require running the full search - we estimate based on similarity
  const topK = config.topK || 10;
  stages.made_top_k = similarity > 0.7; // Approximate heuristic

  if (!stages.made_top_k) {
    blockers.push({
      stage: 'topk',
      reason: `Similarity score (${similarity.toFixed(3)}) may not rank in top ${topK}`,
      details: {
        similarity,
        top_k: topK,
        note: 'Exact ranking requires full search simulation',
      },
    });
  }

  // Stage 5: Rerank estimation (simplified)
  if (config.rerankEnabled) {
    stages.survived_rerank = similarity > 0.75; // Approximate heuristic

    if (!stages.survived_rerank) {
      blockers.push({
        stage: 'rerank',
        reason: 'Document may be eliminated during reranking',
        details: {
          similarity,
          rerank_top_n: config.rerankTopN,
          note: 'Exact rerank requires full pipeline simulation',
        },
      });
    }
  } else {
    stages.survived_rerank = true;
  }

  // Stage 6: Policy check (simplified - can't fully simulate without policies)
  stages.passed_policy = true;

  const found = stages.embedding_similar && stages.made_top_k && stages.survived_rerank && stages.passed_policy;

  return {
    document_id: documentId,
    found,
    blockers,
    stages,
    similarity_score: similarity,
    suggestions: generateSuggestions(blockers, similarity),
  };
}

// ============================================
// Exports
// ============================================

