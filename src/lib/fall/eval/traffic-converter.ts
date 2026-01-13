/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export interface TrafficSamplingConfig {
  /** Number of traces to sample */
  sampleSize: number;
  /** Minimum results count to include (filter out low-quality queries) */
  minResultsCount?: number;
  /** Maximum results count to include */
  maxResultsCount?: number;
  /** Filter by collection ID */
  collectionId?: string;
  /** Filter by time range (days back from now) */
  daysBack?: number;
  /** Sampling strategy */
  strategy?: 'random' | 'recent' | 'diverse';
  /** Include only traces without errors */
  excludeErrors?: boolean;
}

export interface TrafficToEvalResult {
  datasetId: string;
  casesCreated: number;
  sampledTraceIds: string[];
}

export interface EvalCaseFromTraffic {
  queryText: string;
  collectionId: string;
  expectedChunkIds?: string[];
  metadata?: {
    sourceTraceId: string;
    sourceRequestId: string;
    originalResultsCount: number;
    sampledAt: string;
  };
}

// ============================================
// Core Functions
// ============================================

/**
 * Sample traces from fall_retrieval_traces table
 */
export async function sampleTrafficTraces(params: {
  userId: string;
  config: TrafficSamplingConfig;
}): Promise<any[]> {
  const supabase = createServerClient();
  const { userId, config } = params;

  let query = supabase
    .from('fall_retrieval_traces')
    .select('id, request_id, query_text, collection_id, results_count, effective_config, error, trace, created_at')
    .eq('user_id', userId)
    .not('query_text', 'is', null);

  // Filter by collection
  if (config.collectionId) {
    query = query.eq('collection_id', config.collectionId);
  }

  // Filter by results count
  if (config.minResultsCount !== undefined) {
    query = query.gte('results_count', config.minResultsCount);
  }
  if (config.maxResultsCount !== undefined) {
    query = query.lte('results_count', config.maxResultsCount);
  }

  // Filter by time range
  if (config.daysBack) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - config.daysBack);
    query = query.gte('created_at', cutoff.toISOString());
  }

  // Exclude errors
  if (config.excludeErrors !== false) {
    query = query.is('error', null);
  }

  // Apply sampling strategy
  switch (config.strategy) {
    case 'recent':
      query = query.order('created_at', { ascending: false });
      break;
    case 'diverse':
      // For diverse sampling, we'll fetch more and dedupe by query_hash
      query = query.order('created_at', { ascending: false }).limit(config.sampleSize * 3);
      break;
    case 'random':
    default:
      // Random sampling: fetch more and shuffle
      query = query.order('created_at', { ascending: false }).limit(config.sampleSize * 2);
      break;
  }

  if (config.strategy !== 'diverse' && config.strategy !== 'random') {
    query = query.limit(config.sampleSize);
  }

  const { data: traces, error } = await query;

  if (error) {
    throw new Error(`Failed to sample traces: ${error.message}`);
  }

  if (!traces || traces.length === 0) {
    return [];
  }

  // Apply sampling strategy post-fetch
  let sampled = traces;

  if (config.strategy === 'random') {
    // Shuffle and take sample size
    sampled = shuffleArray([...traces]).slice(0, config.sampleSize);
  } else if (config.strategy === 'diverse') {
    // Dedupe by query text (simple diversity)
    const seen = new Set<string>();
    sampled = [];
    for (const trace of traces) {
      const queryNorm = normalizeQuery(trace.query_text);
      if (!seen.has(queryNorm)) {
        seen.add(queryNorm);
        sampled.push(trace);
        if (sampled.length >= config.sampleSize) break;
      }
    }
  }

  return sampled;
}

/**
 * Convert sampled traces to eval cases and create a dataset
 */
export async function convertTrafficToEvalCases(params: {
  userId: string;
  datasetName: string;
  traces: any[];
  includeRetrievedAsExpected?: boolean;
}): Promise<TrafficToEvalResult> {
  const supabase = createServerClient();
  const { userId, datasetName, traces, includeRetrievedAsExpected } = params;

  if (traces.length === 0) {
    throw new Error('No traces to convert');
  }

  // Create dataset
  const datasetId = crypto.randomUUID();
  const { error: datasetErr } = await supabase.from('fall_eval_datasets').insert({
    id: datasetId,
    user_id: userId,
    name: datasetName,
    description: `Auto-generated from ${traces.length} traffic traces`,
    source: 'traffic_conversion',
    metadata: {
      generated_at: new Date().toISOString(),
      trace_count: traces.length,
    },
  });

  if (datasetErr) {
    // Try without dataset table (may not exist yet)
    console.warn('Dataset table insert failed, continuing:', datasetErr.message);
  }

  // Convert traces to eval cases
  const cases: any[] = [];
  const sampledTraceIds: string[] = [];

  for (const trace of traces) {
    // Extract retrieved chunk IDs from trace if available
    let expectedChunkIds: string[] | undefined;
    if (includeRetrievedAsExpected && trace.trace?.events) {
      const retrievalEvent = trace.trace.events.find(
        (e: any) => e.type === 'retrieval_complete' || e.type === 'rerank_complete'
      );
      if (retrievalEvent?.payload?.chunk_ids) {
        expectedChunkIds = retrievalEvent.payload.chunk_ids;
      }
    }

    cases.push({
      id: crypto.randomUUID(),
      dataset_id: datasetId,
      user_id: userId,
      query_text: trace.query_text,
      expected_chunk_ids: expectedChunkIds ?? null,
      metadata: {
        source_trace_id: trace.id,
        source_request_id: trace.request_id,
        original_results_count: trace.results_count,
        collection_id: trace.collection_id,
        sampled_at: new Date().toISOString(),
      },
    });

    sampledTraceIds.push(trace.id);
  }

  // Batch insert cases
  const { error: casesErr } = await supabase.from('fall_eval_cases').insert(cases);

  if (casesErr) {
    throw new Error(`Failed to insert eval cases: ${casesErr.message}`);
  }

  return {
    datasetId,
    casesCreated: cases.length,
    sampledTraceIds,
  };
}

/**
 * Main function: Sample traffic and convert to eval dataset
 */
export async function generateEvalDatasetFromTraffic(params: {
  userId: string;
  datasetName?: string;
  config: TrafficSamplingConfig;
  includeRetrievedAsExpected?: boolean;
}): Promise<TrafficToEvalResult> {
  const { userId, config, includeRetrievedAsExpected } = params;

  // Sample traces
  const traces = await sampleTrafficTraces({ userId, config });

  if (traces.length === 0) {
    throw new Error('No eligible traces found for sampling');
  }

  // Generate dataset name if not provided
  const datasetName =
    params.datasetName ?? `Traffic Sample ${new Date().toISOString().split('T')[0]} (${traces.length} cases)`;

  // Convert to eval cases
  return convertTrafficToEvalCases({
    userId,
    datasetName,
    traces,
    includeRetrievedAsExpected,
  });
}

// ============================================
// Utility Functions
// ============================================

function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 100); // First 100 chars for comparison
}

// ============================================
// Statistics and Analysis
// ============================================

/**
 * Get statistics about available traffic for conversion
 */
export async function getTrafficStats(params: {
  userId: string;
  daysBack?: number;
  collectionId?: string;
}): Promise<{
  totalTraces: number;
  tracesWithResults: number;
  uniqueQueries: number;
  collections: string[];
  dateRange: { oldest?: string; newest?: string };
}> {
  const supabase = createServerClient();
  const { userId, daysBack, collectionId } = params;

  let query = supabase
    .from('fall_retrieval_traces')
    .select('id, query_text, query_hash, collection_id, results_count, created_at', { count: 'exact' })
    .eq('user_id', userId)
    .is('error', null);

  if (collectionId) {
    query = query.eq('collection_id', collectionId);
  }

  if (daysBack) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    query = query.gte('created_at', cutoff.toISOString());
  }

  const { data: traces, count, error } = await query.order('created_at', { ascending: false }).limit(1000);

  if (error) {
    throw new Error(`Failed to get traffic stats: ${error.message}`);
  }

  const uniqueHashes = new Set<string>();
  const collections = new Set<string>();
  let tracesWithResults = 0;
  let oldest: string | undefined;
  let newest: string | undefined;

  for (const trace of traces ?? []) {
    if (trace.query_hash) uniqueHashes.add(trace.query_hash);
    if (trace.collection_id) collections.add(trace.collection_id);
    if (trace.results_count > 0) tracesWithResults++;

    if (!newest) newest = trace.created_at;
    oldest = trace.created_at;
  }

  return {
    totalTraces: count ?? traces?.length ?? 0,
    tracesWithResults,
    uniqueQueries: uniqueHashes.size,
    collections: Array.from(collections),
    dateRange: { oldest, newest },
  };
}
