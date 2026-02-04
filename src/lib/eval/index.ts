/**
 * Auto-Eval System
 *
 * Automatic evaluation triggered by policy/model changes.
 * Implements SSDF (Secure Software Development Framework) requirements.
 *
 * Includes:
 * - Auto-eval service for policy/model changes
 * - Security evaluation (OWASP LLM Top 10)
 * - Regression detection
 * - Compliance validation
 * - Ragas-compatible RAG evaluation metrics
 */

export * from './types';
export * from './events';
export { autoEvalService, AutoEvalService } from './auto-eval-service';
export { runSecurityTestsForPolicy, runSecuritySmokeTest } from './security-eval';
export { runRegressionCheck } from './regression-eval';
export { runComplianceCheck } from './compliance-eval';

// Ragas-compatible evaluation metrics
export {
  evaluateRagas,
  evaluateRagasBatch,
  computeAnswerRelevancy,
  computeAnswerCorrectness,
  computeAnswerSimilarity,
  computeFaithfulness,
  computeContextPrecision,
  computeContextRecall,
  computeContextRelevancy,
  RagasMetricsEvaluator,
  type RagasEvalInput,
  type RagasMetrics,
  type RagasEvalResult,
  type RagasEvalOptions,
  type RagasBatchResult,
} from './ragas-metrics';
