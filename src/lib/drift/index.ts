/**
 * Embedding Drift Radar
 *
 * Detects distribution drift in embedding space to prevent quality degradation.
 */

// Types
export * from './types';

// Analyzer functions
export {
  calculateCentroidShift,
  calculateEuclideanDistance,
  calculateEntropyChange,
  calculateShannonEntropy,
  calculateEmbeddingEntropy,
  detectScoreDrop,
  calculateScoreStats,
  generateDriftAlert,
  analyzeDrift,
  generateSummary,
  compareCentroids,
} from './analyzer';

// Collector
export {
  calculateCentroid,
  calculateEmbeddingStdDev,
  createSnapshotFromInput,
  DriftCollector,
  getDateNDaysAgo,
  getCollectionsForSnapshotCollection,
} from './collector';
