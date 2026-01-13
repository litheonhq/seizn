/**
 * Canary Deployment Module
 *
 * Progressive rollout with traffic splitting and automatic rollback
 * for RAG pipeline configurations.
 *
 * @example
 * ```typescript
 * import {
 *   startDeployment,
 *   getActiveAssignment,
 *   recordRequestResult,
 *   runHealthCheck,
 * } from '@/lib/fall/canary';
 *
 * // Start canary deployment
 * const deployment = startDeployment(userId, {
 *   baselineVersion: { name: 'v1', config: {...} },
 *   canaryVersion: { name: 'v2', config: {...} },
 * });
 *
 * // Route traffic
 * const assignment = getActiveAssignment(userId, { sessionId });
 * const config = assignment.version.config;
 *
 * // Record result
 * recordRequestResult({
 *   deploymentId: deployment.id,
 *   version: assignment.assignedVersion,
 *   success: true,
 *   latencyMs: 150,
 * });
 *
 * // Health check triggers auto-rollback if needed
 * runHealthCheck(deployment.id);
 * ```
 */

// Types
export type {
  DeploymentStatus,
  CanaryStage,
  CanaryMetricType,
  RollbackReason,
  MetricThreshold,
  CanaryConfig,
  ModelVersion,
  CanaryDeployment,
  DeploymentMetrics,
  TrafficAssignment,
  TrafficContext,
  HealthCheckResult,
  MetricCheck,
  StartDeploymentRequest,
  StartDeploymentResponse,
  GetAssignmentRequest,
  RecordResultRequest,
  DeploymentActionRequest,
  CanaryConfigRow,
  CanaryDeploymentRow,
} from './types';
export { DEFAULT_CANARY_CONFIG, EMPTY_METRICS } from './types';

// Router
export {
  CanaryRouter,
  getRouter,
  removeRouter,
  assignTraffic,
  stageToPercent,
  percentToStage,
  getNextStage,
  getPreviousStage,
  isAtFinalStage,
} from './router';

// Health monitoring
export {
  metricsCollector,
  performHealthCheck,
  shouldPromote,
  clearHealthState,
  generateRollbackReport,
} from './health';

// Manager
export {
  createConfig,
  getConfig,
  getOrCreateDefaultConfig,
  startDeployment,
  getDeployment,
  getActiveDeployment,
  listDeployments,
  getTrafficAssignment,
  getActiveAssignment,
  recordRequestResult,
  promoteDeployment,
  completeDeployment,
  rollbackDeployment,
  cancelDeployment,
  runHealthCheck,
  startHealthMonitoring,
  tryAutoPromote,
  startAutoPromotion,
} from './manager';
