/**
 * Domain Adapter Types
 *
 * Types for LoRA-style domain adaptation with feedback signals.
 * Enables fine-tuning retrieval for specific domains using lightweight
 * low-rank adaptation matrices.
 */

// =============================================================================
// Core Types
// =============================================================================

export type AdapterStatus = 'untrained' | 'training' | 'ready' | 'stale';

export type DomainType =
  | 'legal'
  | 'medical'
  | 'technical'
  | 'financial'
  | 'scientific'
  | 'ecommerce'
  | 'support'
  | 'custom';

export type SignalType = 'explicit_feedback' | 'click' | 'dwell' | 'conversion';

// =============================================================================
// Domain Adapter
// =============================================================================

export interface DomainAdapter {
  id: string;
  userId: string;
  collectionId?: string;
  name: string;
  description?: string;
  domainType?: DomainType | string;

  // LoRA weights
  adapterRank: number;
  weightsA?: number[][]; // embedding_dim x rank
  weightsB?: number[][]; // rank x embedding_dim
  scale: number;

  // Training state
  trainingSamples: number;
  positiveSamples: number;
  negativeSamples: number;
  lastTrainedAt?: Date;
  validationMrr?: number;

  // Configuration
  status: AdapterStatus;
  autoRetrain: boolean;
  retrainThreshold: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAdapterParams {
  name: string;
  description?: string;
  collectionId?: string;
  domainType?: DomainType | string;
  adapterRank?: number;
  scale?: number;
  autoRetrain?: boolean;
  retrainThreshold?: number;
}

export interface UpdateAdapterParams {
  name?: string;
  description?: string;
  domainType?: DomainType | string;
  scale?: number;
  autoRetrain?: boolean;
  retrainThreshold?: number;
}

// =============================================================================
// Training Signals
// =============================================================================

export interface TrainingSignal {
  id: string;
  adapterId: string;
  queryText: string;
  queryEmbedding?: number[];

  // Document relevance signals
  positiveDocIds: string[];
  negativeDocIds: string[];

  // Implicit signals
  clickedDocIds: string[];
  dwellTimes: Record<string, number>; // doc_id -> seconds

  signalType: SignalType;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface RecordSignalParams {
  adapterId: string;
  queryText: string;
  queryEmbedding?: number[];
  positiveDocIds?: string[];
  negativeDocIds?: string[];
  clickedDocIds?: string[];
  dwellTimes?: Record<string, number>;
  signalType: SignalType;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Training Configuration & Results
// =============================================================================

export interface LoRAConfig {
  rank: number;
  scale: number;
  learningRate: number;
  epochs: number;
  batchSize: number;
  lossMargin: number; // Margin for contrastive loss
  validationSplit: number;
  earlyStoppingPatience?: number;
}

export const DEFAULT_LORA_CONFIG: LoRAConfig = {
  rank: 8,
  scale: 1.0,
  learningRate: 0.001,
  epochs: 10,
  batchSize: 32,
  lossMargin: 0.5,
  validationSplit: 0.1,
  earlyStoppingPatience: 3,
};

export interface TrainingRun {
  id: string;
  adapterId: string;
  config: LoRAConfig;
  status: 'pending' | 'training' | 'completed' | 'failed' | 'cancelled';
  progress: TrainingProgress;
  metrics: TrainingMetrics;
  finalMrr?: number;
  finalNdcg?: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  createdAt: Date;
}

export interface TrainingProgress {
  currentEpoch: number;
  totalEpochs: number;
  currentStep: number;
  totalSteps: number;
}

export interface TrainingMetrics {
  trainLoss: number[];
  validationLoss: number[];
  mrr: number[]; // Mean Reciprocal Rank per epoch
  ndcg: number[]; // nDCG per epoch
}

export interface TrainingResult {
  weightsA: number[][];
  weightsB: number[][];
  mrr: number;
  ndcg: number;
  trainLoss: number;
  validationLoss: number;
  epochsTrained: number;
}

// =============================================================================
// Contrastive Training Pairs
// =============================================================================

export interface ContrastivePair {
  queryEmbedding: number[];
  positiveEmbedding: number[];
  negativeEmbedding: number[];
  weight?: number; // Optional weight for the sample
}

export interface TrainingBatch {
  pairs: ContrastivePair[];
  batchIndex: number;
  totalBatches: number;
}

// =============================================================================
// Evaluation
// =============================================================================

export interface AdapterEvaluation {
  adapterId: string;
  runId: string;
  metrics: {
    mrr: number;
    mrrAt5: number;
    mrrAt10: number;
    ndcg: number;
    ndcgAt5: number;
    ndcgAt10: number;
    precision: number;
    recall: number;
  };
  sampleCount: number;
  evaluatedAt: Date;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface AdapterListResponse {
  adapters: DomainAdapter[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdapterResponse {
  adapter: DomainAdapter;
}

export interface TrainingRunResponse {
  run: TrainingRun;
}

export interface SignalsResponse {
  signals: TrainingSignal[];
  total: number;
}

export interface ApplyAdapterResponse {
  originalEmbedding: number[];
  adaptedEmbedding: number[];
  adapterId: string;
  scale: number;
}

// =============================================================================
// Utility Types
// =============================================================================

export interface AdapterFilter {
  status?: AdapterStatus;
  domainType?: DomainType | string;
  collectionId?: string;
}

export interface SignalFilter {
  signalType?: SignalType;
  startDate?: Date;
  endDate?: Date;
}
