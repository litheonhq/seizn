/**
 * Seizn Eval Pipeline - Enhanced Evaluation Runner
 * Runs evaluations with comprehensive metrics (MRR, Recall@K, NDCG, Precision@K, Hit Rate)
 */

import { createServerClient } from '@/lib/supabase';
import { retrieve } from '@/lib/summer';
import type { RetrievalConfig } from '@/lib/summer/types';
import { computeAllMetrics, computeAggregateMetrics } from './metrics';
import { judgeFaithfulness } from './judge';
import type {
  EvalRunConfig,
  EvalRun,
  EvalCaseResult,
  EvalCaseMetrics,
  EvalRunMetrics,
  KValue,
} from './types';

// ============================================
// Types
// ============================================

export interface RunEvalParams {
  userId: string;
  datasetId: string;
  plan: string;
  collectionId: string;

  autopilot?: boolean;
  override?: Partial<RetrievalConfig>;

  /** Maximum cases to evaluate */
  limitCases?: number;
  /** K values for @K metrics */
  kValues?: KValue[];
  /** Enable LLM-as-judge faithfulness scoring (costly) */
  enableFaithfulness?: boolean;
  /** Model for faithfulness scoring */
  faithfulnessModel?: 'haiku' | 'sonnet';
  /** Custom answer generator for faithfulness eval */
  answerGenerator?: (query: string, chunks: { id: string; text: string }[]) => Promise<string>;
  /** Callback for progress updates */
  onProgress?: (progress: { current: number; total: number; caseId: string }) => void;
}

export interface RunEvalResult {
  runId: string;
  status: 'success' | 'failed';
  summary: EvalRunMetrics;
  durationMs: number;
  casesEvaluated: number;
}

// ============================================
// Main Runner
// ============================================

/**
 * Enhanced evaluation runner with comprehensive metrics
 */
export async function runEvaluation(params: RunEvalParams): Promise<RunEvalResult> {
  const supabase = createServerClient();
  const startTime = Date.now();

  const config: EvalRunConfig = {
    plan: params.plan,
    collectionId: params.collectionId,
    autopilot: params.autopilot ?? true,
    override: params.override ?? {},
    kValues: params.kValues ?? [5, 10, 20],
    enableFaithfulness: params.enableFaithfulness ?? false,
    faithfulnessModel: params.faithfulnessModel ?? 'haiku',
    limitCases: params.limitCases ?? 50,
  };

  // Create run record
  const { data: runRow, error: runErr } = await supabase
    .from('fall_eval_runs')
    .insert({
      user_id: params.userId,
      dataset_id: params.datasetId,
      status: 'running',
      config,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (runErr) {
    throw new Error(`Failed to create eval run: ${runErr.message}`);
  }

  const runId = runRow.id as string;

  try {
    // Fetch cases
    const { data: cases, error: caseErr } = await supabase
      .from('fall_eval_cases')
      .select('id, query_text, expected_chunk_ids, relevance_scores, metadata')
      .eq('dataset_id', params.datasetId)
      .eq('user_id', params.userId)
      .order('created_at', { ascending: true })
      .limit(config.limitCases ?? 50);

    if (caseErr) {
      throw new Error(`Failed to fetch cases: ${caseErr.message}`);
    }

    if (!cases || cases.length === 0) {
      throw new Error('No evaluation cases found in dataset');
    }

    const allCaseMetrics: EvalCaseMetrics[] = [];

    // Process each case
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      const query = String(c.query_text ?? '');
      const expectedIds = (c.expected_chunk_ids as string[] | null) ?? [];
      const relevanceScores = (c.relevance_scores as number[] | null) ?? undefined;

      // Notify progress
      if (params.onProgress) {
        params.onProgress({ current: i + 1, total: cases.length, caseId: c.id });
      }

      const caseStartTime = Date.now();

      // Run retrieval
      const res = await retrieve({
        userId: params.userId,
        plan: params.plan,
        collectionId: params.collectionId,
        query,
        autopilot: params.autopilot ?? true,
        override: params.override,
        includeTrace: true,
      });

      const retrievedIds = res.results.map((r) => r.chunkId);
      const caseLatencyMs = Date.now() - caseStartTime;

      // Compute deterministic metrics
      let metrics: EvalCaseMetrics = {};
      if (expectedIds.length > 0) {
        metrics = computeAllMetrics({
          retrievedIds,
          expectedIds,
          relevanceScores,
          kValues: config.kValues,
        });
      }

      // LLM-as-judge faithfulness scoring (optional)
      if (config.enableFaithfulness && res.results.length > 0) {
        const contextChunks = res.results.map((r) => ({
          id: r.chunkId,
          text: r.text ?? '',
        }));

        let answer: string;
        if (params.answerGenerator) {
          answer = await params.answerGenerator(query, contextChunks);
        } else {
          answer = contextChunks
            .slice(0, 5)
            .map((ch) => ch.text)
            .join('\n\n');
        }

        const faithResult = await judgeFaithfulness({
          answer,
          contextChunks,
          model: config.faithfulnessModel,
        });

        if (faithResult) {
          metrics.faithfulness = faithResult.score;
          metrics.faithfulness_explanation = faithResult.explanation;
        }
      }

      allCaseMetrics.push(metrics);

      // Store case result
      const { error: insertErr } = await supabase.from('fall_eval_results').insert({
        run_id: runId,
        case_id: c.id,
        retrieved_chunk_ids: retrievedIds,
        metrics,
        debug: {
          config: res.config,
          trace: res.trace ?? null,
          latency_ms: caseLatencyMs,
          results_count: res.results.length,
        },
      });

      if (insertErr) {
        console.warn(`Failed to insert result for case ${c.id}:`, insertErr.message);
      }
    }

    // Compute aggregate metrics
    const summary = computeAggregateMetrics(allCaseMetrics);
    const durationMs = Date.now() - startTime;

    // Update run record with success
    await supabase
      .from('fall_eval_runs')
      .update({
        status: 'success',
        finished_at: new Date().toISOString(),
        summary_metrics: summary,
        duration_ms: durationMs,
        error: null,
      })
      .eq('id', runId);

    return {
      runId,
      status: 'success',
      summary,
      durationMs,
      casesEvaluated: cases.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const durationMs = Date.now() - startTime;

    await supabase
      .from('fall_eval_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        error: message,
      })
      .eq('id', runId);

    throw err;
  }
}

// ============================================
// Run Management
// ============================================

/**
 * Get an evaluation run by ID
 */
export async function getEvalRun(params: {
  userId: string;
  runId: string;
}): Promise<EvalRun | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('fall_eval_runs')
    .select('*')
    .eq('id', params.runId)
    .eq('user_id', params.userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get run: ${error.message}`);
  }

  return mapRunRow(data);
}

/**
 * List evaluation runs for a dataset
 */
export async function listEvalRuns(params: {
  userId: string;
  datasetId?: string;
  limit?: number;
  status?: string;
}): Promise<EvalRun[]> {
  const supabase = createServerClient();

  let query = supabase
    .from('fall_eval_runs')
    .select('*')
    .eq('user_id', params.userId)
    .order('started_at', { ascending: false })
    .limit(params.limit ?? 20);

  if (params.datasetId) {
    query = query.eq('dataset_id', params.datasetId);
  }
  if (params.status) {
    query = query.eq('status', params.status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list runs: ${error.message}`);
  }

  return (data ?? []).map(mapRunRow);
}

/**
 * Get results for a run
 */
export async function getRunResults(params: {
  userId: string;
  runId: string;
  limit?: number;
  offset?: number;
}): Promise<{ results: EvalCaseResult[]; total: number }> {
  const supabase = createServerClient();

  const limit = params.limit ?? 100;
  const offset = params.offset ?? 0;

  // First verify the run belongs to the user
  const { data: run } = await supabase
    .from('fall_eval_runs')
    .select('id')
    .eq('id', params.runId)
    .eq('user_id', params.userId)
    .single();

  if (!run) {
    return { results: [], total: 0 };
  }

  const { data, count, error } = await supabase
    .from('fall_eval_results')
    .select('*', { count: 'exact' })
    .eq('run_id', params.runId)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to get results: ${error.message}`);
  }

  return {
    results: (data ?? []).map(mapResultRow),
    total: count ?? 0,
  };
}

/**
 * Cancel a running evaluation
 */
export async function cancelEvalRun(params: {
  userId: string;
  runId: string;
}): Promise<boolean> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('fall_eval_runs')
    .update({
      status: 'cancelled',
      finished_at: new Date().toISOString(),
      error: 'Cancelled by user',
    })
    .eq('id', params.runId)
    .eq('user_id', params.userId)
    .eq('status', 'running');

  if (error) {
    throw new Error(`Failed to cancel run: ${error.message}`);
  }

  return true;
}

/**
 * Delete an evaluation run and its results
 */
export async function deleteEvalRun(params: {
  userId: string;
  runId: string;
}): Promise<boolean> {
  const supabase = createServerClient();

  // Delete results first (cascade should handle this, but being explicit)
  await supabase.from('fall_eval_results').delete().eq('run_id', params.runId);

  const { error } = await supabase
    .from('fall_eval_runs')
    .delete()
    .eq('id', params.runId)
    .eq('user_id', params.userId);

  if (error) {
    throw new Error(`Failed to delete run: ${error.message}`);
  }

  return true;
}

// ============================================
// Helper Functions
// ============================================

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapRunRow(row: any): EvalRun {
  return {
    id: row.id,
    userId: row.user_id,
    datasetId: row.dataset_id,
    status: row.status,
    config: row.config ?? {},
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    summaryMetrics: row.summary_metrics ?? undefined,
    error: row.error ?? undefined,
    durationMs: row.duration_ms ?? undefined,
  };
}

function mapResultRow(row: any): EvalCaseResult {
  return {
    id: row.id,
    runId: row.run_id,
    caseId: row.case_id,
    retrievedIds: row.retrieved_chunk_ids ?? [],
    metrics: row.metrics ?? {},
    debug: row.debug ?? undefined,
    createdAt: row.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
