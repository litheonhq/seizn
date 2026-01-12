/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient } from '@/lib/supabase';

export interface RegressionCheckParams {
  userId: string;
  datasetId: string;
  metricKey: string; // e.g. avg_context_precision
  dropThreshold: number; // e.g. 0.02 means -2% absolute
}

export interface RegressionCheckResult {
  baselineRunId?: string;
  candidateRunId?: string;
  baselineValue?: number;
  candidateValue?: number;
  delta?: number;
  isRegression: boolean;
}

/**
 * MVP regression detector:
 * - Finds two most recent successful runs
 * - Compares `summary_metrics[metricKey]`
 */
export async function detectRegression(params: RegressionCheckParams): Promise<RegressionCheckResult> {
  const supabase = createServerClient();

  const { data: runs, error } = await supabase
    .from('fall_eval_runs')
    .select('id, summary_metrics, finished_at')
    .eq('user_id', params.userId)
    .eq('dataset_id', params.datasetId)
    .eq('status', 'success')
    .order('finished_at', { ascending: false })
    .limit(2);

  if (error) throw error;

  if (!runs || runs.length < 2) {
    return { isRegression: false };
  }

  const [latest, previous] = runs as any[];

  const candidateValue = Number(latest?.summary_metrics?.[params.metricKey]);
  const baselineValue = Number(previous?.summary_metrics?.[params.metricKey]);

  if (!Number.isFinite(candidateValue) || !Number.isFinite(baselineValue)) {
    return { isRegression: false };
  }

  const delta = candidateValue - baselineValue;
  const isRegression = delta < -Math.abs(params.dropThreshold);

  return {
    baselineRunId: previous.id,
    candidateRunId: latest.id,
    baselineValue,
    candidateValue,
    delta,
    isRegression,
  };
}
