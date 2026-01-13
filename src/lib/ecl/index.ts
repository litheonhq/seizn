/**
 * ECL (Embedding Compatibility Layer)
 *
 * Enables switching embedding models without full reindexing
 * by learning a translation layer between vector spaces.
 *
 * @module ecl
 */

// Types
export type {
  TranslationType,
  TranslationModelStatus,
  EmbeddingModelId,
  EmbeddingModelInfo,
  TranslationModel,
  TrainingPair,
  TranslationJob,
  TrainingConfig,
  ECLConfig,
  TrainingResult,
  TrainingMetrics,
  CreateModelRequest,
  AddTrainingPairsRequest,
  StartTrainingRequest,
  TranslateRequest,
  TranslateResponse,
  ListModelsResponse,
  ModelStats,
  ECLErrorCode,
  ECLError,
  ECLTranslationModelRow,
  ECLTrainingPairRow,
  ECLTranslationJobRow,
} from './types';

export {
  DEFAULT_TRAINING_CONFIG,
  ECLErrorCodes,
  rowToModel,
  rowToPair,
  rowToJob,
} from './types';

// Trainer
export type { TrainingData } from './trainer';

export {
  trainTranslation,
  validateModel,
  applyTranslation,
  applyTranslationBatch,
  cosineSimilarity,
  normalizeVector,
  vectorNorm,
} from './trainer';

// Translator
export type { BatchProgressCallback } from './translator';

export {
  ECLTranslator,
  loadTranslator,
  getTranslatorForModels,
  clearTranslatorCache,
  translateQueryIfNeeded,
  batchTranslate,
} from './translator';
