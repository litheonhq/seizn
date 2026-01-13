/**
 * RetOps (Retrieval Operations) Dashboard
 *
 * Monitoring and analytics for RAG retrieval operations.
 */

// Types
export * from './types';

// Metrics Collection
export {
  recordRetrievalOperation,
  getMetrics,
  getStats,
  getTimeSeries,
} from './metrics-collector';

// Quality Analysis
export {
  evaluateQuery,
  recordQualityEvaluation,
  recordRelevanceJudgment,
  getQualityMetrics,
  getQualityTrend,
  compareQualityPeriods,
  calculateMRR,
  calculateNDCG,
  calculatePrecisionAtK,
  calculateRecallAtK,
} from './quality-analyzer';

// Anomaly Detection
export {
  detectAnomalies,
  checkThresholds,
  getAlerts,
  acknowledgeAlert,
  resolveAlert,
} from './anomaly-detector';
