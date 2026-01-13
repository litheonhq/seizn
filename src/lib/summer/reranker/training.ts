/**
 * Reranker Training Pipeline
 *
 * Manages training runs for reranker models.
 * Supports training configuration, progress tracking, and checkpointing.
 */

import { createServerClient } from '@/lib/supabase';
import type {
  TrainingConfig,
  TrainingRun,
  TrainingMetrics,
  Checkpoint,
  TrainingDataset,
} from './types';
import { DEFAULT_TRAINING_CONFIG } from './types';
import { getDataset, splitDataset } from './dataset';

export interface StartTrainingParams {
  datasetId: string;
  config?: Partial<TrainingConfig>;
  webhookUrl?: string;
}

export interface TrainingUpdate {
  runId: string;
  epoch: number;
  step: number;
  metrics: {
    trainLoss: number;
    validationLoss?: number;
    mrr?: number;
    ndcg?: number;
  };
}

/**
 * Create a new training run
 */
export async function createTrainingRun(params: StartTrainingParams): Promise<TrainingRun> {
  const supabase = createServerClient();

  // Validate dataset exists and has samples
  const dataset = await getDataset(params.datasetId);
  if (!dataset) {
    throw new Error('Dataset not found');
  }

  if (dataset.sampleCount < 10) {
    throw new Error('Dataset must have at least 10 samples');
  }

  const config: TrainingConfig = {
    ...DEFAULT_TRAINING_CONFIG,
    ...params.config,
  };

  const run: TrainingRun = {
    id: crypto.randomUUID(),
    datasetId: params.datasetId,
    config,
    status: 'pending',
    progress: {
      currentEpoch: 0,
      currentStep: 0,
      totalSteps: estimateTotalSteps(dataset.sampleCount, config),
      percentComplete: 0,
    },
    metrics: {
      trainLoss: [],
      validationLoss: [],
      mrr: [],
      ndcg: [],
      map: [],
      bestEpoch: 0,
      bestMRR: 0,
      bestNDCG: 0,
    },
    checkpoints: [],
    logs: [],
  };

  const { error } = await supabase.from('summer_reranker_runs').insert({
    id: run.id,
    dataset_id: run.datasetId,
    config: run.config,
    status: run.status,
    progress: run.progress,
    metrics: run.metrics,
    checkpoints: [],
    logs: [],
    webhook_url: params.webhookUrl,
  });

  if (error) {
    throw new Error(`Failed to create training run: ${error.message}`);
  }

  return run;
}

/**
 * Estimate total training steps
 */
function estimateTotalSteps(sampleCount: number, config: TrainingConfig): number {
  const trainSamples = Math.floor(sampleCount * 0.8); // Assuming 80% train split
  const stepsPerEpoch = Math.ceil(trainSamples / config.batchSize);
  return stepsPerEpoch * config.epochs;
}

/**
 * Start training execution (dispatches to training worker)
 */
export async function startTraining(runId: string): Promise<{ started: boolean; message: string }> {
  const supabase = createServerClient();

  // Get run and dataset
  const { data: run } = await supabase
    .from('summer_reranker_runs')
    .select('*, summer_reranker_datasets(*)')
    .eq('id', runId)
    .single();

  if (!run) {
    return { started: false, message: 'Training run not found' };
  }

  if (run.status !== 'pending') {
    return { started: false, message: `Cannot start run in ${run.status} status` };
  }

  // Update status to training
  await supabase
    .from('summer_reranker_runs')
    .update({
      status: 'training',
      started_at: new Date().toISOString(),
    })
    .eq('id', runId);

  // In production, this would dispatch to a training worker
  // For now, we'll simulate the training process structure
  await supabase.from('summer_reranker_runs').update({
    logs: ['Training started...', `Config: ${JSON.stringify(run.config)}`],
  }).eq('id', runId);

  return { started: true, message: 'Training started' };
}

/**
 * Update training progress
 */
export async function updateTrainingProgress(update: TrainingUpdate): Promise<void> {
  const supabase = createServerClient();

  const { data: run } = await supabase
    .from('summer_reranker_runs')
    .select('progress, metrics, logs, config')
    .eq('id', update.runId)
    .single();

  if (!run) return;

  const progress = {
    currentEpoch: update.epoch,
    currentStep: update.step,
    totalSteps: run.progress.totalSteps,
    percentComplete: Math.round((update.step / run.progress.totalSteps) * 100),
  };

  const metrics: TrainingMetrics = {
    ...run.metrics,
    trainLoss: [...run.metrics.trainLoss, update.metrics.trainLoss],
  };

  if (update.metrics.validationLoss !== undefined) {
    metrics.validationLoss = [...run.metrics.validationLoss, update.metrics.validationLoss];
  }

  if (update.metrics.mrr !== undefined) {
    metrics.mrr = [...run.metrics.mrr, update.metrics.mrr];
    if (update.metrics.mrr > metrics.bestMRR) {
      metrics.bestMRR = update.metrics.mrr;
      metrics.bestEpoch = update.epoch;
    }
  }

  if (update.metrics.ndcg !== undefined) {
    metrics.ndcg = [...run.metrics.ndcg, update.metrics.ndcg];
    if (update.metrics.ndcg > metrics.bestNDCG) {
      metrics.bestNDCG = update.metrics.ndcg;
    }
  }

  const logs = [
    ...run.logs,
    `Epoch ${update.epoch}, Step ${update.step}: loss=${update.metrics.trainLoss.toFixed(4)}`,
  ];

  await supabase
    .from('summer_reranker_runs')
    .update({
      progress,
      metrics,
      logs: logs.slice(-100), // Keep last 100 logs
      updated_at: new Date().toISOString(),
    })
    .eq('id', update.runId);
}

/**
 * Save a checkpoint
 */
export async function saveCheckpoint(
  runId: string,
  checkpoint: Omit<Checkpoint, 'id' | 'runId' | 'createdAt'>
): Promise<Checkpoint> {
  const supabase = createServerClient();

  const newCheckpoint: Checkpoint = {
    id: crypto.randomUUID(),
    runId,
    ...checkpoint,
    createdAt: new Date(),
  };

  // Get current checkpoints
  const { data: run } = await supabase
    .from('summer_reranker_runs')
    .select('checkpoints')
    .eq('id', runId)
    .single();

  const checkpoints = [...(run?.checkpoints ?? []), newCheckpoint];

  await supabase
    .from('summer_reranker_runs')
    .update({
      checkpoints,
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId);

  return newCheckpoint;
}

/**
 * Complete training run
 */
export async function completeTraining(
  runId: string,
  finalMetrics?: Partial<TrainingMetrics>
): Promise<void> {
  const supabase = createServerClient();

  const { data: run } = await supabase
    .from('summer_reranker_runs')
    .select('metrics, logs, progress')
    .eq('id', runId)
    .single();

  if (!run) return;

  const metrics = { ...run.metrics, ...finalMetrics };
  const logs = [...run.logs, 'Training completed successfully'];

  await supabase
    .from('summer_reranker_runs')
    .update({
      status: 'completed',
      progress: { ...(run.progress as Record<string, unknown>), percentComplete: 100 },
      metrics,
      logs,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId);
}

/**
 * Fail training run
 */
export async function failTraining(runId: string, error: string): Promise<void> {
  const supabase = createServerClient();

  const { data: run } = await supabase
    .from('summer_reranker_runs')
    .select('logs')
    .eq('id', runId)
    .single();

  await supabase
    .from('summer_reranker_runs')
    .update({
      status: 'failed',
      error,
      logs: [...(run?.logs ?? []), `ERROR: ${error}`],
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId);
}

/**
 * Cancel training run
 */
export async function cancelTraining(runId: string): Promise<boolean> {
  const supabase = createServerClient();

  const { data: run } = await supabase
    .from('summer_reranker_runs')
    .select('status, logs')
    .eq('id', runId)
    .single();

  if (!run || run.status !== 'training') {
    return false;
  }

  await supabase
    .from('summer_reranker_runs')
    .update({
      status: 'cancelled',
      logs: [...run.logs, 'Training cancelled by user'],
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId);

  return true;
}

/**
 * Get training run details
 */
export async function getTrainingRun(runId: string): Promise<TrainingRun | null> {
  const supabase = createServerClient();

  const { data: run } = await supabase
    .from('summer_reranker_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (!run) return null;

  return {
    id: run.id,
    datasetId: run.dataset_id,
    config: run.config,
    status: run.status,
    progress: run.progress,
    metrics: run.metrics,
    checkpoints: run.checkpoints,
    logs: run.logs,
    startedAt: run.started_at ? new Date(run.started_at) : undefined,
    completedAt: run.completed_at ? new Date(run.completed_at) : undefined,
    error: run.error,
  };
}

/**
 * List training runs for a dataset
 */
export async function listTrainingRuns(datasetId: string): Promise<TrainingRun[]> {
  const supabase = createServerClient();

  const { data: runs } = await supabase
    .from('summer_reranker_runs')
    .select('*')
    .eq('dataset_id', datasetId)
    .order('created_at', { ascending: false });

  return (runs ?? []).map((run) => ({
    id: run.id,
    datasetId: run.dataset_id,
    config: run.config,
    status: run.status,
    progress: run.progress,
    metrics: run.metrics,
    checkpoints: run.checkpoints,
    logs: run.logs,
    startedAt: run.started_at ? new Date(run.started_at) : undefined,
    completedAt: run.completed_at ? new Date(run.completed_at) : undefined,
    error: run.error,
  }));
}

/**
 * Get best checkpoint from a run
 */
export function getBestCheckpoint(run: TrainingRun): Checkpoint | null {
  if (run.checkpoints.length === 0) return null;

  // Find checkpoint with best MRR
  return run.checkpoints.reduce((best, current) => {
    if (!best) return current;
    return current.metrics.mrr > best.metrics.mrr ? current : best;
  }, run.checkpoints[0]);
}

/**
 * Compute evaluation metrics
 */
export function computeEvaluationMetrics(
  predictions: Array<{ query: string; scores: number[]; relevantIndices: number[] }>
): {
  mrr: number;
  mrrAt10: number;
  ndcg: number;
  ndcgAt10: number;
  map: number;
} {
  if (predictions.length === 0) {
    return { mrr: 0, mrrAt10: 0, ndcg: 0, ndcgAt10: 0, map: 0 };
  }

  let mrrSum = 0;
  let mrrAt10Sum = 0;
  let ndcgSum = 0;
  let ndcgAt10Sum = 0;
  let mapSum = 0;

  for (const pred of predictions) {
    // Get ranked indices
    const rankedIndices = pred.scores
      .map((score, idx) => ({ score, idx }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.idx);

    // MRR
    for (let i = 0; i < rankedIndices.length; i++) {
      if (pred.relevantIndices.includes(rankedIndices[i])) {
        mrrSum += 1 / (i + 1);
        if (i < 10) mrrAt10Sum += 1 / (i + 1);
        break;
      }
    }

    // NDCG
    const dcg = computeDCG(rankedIndices, pred.relevantIndices, rankedIndices.length);
    const idealDCG = computeIdealDCG(pred.relevantIndices.length, rankedIndices.length);
    ndcgSum += idealDCG > 0 ? dcg / idealDCG : 0;

    const dcg10 = computeDCG(rankedIndices, pred.relevantIndices, 10);
    const idealDCG10 = computeIdealDCG(Math.min(pred.relevantIndices.length, 10), 10);
    ndcgAt10Sum += idealDCG10 > 0 ? dcg10 / idealDCG10 : 0;

    // MAP
    mapSum += computeAveragePrecision(rankedIndices, pred.relevantIndices);
  }

  return {
    mrr: mrrSum / predictions.length,
    mrrAt10: mrrAt10Sum / predictions.length,
    ndcg: ndcgSum / predictions.length,
    ndcgAt10: ndcgAt10Sum / predictions.length,
    map: mapSum / predictions.length,
  };
}

function computeDCG(ranked: number[], relevant: number[], k: number): number {
  let dcg = 0;
  for (let i = 0; i < Math.min(k, ranked.length); i++) {
    if (relevant.includes(ranked[i])) {
      dcg += 1 / Math.log2(i + 2);
    }
  }
  return dcg;
}

function computeIdealDCG(numRelevant: number, k: number): number {
  let idcg = 0;
  for (let i = 0; i < Math.min(numRelevant, k); i++) {
    idcg += 1 / Math.log2(i + 2);
  }
  return idcg;
}

function computeAveragePrecision(ranked: number[], relevant: number[]): number {
  let precisionSum = 0;
  let relevantFound = 0;

  for (let i = 0; i < ranked.length; i++) {
    if (relevant.includes(ranked[i])) {
      relevantFound++;
      precisionSum += relevantFound / (i + 1);
    }
  }

  return relevant.length > 0 ? precisionSum / relevant.length : 0;
}
