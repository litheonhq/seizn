/**
 * Summer Reranker Training Module
 *
 * Complete pipeline for:
 * - Dataset management (manual, click, feedback, synthetic)
 * - Training configuration and execution
 * - Model deployment and versioning
 * - Evaluation and comparison
 */

// Types
export type {
  TrainingSample,
  TrainingDataset,
  DatasetStats,
  TrainingConfig,
  TrainingRun,
  TrainingMetrics,
  Checkpoint,
  DeployedModel,
  RerankerEvaluation,
} from './types';

export { DEFAULT_TRAINING_CONFIG, DEFAULT_SPLIT_RATIO } from './types';

// Dataset Management
export {
  createDataset,
  addSample,
  addSamplesBatch,
  generateSampleFromClick,
  generateSampleFromFeedback,
  generateHardNegatives,
  getDataset,
  computeDatasetStats,
  splitDataset,
  exportToJSONL,
  exportToCSV,
  deleteDataset,
  type CreateDatasetParams,
  type AddSampleParams,
  type SampleFromClickParams,
  type SampleFromFeedbackParams,
} from './dataset';

// Training Pipeline
export {
  createTrainingRun,
  startTraining,
  updateTrainingProgress,
  saveCheckpoint,
  completeTraining,
  failTraining,
  cancelTraining,
  getTrainingRun,
  listTrainingRuns,
  getBestCheckpoint,
  computeEvaluationMetrics,
  type StartTrainingParams,
  type TrainingUpdate,
} from './training';

// Model Deployment
export {
  deployModel,
  getDeployedModel,
  listDeployedModels,
  getActiveModel,
  deactivateModel,
  rollbackModel,
  updateModelMetrics,
  evaluateDeployedModel,
  compareModels,
  deleteDeployedModel,
  type DeployModelParams,
  type ModelEndpoint,
} from './deployment';
