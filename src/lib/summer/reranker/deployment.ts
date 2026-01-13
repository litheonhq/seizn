/**
 * Reranker Model Deployment
 *
 * Manages deployment of trained reranker models.
 * Supports model versioning, A/B testing, and rollback.
 */

import { createServerClient } from '@/lib/supabase';
import type { DeployedModel, Checkpoint, RerankerEvaluation } from './types';
import { getTrainingRun, getBestCheckpoint } from './training';

export interface DeployModelParams {
  runId: string;
  checkpointId?: string; // If not provided, uses best checkpoint
  name: string;
  version: string;
  config?: {
    maxBatchSize?: number;
    timeout?: number;
    cacheEnabled?: boolean;
  };
}

export interface ModelEndpoint {
  modelId: string;
  endpoint: string;
  apiKey?: string;
  healthCheck: string;
}

/**
 * Deploy a trained model
 */
export async function deployModel(params: DeployModelParams): Promise<DeployedModel> {
  const supabase = createServerClient();

  // Get training run
  const run = await getTrainingRun(params.runId);
  if (!run) {
    throw new Error('Training run not found');
  }

  if (run.status !== 'completed') {
    throw new Error('Can only deploy from completed training runs');
  }

  // Get checkpoint
  let checkpoint: Checkpoint | null = null;

  if (params.checkpointId) {
    checkpoint = run.checkpoints.find((c) => c.id === params.checkpointId) ?? null;
    if (!checkpoint) {
      throw new Error('Checkpoint not found');
    }
  } else {
    checkpoint = getBestCheckpoint(run);
    if (!checkpoint) {
      throw new Error('No checkpoints available');
    }
  }

  const model: DeployedModel = {
    id: crypto.randomUUID(),
    name: params.name,
    version: params.version,
    runId: params.runId,
    checkpointId: checkpoint.id,
    status: 'deploying',
    config: {
      maxBatchSize: params.config?.maxBatchSize ?? 32,
      timeout: params.config?.timeout ?? 5000,
      cacheEnabled: params.config?.cacheEnabled ?? true,
    },
    metrics: {
      totalRequests: 0,
      avgLatencyMs: 0,
      errorRate: 0,
    },
    deployedAt: new Date(),
  };

  const { error } = await supabase.from('summer_reranker_models').insert({
    id: model.id,
    name: model.name,
    version: model.version,
    run_id: model.runId,
    checkpoint_id: model.checkpointId,
    status: model.status,
    config: model.config,
    metrics: model.metrics,
    deployed_at: model.deployedAt.toISOString(),
  });

  if (error) {
    throw new Error(`Failed to create deployment: ${error.message}`);
  }

  // In production, this would trigger actual model deployment
  // For now, simulate deployment completion
  await simulateDeployment(model.id);

  return model;
}

/**
 * Simulate deployment process (placeholder for actual deployment)
 */
async function simulateDeployment(modelId: string): Promise<void> {
  const supabase = createServerClient();

  // Simulate deployment time
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Generate mock endpoint
  const endpoint = `https://reranker.seizn.com/v1/models/${modelId}`;

  await supabase
    .from('summer_reranker_models')
    .update({
      status: 'active',
      endpoint,
    })
    .eq('id', modelId);
}

/**
 * Get deployed model
 */
export async function getDeployedModel(modelId: string): Promise<DeployedModel | null> {
  const supabase = createServerClient();

  const { data: model } = await supabase
    .from('summer_reranker_models')
    .select('*')
    .eq('id', modelId)
    .single();

  if (!model) return null;

  return {
    id: model.id,
    name: model.name,
    version: model.version,
    runId: model.run_id,
    checkpointId: model.checkpoint_id,
    status: model.status,
    endpoint: model.endpoint,
    config: model.config,
    metrics: model.metrics,
    deployedAt: new Date(model.deployed_at),
    lastUsedAt: model.last_used_at ? new Date(model.last_used_at) : undefined,
  };
}

/**
 * List deployed models
 */
export async function listDeployedModels(options?: {
  status?: DeployedModel['status'];
  limit?: number;
}): Promise<DeployedModel[]> {
  const supabase = createServerClient();

  let query = supabase
    .from('summer_reranker_models')
    .select('*')
    .order('deployed_at', { ascending: false });

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data: models } = await query;

  return (models ?? []).map((model) => ({
    id: model.id,
    name: model.name,
    version: model.version,
    runId: model.run_id,
    checkpointId: model.checkpoint_id,
    status: model.status,
    endpoint: model.endpoint,
    config: model.config,
    metrics: model.metrics,
    deployedAt: new Date(model.deployed_at),
    lastUsedAt: model.last_used_at ? new Date(model.last_used_at) : undefined,
  }));
}

/**
 * Get active model (most recent active deployment)
 */
export async function getActiveModel(): Promise<DeployedModel | null> {
  const models = await listDeployedModels({ status: 'active', limit: 1 });
  return models[0] ?? null;
}

/**
 * Deactivate a model
 */
export async function deactivateModel(modelId: string): Promise<boolean> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('summer_reranker_models')
    .update({ status: 'inactive' })
    .eq('id', modelId);

  return !error;
}

/**
 * Rollback to a previous model version
 */
export async function rollbackModel(targetModelId: string): Promise<{
  success: boolean;
  deactivated?: string;
  activated?: string;
}> {
  const supabase = createServerClient();

  // Get current active model
  const activeModel = await getActiveModel();

  // Get target model
  const targetModel = await getDeployedModel(targetModelId);
  if (!targetModel) {
    return { success: false };
  }

  // Deactivate current
  if (activeModel) {
    await deactivateModel(activeModel.id);
  }

  // Activate target
  const { error } = await supabase
    .from('summer_reranker_models')
    .update({ status: 'active' })
    .eq('id', targetModelId);

  if (error) {
    // Rollback the deactivation
    if (activeModel) {
      await supabase
        .from('summer_reranker_models')
        .update({ status: 'active' })
        .eq('id', activeModel.id);
    }
    return { success: false };
  }

  return {
    success: true,
    deactivated: activeModel?.id,
    activated: targetModelId,
  };
}

/**
 * Update model metrics
 */
export async function updateModelMetrics(
  modelId: string,
  metrics: {
    requestCount?: number;
    latencyMs?: number;
    errorCount?: number;
  }
): Promise<void> {
  const supabase = createServerClient();

  const { data: model } = await supabase
    .from('summer_reranker_models')
    .select('metrics')
    .eq('id', modelId)
    .single();

  if (!model) return;

  const currentMetrics = model.metrics;
  const newTotalRequests = currentMetrics.totalRequests + (metrics.requestCount ?? 1);

  // Calculate running average latency
  const newAvgLatency = metrics.latencyMs
    ? (currentMetrics.avgLatencyMs * currentMetrics.totalRequests + metrics.latencyMs) /
      newTotalRequests
    : currentMetrics.avgLatencyMs;

  // Calculate error rate
  const totalErrors =
    Math.round(currentMetrics.errorRate * currentMetrics.totalRequests) + (metrics.errorCount ?? 0);
  const newErrorRate = newTotalRequests > 0 ? totalErrors / newTotalRequests : 0;

  await supabase
    .from('summer_reranker_models')
    .update({
      metrics: {
        totalRequests: newTotalRequests,
        avgLatencyMs: Math.round(newAvgLatency),
        errorRate: newErrorRate,
      },
      last_used_at: new Date().toISOString(),
    })
    .eq('id', modelId);
}

/**
 * Evaluate deployed model on a dataset
 */
export async function evaluateDeployedModel(
  modelId: string,
  datasetId: string,
  reranker: (query: string, docs: string[]) => Promise<number[]>
): Promise<RerankerEvaluation> {
  const supabase = createServerClient();

  // Get dataset samples
  const { data: samples } = await supabase
    .from('summer_reranker_samples')
    .select('query, positive_doc, negative_doc')
    .eq('dataset_id', datasetId)
    .limit(100); // Evaluate on subset

  if (!samples || samples.length === 0) {
    throw new Error('No samples found in dataset');
  }

  const predictions: Array<{
    query: string;
    scores: number[];
    relevantIndices: number[];
    latencyMs: number;
  }> = [];

  for (const sample of samples) {
    const docs = [sample.positive_doc, sample.negative_doc];
    const startTime = Date.now();

    try {
      const scores = await reranker(sample.query, docs);
      predictions.push({
        query: sample.query,
        scores,
        relevantIndices: [0], // First doc is always positive
        latencyMs: Date.now() - startTime,
      });
    } catch {
      // Skip failed predictions
    }
  }

  if (predictions.length === 0) {
    throw new Error('All predictions failed');
  }

  // Compute metrics
  let mrrSum = 0;
  let mrrAt10Sum = 0;
  let correctFirst = 0;

  for (const pred of predictions) {
    const isCorrect = pred.scores[0] > pred.scores[1];
    if (isCorrect) {
      mrrSum += 1;
      mrrAt10Sum += 1;
      correctFirst++;
    } else {
      mrrSum += 0.5;
      mrrAt10Sum += 0.5;
    }
  }

  const latencies = predictions.map((p) => p.latencyMs).sort((a, b) => a - b);

  const evaluation: RerankerEvaluation = {
    modelId,
    datasetId,
    metrics: {
      mrr: mrrSum / predictions.length,
      mrrAt10: mrrAt10Sum / predictions.length,
      ndcg: correctFirst / predictions.length, // Simplified NDCG for binary relevance
      ndcgAt10: correctFirst / predictions.length,
      map: correctFirst / predictions.length,
      precision: correctFirst / predictions.length,
      recall: correctFirst / predictions.length,
    },
    latency: {
      p50: latencies[Math.floor(latencies.length * 0.5)],
      p90: latencies[Math.floor(latencies.length * 0.9)],
      p99: latencies[Math.floor(latencies.length * 0.99)],
    },
    evaluatedAt: new Date(),
  };

  // Store evaluation
  await supabase.from('summer_reranker_evaluations').insert({
    model_id: modelId,
    dataset_id: datasetId,
    metrics: evaluation.metrics,
    latency: evaluation.latency,
    evaluated_at: evaluation.evaluatedAt.toISOString(),
  });

  return evaluation;
}

/**
 * Compare two models on the same dataset
 */
export async function compareModels(
  modelAId: string,
  modelBId: string,
  datasetId: string,
  rerankerA: (query: string, docs: string[]) => Promise<number[]>,
  rerankerB: (query: string, docs: string[]) => Promise<number[]>
): Promise<{
  modelA: RerankerEvaluation;
  modelB: RerankerEvaluation;
  winner: string;
  improvement: number;
}> {
  const [evalA, evalB] = await Promise.all([
    evaluateDeployedModel(modelAId, datasetId, rerankerA),
    evaluateDeployedModel(modelBId, datasetId, rerankerB),
  ]);

  const winner = evalA.metrics.mrr >= evalB.metrics.mrr ? modelAId : modelBId;
  const improvement = Math.abs(evalA.metrics.mrr - evalB.metrics.mrr) / Math.min(evalA.metrics.mrr, evalB.metrics.mrr);

  return {
    modelA: evalA,
    modelB: evalB,
    winner,
    improvement,
  };
}

/**
 * Delete deployed model
 */
export async function deleteDeployedModel(modelId: string): Promise<boolean> {
  const supabase = createServerClient();

  const model = await getDeployedModel(modelId);
  if (!model) return false;

  if (model.status === 'active') {
    throw new Error('Cannot delete active model. Deactivate first.');
  }

  const { error } = await supabase.from('summer_reranker_models').delete().eq('id', modelId);

  return !error;
}
