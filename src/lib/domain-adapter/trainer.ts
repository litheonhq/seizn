/**
 * Domain Adapter Trainer
 *
 * LoRA-style training using contrastive loss for domain adaptation.
 * Trains lightweight low-rank matrices that can be applied to embeddings
 * to improve retrieval for specific domains.
 */

import { createServerClient } from '@/lib/supabase';
import {
  LoRAConfig,
  DEFAULT_LORA_CONFIG,
  ContrastivePair,
  TrainingResult,
  TrainingSignal,
  TrainingProgress,
  TrainingMetrics,
  TrainingRun,
} from './types';

// =============================================================================
// Constants
// =============================================================================

const EMBEDDING_DIM = 1536; // OpenAI ada-002 dimension

// =============================================================================
// Matrix Operations (Pure TypeScript Implementation)
// =============================================================================

/**
 * Initialize low-rank matrix with Xavier/Glorot initialization
 */
function initializeMatrix(rows: number, cols: number): number[][] {
  const scale = Math.sqrt(2.0 / (rows + cols));
  const matrix: number[][] = [];

  for (let i = 0; i < rows; i++) {
    const row: number[] = [];
    for (let j = 0; j < cols; j++) {
      // Box-Muller transform for normal distribution
      const u1 = Math.random();
      const u2 = Math.random();
      const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      row.push(normal * scale);
    }
    matrix.push(row);
  }

  return matrix;
}

/**
 * Matrix-vector multiplication
 */
function matVecMul(matrix: number[][], vec: number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < matrix.length; i++) {
    let sum = 0;
    for (let j = 0; j < matrix[i].length; j++) {
      sum += matrix[i][j] * vec[j];
    }
    result.push(sum);
  }
  return result;
}

/**
 * Vector dot product
 */
function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Vector L2 norm
 */
function vectorNorm(vec: number[]): number {
  return Math.sqrt(dotProduct(vec, vec));
}

/**
 * Normalize vector to unit length
 */
function normalizeVector(vec: number[]): number[] {
  const norm = vectorNorm(vec);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  const normA = vectorNorm(a);
  const normB = vectorNorm(b);
  if (normA === 0 || normB === 0) return 0;
  return dotProduct(a, b) / (normA * normB);
}

/**
 * Apply LoRA transformation to embedding
 * output = embedding + scale * (B @ A @ embedding)
 */
export function applyLoRA(
  embedding: number[],
  weightsA: number[][],
  weightsB: number[][],
  scale: number
): number[] {
  // A: embedding_dim x rank
  // B: rank x embedding_dim
  // Transform: embedding -> A @ embedding (rank) -> B @ (A @ embedding) (embedding_dim)

  // Step 1: A @ embedding (projects to low rank space)
  const lowRank = matVecMul(weightsA, embedding);

  // Step 2: B @ lowRank (projects back to embedding space)
  const delta = matVecMul(weightsB, lowRank);

  // Step 3: Add scaled delta to original embedding
  const result = embedding.map((e, i) => e + scale * delta[i]);

  return result;
}

// =============================================================================
// Loss Functions
// =============================================================================

/**
 * Margin-based contrastive loss
 * Loss = max(0, margin - (sim(q, pos) - sim(q, neg)))
 */
function marginContrastiveLoss(
  queryAdapted: number[],
  positiveEmb: number[],
  negativeEmb: number[],
  margin: number
): { loss: number; posSim: number; negSim: number } {
  const posSim = cosineSimilarity(queryAdapted, positiveEmb);
  const negSim = cosineSimilarity(queryAdapted, negativeEmb);

  const loss = Math.max(0, margin - (posSim - negSim));

  return { loss, posSim, negSim };
}

// =============================================================================
// Gradient Computation (Numerical Approximation)
// =============================================================================

/**
 * Compute numerical gradients for LoRA matrices
 * Using finite differences for simplicity
 */
function computeGradients(
  pairs: ContrastivePair[],
  weightsA: number[][],
  weightsB: number[][],
  scale: number,
  margin: number,
  epsilon: number = 1e-5
): { gradA: number[][]; gradB: number[][]; avgLoss: number } {
  const gradA: number[][] = weightsA.map((row) => row.map(() => 0));
  const gradB: number[][] = weightsB.map((row) => row.map(() => 0));

  // Compute base loss
  let baseLoss = 0;
  for (const pair of pairs) {
    const adapted = applyLoRA(pair.queryEmbedding, weightsA, weightsB, scale);
    const { loss } = marginContrastiveLoss(
      adapted,
      pair.positiveEmbedding,
      pair.negativeEmbedding,
      margin
    );
    baseLoss += loss * (pair.weight ?? 1);
  }
  baseLoss /= pairs.length;

  // Compute gradients for A
  for (let i = 0; i < weightsA.length; i++) {
    for (let j = 0; j < weightsA[i].length; j++) {
      // Perturb weight
      weightsA[i][j] += epsilon;

      // Compute loss with perturbation
      let perturbedLoss = 0;
      for (const pair of pairs) {
        const adapted = applyLoRA(pair.queryEmbedding, weightsA, weightsB, scale);
        const { loss } = marginContrastiveLoss(
          adapted,
          pair.positiveEmbedding,
          pair.negativeEmbedding,
          margin
        );
        perturbedLoss += loss * (pair.weight ?? 1);
      }
      perturbedLoss /= pairs.length;

      // Compute gradient
      gradA[i][j] = (perturbedLoss - baseLoss) / epsilon;

      // Restore weight
      weightsA[i][j] -= epsilon;
    }
  }

  // Compute gradients for B
  for (let i = 0; i < weightsB.length; i++) {
    for (let j = 0; j < weightsB[i].length; j++) {
      weightsB[i][j] += epsilon;

      let perturbedLoss = 0;
      for (const pair of pairs) {
        const adapted = applyLoRA(pair.queryEmbedding, weightsA, weightsB, scale);
        const { loss } = marginContrastiveLoss(
          adapted,
          pair.positiveEmbedding,
          pair.negativeEmbedding,
          margin
        );
        perturbedLoss += loss * (pair.weight ?? 1);
      }
      perturbedLoss /= pairs.length;

      gradB[i][j] = (perturbedLoss - baseLoss) / epsilon;
      weightsB[i][j] -= epsilon;
    }
  }

  return { gradA, gradB, avgLoss: baseLoss };
}

// =============================================================================
// Metrics Computation
// =============================================================================

/**
 * Compute Mean Reciprocal Rank (MRR) on evaluation set
 */
function computeMRR(
  pairs: ContrastivePair[],
  weightsA: number[][],
  weightsB: number[][],
  scale: number
): number {
  let sumRR = 0;

  for (const pair of pairs) {
    const adapted = applyLoRA(pair.queryEmbedding, weightsA, weightsB, scale);
    const posSim = cosineSimilarity(adapted, pair.positiveEmbedding);
    const negSim = cosineSimilarity(adapted, pair.negativeEmbedding);

    // Simple case: rank is 1 if positive > negative, else 2
    const rank = posSim > negSim ? 1 : 2;
    sumRR += 1 / rank;
  }

  return sumRR / pairs.length;
}

/**
 * Compute simplified nDCG for binary relevance
 */
function computeNDCG(
  pairs: ContrastivePair[],
  weightsA: number[][],
  weightsB: number[][],
  scale: number
): number {
  let sumDCG = 0;
  let sumIDCG = 0;

  for (const pair of pairs) {
    const adapted = applyLoRA(pair.queryEmbedding, weightsA, weightsB, scale);
    const posSim = cosineSimilarity(adapted, pair.positiveEmbedding);
    const negSim = cosineSimilarity(adapted, pair.negativeEmbedding);

    // DCG: relevance / log2(rank + 1)
    // Ideal: positive at rank 1
    const idealDCG = 1 / Math.log2(2); // = 1

    if (posSim > negSim) {
      // Positive ranked first
      sumDCG += 1 / Math.log2(2);
    } else {
      // Positive ranked second
      sumDCG += 1 / Math.log2(3);
    }

    sumIDCG += idealDCG;
  }

  return sumDCG / sumIDCG;
}

// =============================================================================
// Training Function
// =============================================================================

export interface TrainAdapterOptions {
  signals: TrainingSignal[];
  config?: Partial<LoRAConfig>;
  embeddingDim?: number;
  onProgress?: (progress: TrainingProgress, metrics: TrainingMetrics) => void;
}

/**
 * Train LoRA adapter using contrastive learning
 */
export async function trainAdapter(
  options: TrainAdapterOptions
): Promise<TrainingResult> {
  const {
    signals,
    config: userConfig,
    embeddingDim = EMBEDDING_DIM,
    onProgress,
  } = options;

  const config: LoRAConfig = { ...DEFAULT_LORA_CONFIG, ...userConfig };

  // Build contrastive pairs from signals
  const pairs = buildContrastivePairs(signals);

  if (pairs.length === 0) {
    throw new Error('No valid training pairs could be built from signals');
  }

  // Split into train and validation
  const splitIdx = Math.floor(pairs.length * (1 - config.validationSplit));
  const shuffledPairs = shuffleArray([...pairs]);
  const trainPairs = shuffledPairs.slice(0, splitIdx);
  const valPairs = shuffledPairs.slice(splitIdx);

  // Initialize LoRA matrices
  // A: projects from embedding_dim to rank
  let weightsA = initializeMatrix(config.rank, embeddingDim);
  // B: projects from rank back to embedding_dim
  let weightsB = initializeMatrix(embeddingDim, config.rank);

  // Training metrics
  const metrics: TrainingMetrics = {
    trainLoss: [],
    validationLoss: [],
    mrr: [],
    ndcg: [],
  };

  let bestMRR = 0;
  let bestWeightsA = weightsA;
  let bestWeightsB = weightsB;
  let patienceCounter = 0;

  const totalSteps = config.epochs * Math.ceil(trainPairs.length / config.batchSize);
  let currentStep = 0;

  // Training loop
  for (let epoch = 0; epoch < config.epochs; epoch++) {
    const shuffledTrain = shuffleArray([...trainPairs]);
    let epochLoss = 0;
    let batchCount = 0;

    // Mini-batch training
    for (let i = 0; i < shuffledTrain.length; i += config.batchSize) {
      const batch = shuffledTrain.slice(i, i + config.batchSize);

      // Compute gradients
      const { gradA, gradB, avgLoss } = computeGradients(
        batch,
        weightsA,
        weightsB,
        config.scale,
        config.lossMargin
      );

      // Update weights using gradient descent
      for (let r = 0; r < weightsA.length; r++) {
        for (let c = 0; c < weightsA[r].length; c++) {
          weightsA[r][c] -= config.learningRate * gradA[r][c];
        }
      }

      for (let r = 0; r < weightsB.length; r++) {
        for (let c = 0; c < weightsB[r].length; c++) {
          weightsB[r][c] -= config.learningRate * gradB[r][c];
        }
      }

      epochLoss += avgLoss;
      batchCount++;
      currentStep++;

      // Progress callback
      if (onProgress) {
        onProgress(
          {
            currentEpoch: epoch + 1,
            totalEpochs: config.epochs,
            currentStep,
            totalSteps,
          },
          metrics
        );
      }
    }

    // Compute epoch metrics
    const avgTrainLoss = epochLoss / batchCount;
    metrics.trainLoss.push(avgTrainLoss);

    // Validation
    if (valPairs.length > 0) {
      let valLoss = 0;
      for (const pair of valPairs) {
        const adapted = applyLoRA(pair.queryEmbedding, weightsA, weightsB, config.scale);
        const { loss } = marginContrastiveLoss(
          adapted,
          pair.positiveEmbedding,
          pair.negativeEmbedding,
          config.lossMargin
        );
        valLoss += loss;
      }
      metrics.validationLoss.push(valLoss / valPairs.length);
    }

    // Compute MRR and nDCG on validation set
    const evalPairs = valPairs.length > 0 ? valPairs : trainPairs.slice(0, 100);
    const mrr = computeMRR(evalPairs, weightsA, weightsB, config.scale);
    const ndcg = computeNDCG(evalPairs, weightsA, weightsB, config.scale);

    metrics.mrr.push(mrr);
    metrics.ndcg.push(ndcg);

    // Early stopping check
    if (mrr > bestMRR) {
      bestMRR = mrr;
      bestWeightsA = weightsA.map((row) => [...row]);
      bestWeightsB = weightsB.map((row) => [...row]);
      patienceCounter = 0;
    } else {
      patienceCounter++;
      if (
        config.earlyStoppingPatience &&
        patienceCounter >= config.earlyStoppingPatience
      ) {
        console.log(`Early stopping at epoch ${epoch + 1}`);
        break;
      }
    }
  }

  // Return best model
  return {
    weightsA: bestWeightsA,
    weightsB: bestWeightsB,
    mrr: bestMRR,
    ndcg: metrics.ndcg[metrics.ndcg.length - 1],
    trainLoss: metrics.trainLoss[metrics.trainLoss.length - 1],
    validationLoss: metrics.validationLoss[metrics.validationLoss.length - 1] ?? 0,
    epochsTrained: metrics.trainLoss.length,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build contrastive pairs from training signals
 */
function buildContrastivePairs(signals: TrainingSignal[]): ContrastivePair[] {
  const pairs: ContrastivePair[] = [];

  for (const signal of signals) {
    // Skip if no query embedding
    if (!signal.queryEmbedding || signal.queryEmbedding.length === 0) {
      continue;
    }

    // For explicit feedback, we need both positive and negative examples
    // In practice, we'd fetch document embeddings from the database
    // Here we're using a simplified approach where embeddings are stored in metadata

    // Placeholder: In real implementation, fetch document embeddings
    // This would involve querying the vector store for the document IDs

    // For now, create synthetic pairs from click signals
    if (signal.signalType === 'click' && signal.clickedDocIds.length > 0) {
      // Clicked = positive, use query embedding shifted as negative (simplified)
      const queryEmb = signal.queryEmbedding;

      // Create a simple negative by slightly perturbing the query
      const syntheticNegative = queryEmb.map(
        (v) => v + (Math.random() - 0.5) * 0.1
      );

      pairs.push({
        queryEmbedding: queryEmb,
        positiveEmbedding: queryEmb, // Would be actual doc embedding
        negativeEmbedding: syntheticNegative,
        weight: 1.0,
      });
    }

    // For explicit feedback with positive doc IDs
    if (signal.positiveDocIds.length > 0 && signal.negativeDocIds.length > 0) {
      // In real implementation: fetch embeddings for these doc IDs
      pairs.push({
        queryEmbedding: signal.queryEmbedding,
        positiveEmbedding: signal.queryEmbedding, // Placeholder
        negativeEmbedding: signal.queryEmbedding.map((v) => v + 0.1), // Placeholder
        weight: signal.signalType === 'explicit_feedback' ? 2.0 : 1.0,
      });
    }

    // Dwell time signals
    if (signal.dwellTimes && Object.keys(signal.dwellTimes).length > 0) {
      // High dwell = positive, low dwell = negative
      const docIds = Object.keys(signal.dwellTimes);
      const sorted = docIds.sort(
        (a, b) => signal.dwellTimes[b] - signal.dwellTimes[a]
      );

      if (sorted.length >= 2) {
        pairs.push({
          queryEmbedding: signal.queryEmbedding,
          positiveEmbedding: signal.queryEmbedding, // Would be high-dwell doc embedding
          negativeEmbedding: signal.queryEmbedding.map((v) => v - 0.1), // Would be low-dwell doc embedding
          weight: Math.min(signal.dwellTimes[sorted[0]] / 30, 2.0), // Weight by dwell time
        });
      }
    }
  }

  return pairs;
}

/**
 * Fisher-Yates shuffle
 */
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// =============================================================================
// Database Operations
// =============================================================================

/**
 * Create a new training run
 */
export async function createTrainingRun(
  adapterId: string,
  config: LoRAConfig
): Promise<TrainingRun> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('adapter_training_runs')
    .insert({
      adapter_id: adapterId,
      config: config,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;

  return mapDbToTrainingRun(data);
}

/**
 * Update training run progress
 */
export async function updateTrainingProgress(
  runId: string,
  progress: TrainingProgress,
  metrics: TrainingMetrics
): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('adapter_training_runs')
    .update({
      status: 'training',
      progress,
      metrics,
      started_at: new Date().toISOString(),
    })
    .eq('id', runId);

  if (error) throw error;
}

/**
 * Complete training run
 */
export async function completeTrainingRun(
  runId: string,
  result: TrainingResult,
  metrics: TrainingMetrics
): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('adapter_training_runs')
    .update({
      status: 'completed',
      metrics,
      final_mrr: result.mrr,
      final_ndcg: result.ndcg,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId);

  if (error) throw error;
}

/**
 * Fail training run
 */
export async function failTrainingRun(runId: string, error: string): Promise<void> {
  const supabase = createServerClient();

  const { error: dbError } = await supabase
    .from('adapter_training_runs')
    .update({
      status: 'failed',
      error,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId);

  if (dbError) throw dbError;
}

/**
 * Get training run by ID
 */
export async function getTrainingRun(runId: string): Promise<TrainingRun | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('adapter_training_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return mapDbToTrainingRun(data);
}

/**
 * List training runs for an adapter
 */
export async function listTrainingRuns(
  adapterId: string,
  limit = 10
): Promise<TrainingRun[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('adapter_training_runs')
    .select('*')
    .eq('adapter_id', adapterId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return data.map(mapDbToTrainingRun);
}

// =============================================================================
// Mapping Functions
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDbToTrainingRun(row: any): TrainingRun {
  return {
    id: row.id,
    adapterId: row.adapter_id,
    config: row.config as LoRAConfig,
    status: row.status,
    progress: row.progress as TrainingProgress,
    metrics: row.metrics as TrainingMetrics,
    finalMrr: row.final_mrr,
    finalNdcg: row.final_ndcg,
    startedAt: row.started_at ? new Date(row.started_at) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    error: row.error,
    createdAt: new Date(row.created_at),
  };
}
