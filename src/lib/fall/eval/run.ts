import { createServerClient } from '@/lib/supabase';
import { retrieve } from '@/lib/summer';
import type { RetrievalConfig } from '@/lib/summer/types';
import { computeContextPrecisionRecall } from './metrics';

export interface RunEvalParams {
  userId: string;
  datasetId: string;
  plan: string;
  collectionId: string;

  autopilot?: boolean;
  override?: Partial<RetrievalConfig>;

  limitCases?: number;
}

export interface RunEvalResult {
  runId: string;
  summary: Record<string, unknown>;
}

/**
 * MVP evaluation runner:
 * - Runs retrieval for each case
 * - Computes deterministic metrics if `expected_chunk_ids` exist
 * - Stores per-case metrics + run summary
 *
 * For heavy datasets, move this into a background worker.
 */
export async function runEval(params: RunEvalParams): Promise<RunEvalResult> {
  const supabase = createServerClient();

  const { data: runRow, error: runErr } = await supabase
    .from('fall_eval_runs')
    .insert({
      user_id: params.userId,
      dataset_id: params.datasetId,
      status: 'running',
      config: {
        plan: params.plan,
        collection_id: params.collectionId,
        autopilot: params.autopilot ?? true,
        override: params.override ?? {},
      },
    })
    .select('id')
    .single();

  if (runErr) throw runErr;
  const runId = runRow.id as string;

  try {
    const limit = params.limitCases ?? 50;

    const { data: cases, error: caseErr } = await supabase
      .from('fall_eval_cases')
      .select('id, query_text, expected_chunk_ids')
      .eq('dataset_id', params.datasetId)
      .eq('user_id', params.userId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (caseErr) throw caseErr;

    let sumPrecision = 0;
    let sumRecall = 0;
    let sumMrr = 0;
    let nPrec = 0;
    let nRec = 0;
    let nMrr = 0;

    for (const c of cases ?? []) {
      const query = String(c.query_text ?? '');
      const expectedChunkIds = (c.expected_chunk_ids as string[] | null) ?? null;

      const res = await retrieve({
        userId: params.userId,
        plan: params.plan,
        collectionId: params.collectionId,
        query,
        autopilot: params.autopilot ?? true,
        override: params.override,
        includeTrace: true,
      });

      const retrievedChunkIds = res.results.map((r) => r.chunkId);

      const det = computeContextPrecisionRecall({ retrievedChunkIds, expectedChunkIds });

      const metrics: Record<string, unknown> = {
        ...det,
      };

      if (typeof det.context_precision === 'number') {
        sumPrecision += det.context_precision;
        nPrec += 1;
      }
      if (typeof det.context_recall === 'number') {
        sumRecall += det.context_recall;
        nRec += 1;
      }
      if (typeof det.mrr === 'number') {
        sumMrr += det.mrr;
        nMrr += 1;
      }

      const { error: insertErr } = await supabase.from('fall_eval_results').insert({
        run_id: runId,
        case_id: c.id,
        retrieved_chunk_ids: retrievedChunkIds,
        metrics,
        debug: {
          config: res.config,
          trace: res.trace ?? null,
        },
      });

      if (insertErr) throw insertErr;
    }

    const summary = {
      cases: (cases ?? []).length,
      avg_context_precision: nPrec ? sumPrecision / nPrec : null,
      avg_context_recall: nRec ? sumRecall / nRec : null,
      avg_mrr: nMrr ? sumMrr / nMrr : null,
    };

    await supabase
      .from('fall_eval_runs')
      .update({
        status: 'success',
        finished_at: new Date().toISOString(),
        summary_metrics: summary,
        error: null,
      })
      .eq('id', runId);

    return { runId, summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await supabase
      .from('fall_eval_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: message,
      })
      .eq('id', runId);

    throw err;
  }
}
