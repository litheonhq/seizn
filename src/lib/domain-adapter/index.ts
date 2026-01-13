/**
 * Domain Adapter Module
 *
 * LoRA-style domain adaptation for specialized retrieval.
 * Fine-tune embeddings for specific domains using feedback signals.
 *
 * @example
 * ```typescript
 * import {
 *   createAdapter,
 *   SignalCollector,
 *   trainAdapter,
 *   applyAdapterToEmbedding,
 * } from '@/lib/domain-adapter';
 *
 * // 1. Create an adapter
 * const adapter = await createAdapter(userId, {
 *   name: 'Legal Document Retrieval',
 *   domainType: 'legal',
 *   autoRetrain: true,
 * });
 *
 * // 2. Collect feedback signals
 * const collector = new SignalCollector();
 * await collector.recordExplicitFeedback(
 *   adapter.id,
 *   'contract termination clause',
 *   ['doc_123', 'doc_456'], // relevant
 *   ['doc_789'],            // irrelevant
 *   queryEmbedding
 * );
 *
 * // 3. Train the adapter
 * const signals = await collector.getSignalsForTraining(adapter.id);
 * const result = await trainAdapter({ signals, config: { rank: 8 } });
 *
 * // 4. Apply adapter to queries
 * const adapted = applyAdapterToEmbedding(queryEmbedding, adapter);
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Core types
  DomainAdapter,
  AdapterStatus,
  DomainType,
  SignalType,
  TrainingSignal,

  // Params
  CreateAdapterParams,
  UpdateAdapterParams,
  RecordSignalParams,

  // Training
  LoRAConfig,
  TrainingRun,
  TrainingProgress,
  TrainingMetrics,
  TrainingResult,
  ContrastivePair,
  TrainingBatch,

  // Evaluation
  AdapterEvaluation,

  // API responses
  AdapterListResponse,
  AdapterResponse,
  TrainingRunResponse,
  SignalsResponse,
  ApplyAdapterResponse,

  // Filters
  AdapterFilter,
  SignalFilter,
} from './types';

export { DEFAULT_LORA_CONFIG } from './types';

// =============================================================================
// Adapter Operations
// =============================================================================

export {
  // CRUD
  createAdapter,
  getAdapter,
  getAdapterForUser,
  listAdapters,
  updateAdapter,
  deleteAdapter,

  // Weights & Status
  updateAdapterWeights,
  updateAdapterStatus,

  // Embedding transformation
  applyAdapterToEmbedding,
  applyAdapterToEmbeddings,
  applyAdapterToQuery,

  // Selection helpers
  getAdapterForCollection,
  getBestAdapterForDomain,
  selectAdapter,
  transformQueryWithAdapter,

  // Stats
  getAdapterStats,

  // Types
  type AdapterConfig,
} from './adapter';

// =============================================================================
// Training
// =============================================================================

export {
  // Core training
  trainAdapter,
  applyLoRA,

  // Training run management
  createTrainingRun,
  updateTrainingProgress,
  completeTrainingRun,
  failTrainingRun,
  getTrainingRun,
  listTrainingRuns,

  // Types
  type TrainAdapterOptions,
} from './trainer';

// =============================================================================
// Signal Collection
// =============================================================================

export {
  // Class
  SignalCollector,
  createSignalCollector,

  // Convenience functions
  recordExplicitFeedback,
  recordClick,
  recordDwell,
  recordConversion,
  getSignalsForTraining,

  // Batch operations
  recordSignalsBatch,
  type BatchSignalParams,
} from './signal-collector';
