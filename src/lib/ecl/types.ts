/**
 * ECL (Embedding Compatibility Layer) - Types
 *
 * Type definitions for the ECL system that enables switching
 * embedding models without full reindexing.
 */

// ============================================
// Translation Model Types
// ============================================

/**
 * Type of translation transformation
 * - linear: Simple matrix multiplication (W * x)
 * - affine: Matrix + bias (W * x + b)
 * - mlp: Multi-layer perceptron (future)
 */
export type TranslationType = 'linear' | 'affine' | 'mlp';

/**
 * Status of an ECL translation model
 */
export type TranslationModelStatus =
  | 'pending'    // Model created but not trained
  | 'training'   // Training in progress
  | 'ready'      // Trained and ready for use
  | 'failed'     // Training failed
  | 'archived';  // No longer active

/**
 * Common embedding model identifiers
 */
export type EmbeddingModelId =
  | 'text-embedding-ada-002'
  | 'text-embedding-3-small'
  | 'text-embedding-3-large'
  | 'voyage-2'
  | 'voyage-large-2'
  | 'voyage-code-2'
  | 'cohere-embed-english-v3.0'
  | 'cohere-embed-multilingual-v3.0'
  | string;  // Allow custom models

/**
 * Embedding model metadata
 */
export interface EmbeddingModelInfo {
  id: EmbeddingModelId;
  name: string;
  provider: 'openai' | 'voyage' | 'cohere' | 'custom';
  dimensions: number;
  maxTokens: number;
  supportsQuery?: boolean;  // Some models have query/document variants
}

/**
 * ECL Translation Model
 */
export interface TranslationModel {
  id: string;
  userId: string;
  name: string;
  description?: string;

  // Model configuration
  sourceModel: EmbeddingModelId;
  targetModel: EmbeddingModelId;
  sourceDim: number;
  targetDim: number;
  translationType: TranslationType;

  // Learned parameters
  weights?: number[][];  // Transformation matrix
  bias?: number[];       // Bias vector (for affine)

  // Training statistics
  trainingSamples: number;
  validationRmse?: number;
  validationR2?: number;
  cosineSimilarityMean?: number;
  trainingConfig?: TrainingConfig;

  // Status
  status: TranslationModelStatus;
  errorMessage?: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
  trainedAt?: string;
}

/**
 * Training pair for learning translation
 */
export interface TrainingPair {
  id: string;
  modelId: string;
  sourceVector: number[];
  targetVector: number[];
  textHash: string;
  textPreview?: string;
  isValidation: boolean;
  createdAt: string;
}

/**
 * Translation job for batch operations
 */
export interface TranslationJob {
  id: string;
  userId: string;
  modelId: string;
  jobType: 'translate_collection' | 'translate_memories' | 'batch_translate';
  targetCollectionId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  totalItems: number;
  processedItems: number;
  failedItems: number;
  errorMessage?: string;
  failedItemIds: string[];
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

// ============================================
// Configuration Types
// ============================================

/**
 * Training configuration for ECL models
 */
export interface TrainingConfig {
  type: TranslationType;
  regularization?: number;      // L2 regularization strength
  validationSplit?: number;     // Fraction reserved for validation (0-1)
  maxPairs?: number;            // Maximum training pairs to use
  normalizeVectors?: boolean;   // Normalize vectors before training
  randomSeed?: number;          // For reproducibility
}

/**
 * Default training configuration
 */
export const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  type: 'linear',
  regularization: 0.001,
  validationSplit: 0.2,
  maxPairs: 10000,
  normalizeVectors: true,
};

/**
 * ECL configuration for the retrieval pipeline
 */
export interface ECLConfig {
  enabled: boolean;
  modelId?: string;             // Specific model to use (or auto-select)
  autoTranslate?: boolean;      // Auto-translate queries
  fallbackToOriginal?: boolean; // Use original if translation fails
}

// ============================================
// Training Results
// ============================================

/**
 * Result of training a translation model
 */
export interface TrainingResult {
  success: boolean;
  weights?: number[][];
  bias?: number[];
  metrics: TrainingMetrics;
  error?: string;
}

/**
 * Training quality metrics
 */
export interface TrainingMetrics {
  rmse: number;                  // Root mean squared error
  r2?: number;                   // R-squared (coefficient of determination)
  cosineSimilarityMean: number;  // Average cosine similarity
  cosineSimilarityStd: number;   // Standard deviation
  mse: number;                   // Mean squared error
  trainingPairs: number;
  validationPairs: number;
  trainingTimeMs: number;
}

// ============================================
// Request/Response Types
// ============================================

/**
 * Request to create a new ECL model
 */
export interface CreateModelRequest {
  name: string;
  description?: string;
  sourceModel: EmbeddingModelId;
  targetModel: EmbeddingModelId;
  sourceDim: number;
  targetDim: number;
  translationType?: TranslationType;
}

/**
 * Request to add training pairs
 */
export interface AddTrainingPairsRequest {
  modelId: string;
  pairs: Array<{
    text: string;
    sourceVector: number[];
    targetVector: number[];
  }>;
  validationSplit?: number;
}

/**
 * Request to start training
 */
export interface StartTrainingRequest {
  modelId: string;
  config?: Partial<TrainingConfig>;
}

/**
 * Request to translate vectors
 */
export interface TranslateRequest {
  modelId: string;
  vectors: number[][];
}

/**
 * Response from translation
 */
export interface TranslateResponse {
  success: boolean;
  translatedVectors: number[][];
  modelId: string;
  latencyMs: number;
}

/**
 * Model list response
 */
export interface ListModelsResponse {
  success: boolean;
  models: TranslationModel[];
  count: number;
}

/**
 * Model statistics
 */
export interface ModelStats {
  totalPairs: number;
  trainingPairs: number;
  validationPairs: number;
  avgSourceNorm: number;
  avgTargetNorm: number;
}

// ============================================
// Error Types
// ============================================

/**
 * ECL-specific error codes
 */
export const ECLErrorCodes = {
  MODEL_NOT_FOUND: 'ECL_MODEL_NOT_FOUND',
  MODEL_NOT_READY: 'ECL_MODEL_NOT_READY',
  TRAINING_FAILED: 'ECL_TRAINING_FAILED',
  INSUFFICIENT_PAIRS: 'ECL_INSUFFICIENT_PAIRS',
  DIMENSION_MISMATCH: 'ECL_DIMENSION_MISMATCH',
  TRANSLATION_FAILED: 'ECL_TRANSLATION_FAILED',
  INVALID_CONFIG: 'ECL_INVALID_CONFIG',
} as const;

export type ECLErrorCode = (typeof ECLErrorCodes)[keyof typeof ECLErrorCodes];

/**
 * ECL error
 */
export interface ECLError {
  code: ECLErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================
// Database Row Types (for Supabase)
// ============================================

export interface ECLTranslationModelRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  source_model: string;
  target_model: string;
  source_dim: number;
  target_dim: number;
  translation_type: string;
  weights: unknown;
  bias: unknown;
  training_samples: number;
  validation_rmse: number | null;
  validation_r2: number | null;
  cosine_similarity_mean: number | null;
  training_config: unknown;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  trained_at: string | null;
}

export interface ECLTrainingPairRow {
  id: string;
  model_id: string;
  source_vector: unknown;  // pgvector type
  target_vector: unknown;
  text_hash: string;
  text_preview: string | null;
  is_validation: boolean;
  created_at: string;
}

export interface ECLTranslationJobRow {
  id: string;
  user_id: string;
  model_id: string;
  job_type: string;
  target_collection_id: string | null;
  status: string;
  total_items: number;
  processed_items: number;
  failed_items: number;
  error_message: string | null;
  failed_item_ids: unknown;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

// ============================================
// Mappers
// ============================================

/**
 * Convert database row to TranslationModel
 */
export function rowToModel(row: ECLTranslationModelRow): TranslationModel {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description ?? undefined,
    sourceModel: row.source_model,
    targetModel: row.target_model,
    sourceDim: row.source_dim,
    targetDim: row.target_dim,
    translationType: row.translation_type as TranslationType,
    weights: row.weights as number[][] | undefined,
    bias: row.bias as number[] | undefined,
    trainingSamples: row.training_samples,
    validationRmse: row.validation_rmse ?? undefined,
    validationR2: row.validation_r2 ?? undefined,
    cosineSimilarityMean: row.cosine_similarity_mean ?? undefined,
    trainingConfig: row.training_config as TrainingConfig | undefined,
    status: row.status as TranslationModelStatus,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    trainedAt: row.trained_at ?? undefined,
  };
}

/**
 * Convert database row to TrainingPair
 */
export function rowToPair(row: ECLTrainingPairRow): TrainingPair {
  return {
    id: row.id,
    modelId: row.model_id,
    sourceVector: row.source_vector as number[],
    targetVector: row.target_vector as number[],
    textHash: row.text_hash,
    textPreview: row.text_preview ?? undefined,
    isValidation: row.is_validation,
    createdAt: row.created_at,
  };
}

/**
 * Convert database row to TranslationJob
 */
export function rowToJob(row: ECLTranslationJobRow): TranslationJob {
  return {
    id: row.id,
    userId: row.user_id,
    modelId: row.model_id,
    jobType: row.job_type as TranslationJob['jobType'],
    targetCollectionId: row.target_collection_id ?? undefined,
    status: row.status as TranslationJob['status'],
    totalItems: row.total_items,
    processedItems: row.processed_items,
    failedItems: row.failed_items,
    errorMessage: row.error_message ?? undefined,
    failedItemIds: (row.failed_item_ids as string[]) ?? [],
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
  };
}
