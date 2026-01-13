/**
 * Reranker Training Types
 *
 * Types for reranker dataset management, training, and deployment.
 */

export interface TrainingSample {
  id: string;
  query: string;
  positiveDoc: string;
  negativeDoc: string;
  positiveScore?: number;
  negativeScore?: number;
  source: 'manual' | 'click' | 'feedback' | 'synthetic';
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface TrainingDataset {
  id: string;
  name: string;
  description?: string;
  collectionId?: string;
  sampleCount: number;
  samples: TrainingSample[];
  splitRatio: {
    train: number;
    validation: number;
    test: number;
  };
  stats: DatasetStats;
  createdAt: Date;
  updatedAt: Date;
}

export interface DatasetStats {
  totalSamples: number;
  uniqueQueries: number;
  avgQueryLength: number;
  avgDocLength: number;
  sourceDistribution: Record<string, number>;
  qualityScore?: number;
}

export interface TrainingConfig {
  modelName: string;
  baseModel: 'ms-marco-MiniLM-L-6-v2' | 'bge-reranker-base' | 'custom';
  epochs: number;
  batchSize: number;
  learningRate: number;
  warmupSteps: number;
  maxLength: number;
  evaluationSteps: number;
  saveBest: boolean;
  earlyStoppingPatience?: number;
  lossFunction: 'cross_entropy' | 'margin_mse' | 'contrastive';
}

export interface TrainingRun {
  id: string;
  datasetId: string;
  config: TrainingConfig;
  status: 'pending' | 'training' | 'completed' | 'failed' | 'cancelled';
  progress: {
    currentEpoch: number;
    currentStep: number;
    totalSteps: number;
    percentComplete: number;
  };
  metrics: TrainingMetrics;
  checkpoints: Checkpoint[];
  logs: string[];
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface TrainingMetrics {
  trainLoss: number[];
  validationLoss: number[];
  mrr: number[]; // Mean Reciprocal Rank
  ndcg: number[]; // Normalized Discounted Cumulative Gain
  map: number[]; // Mean Average Precision
  bestEpoch: number;
  bestMRR: number;
  bestNDCG: number;
}

export interface Checkpoint {
  id: string;
  runId: string;
  epoch: number;
  step: number;
  metrics: {
    loss: number;
    mrr: number;
    ndcg: number;
  };
  path: string;
  size: number;
  createdAt: Date;
}

export interface DeployedModel {
  id: string;
  name: string;
  version: string;
  runId: string;
  checkpointId: string;
  status: 'deploying' | 'active' | 'inactive' | 'failed';
  endpoint?: string;
  config: {
    maxBatchSize: number;
    timeout: number;
    cacheEnabled: boolean;
  };
  metrics: {
    totalRequests: number;
    avgLatencyMs: number;
    errorRate: number;
  };
  deployedAt: Date;
  lastUsedAt?: Date;
}

export interface RerankerEvaluation {
  modelId: string;
  datasetId: string;
  metrics: {
    mrr: number;
    mrrAt10: number;
    ndcg: number;
    ndcgAt10: number;
    map: number;
    precision: number;
    recall: number;
  };
  latency: {
    p50: number;
    p90: number;
    p99: number;
  };
  evaluatedAt: Date;
}

export const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  modelName: 'custom-reranker',
  baseModel: 'ms-marco-MiniLM-L-6-v2',
  epochs: 3,
  batchSize: 16,
  learningRate: 2e-5,
  warmupSteps: 100,
  maxLength: 512,
  evaluationSteps: 500,
  saveBest: true,
  earlyStoppingPatience: 3,
  lossFunction: 'cross_entropy',
};

export const DEFAULT_SPLIT_RATIO = {
  train: 0.8,
  validation: 0.1,
  test: 0.1,
};
