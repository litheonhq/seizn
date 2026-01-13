/**
 * Canary Deployment Manager
 *
 * Manages the lifecycle of canary deployments including
 * creation, promotion, and rollback.
 */

import { randomUUID } from 'crypto';
import type {
  CanaryDeployment,
  CanaryConfig,
  ModelVersion,
  DeploymentStatus,
  CanaryStage,
  RollbackReason,
  StartDeploymentRequest,
  TrafficContext,
  TrafficAssignment,
  RecordResultRequest,
  HealthCheckResult,
} from './types';
import { DEFAULT_CANARY_CONFIG, EMPTY_METRICS } from './types';
import { assignTraffic, getNextStage, isAtFinalStage, stageToPercent, removeRouter } from './router';
import { metricsCollector, performHealthCheck, shouldPromote, clearHealthState, generateRollbackReport } from './health';

// ============================================
// In-Memory Storage (replace with DB in production)
// ============================================

const deployments = new Map<string, CanaryDeployment>();
const configs = new Map<string, CanaryConfig>();

// ============================================
// Configuration Management
// ============================================

/**
 * Create a canary config
 */
export function createConfig(
  userId: string,
  config: Partial<CanaryConfig>
): CanaryConfig {
  const now = new Date().toISOString();
  const id = randomUUID();

  const newConfig: CanaryConfig = {
    ...DEFAULT_CANARY_CONFIG,
    ...config,
    id,
    userId,
    createdAt: now,
    updatedAt: now,
  };

  configs.set(id, newConfig);
  return newConfig;
}

/**
 * Get a canary config
 */
export function getConfig(configId: string): CanaryConfig | null {
  return configs.get(configId) || null;
}

/**
 * Get default config for user (or create one)
 */
export function getOrCreateDefaultConfig(userId: string): CanaryConfig {
  // Look for existing default config
  for (const config of configs.values()) {
    if (config.userId === userId && config.name === 'Default Canary Config') {
      return config;
    }
  }

  // Create default config
  return createConfig(userId, {});
}

// ============================================
// Deployment Management
// ============================================

/**
 * Start a canary deployment
 */
export function startDeployment(
  userId: string,
  request: StartDeploymentRequest
): CanaryDeployment {
  const now = new Date().toISOString();
  const id = randomUUID();

  // Get or create config
  const config = request.configId
    ? getConfig(request.configId) || getOrCreateDefaultConfig(userId)
    : getOrCreateDefaultConfig(userId);

  // Create version objects
  const baselineVersion: ModelVersion = {
    id: randomUUID(),
    ...request.baselineVersion,
    createdAt: now,
  };

  const canaryVersion: ModelVersion = {
    id: randomUUID(),
    ...request.canaryVersion,
    createdAt: now,
  };

  // Create deployment
  const initialStage = config.stages[0] || '5%';
  const deployment: CanaryDeployment = {
    id,
    userId,
    configId: config.id,
    collectionId: request.collectionId,
    baselineVersion,
    canaryVersion,
    status: 'rolling_out',
    currentStage: initialStage,
    canaryTrafficPercent: stageToPercent(initialStage),
    baselineMetrics: { ...createEmptyMetrics(now) },
    canaryMetrics: { ...createEmptyMetrics(now) },
    startedAt: now,
    lastPromotedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  // Store deployment
  deployments.set(id, deployment);

  // Initialize metrics
  metricsCollector.initialize(id);

  return deployment;
}

/**
 * Create empty metrics
 */
function createEmptyMetrics(timestamp: string) {
  return {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    errorRate: 0,
    avgLatencyMs: 0,
    p50LatencyMs: 0,
    p95LatencyMs: 0,
    p99LatencyMs: 0,
    lastUpdatedAt: timestamp,
  };
}

/**
 * Get a deployment
 */
export function getDeployment(deploymentId: string): CanaryDeployment | null {
  return deployments.get(deploymentId) || null;
}

/**
 * Get active deployment for a user/collection
 */
export function getActiveDeployment(
  userId: string,
  collectionId?: string
): CanaryDeployment | null {
  for (const deployment of deployments.values()) {
    if (
      deployment.userId === userId &&
      deployment.collectionId === collectionId &&
      ['rolling_out', 'monitoring'].includes(deployment.status)
    ) {
      return deployment;
    }
  }
  return null;
}

/**
 * List deployments for a user
 */
export function listDeployments(userId: string): CanaryDeployment[] {
  return Array.from(deployments.values())
    .filter(d => d.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ============================================
// Traffic Routing
// ============================================

/**
 * Get traffic assignment for a request
 */
export function getTrafficAssignment(
  deploymentId: string,
  context: TrafficContext
): TrafficAssignment | null {
  const deployment = getDeployment(deploymentId);
  if (!deployment) return null;

  return assignTraffic(deployment, context);
}

/**
 * Get assignment for active deployment
 */
export function getActiveAssignment(
  userId: string,
  context: TrafficContext
): TrafficAssignment | null {
  const deployment = getActiveDeployment(userId, context.collectionId);
  if (!deployment) return null;

  return assignTraffic(deployment, context);
}

// ============================================
// Metrics Recording
// ============================================

/**
 * Record a request result
 */
export function recordRequestResult(request: RecordResultRequest): void {
  const deployment = getDeployment(request.deploymentId);
  if (!deployment) return;

  // Record to collector
  metricsCollector.recordResult(request);

  // Update deployment metrics
  const metrics = metricsCollector.getMetrics(request.deploymentId);
  if (metrics) {
    deployment.baselineMetrics = metrics.baseline;
    deployment.canaryMetrics = metrics.canary;
    deployment.updatedAt = new Date().toISOString();
    deployments.set(request.deploymentId, deployment);
  }
}

// ============================================
// Deployment Actions
// ============================================

/**
 * Promote deployment to next stage
 */
export function promoteDeployment(deploymentId: string): {
  success: boolean;
  deployment: CanaryDeployment | null;
  message: string;
} {
  const deployment = getDeployment(deploymentId);
  if (!deployment) {
    return { success: false, deployment: null, message: 'Deployment not found' };
  }

  const config = getConfig(deployment.configId) || getOrCreateDefaultConfig(deployment.userId);

  // Check if ready to promote
  const { shouldPromote: ready, reason } = shouldPromote(deployment, config);
  if (!ready) {
    return { success: false, deployment, message: reason };
  }

  // Get next stage
  const nextStage = getNextStage(deployment.currentStage, config.stages);

  if (!nextStage) {
    // Complete the deployment
    return completeDeployment(deploymentId);
  }

  // Promote to next stage
  const now = new Date().toISOString();
  deployment.currentStage = nextStage;
  deployment.canaryTrafficPercent = stageToPercent(nextStage);
  deployment.lastPromotedAt = now;
  deployment.updatedAt = now;

  // If at final stage, move to monitoring
  if (isAtFinalStage(nextStage, config.stages)) {
    deployment.status = 'monitoring';
  }

  deployments.set(deploymentId, deployment);

  return {
    success: true,
    deployment,
    message: `Promoted to ${nextStage} (${deployment.canaryTrafficPercent}% canary traffic)`,
  };
}

/**
 * Complete a deployment (canary becomes stable)
 */
export function completeDeployment(deploymentId: string): {
  success: boolean;
  deployment: CanaryDeployment | null;
  message: string;
} {
  const deployment = getDeployment(deploymentId);
  if (!deployment) {
    return { success: false, deployment: null, message: 'Deployment not found' };
  }

  const now = new Date().toISOString();
  deployment.status = 'stable';
  deployment.currentStage = '100%';
  deployment.canaryTrafficPercent = 100;
  deployment.completedAt = now;
  deployment.updatedAt = now;

  deployments.set(deploymentId, deployment);

  // Cleanup
  removeRouter(deploymentId);
  clearHealthState(deploymentId);

  return {
    success: true,
    deployment,
    message: 'Deployment completed successfully. Canary is now stable.',
  };
}

/**
 * Rollback a deployment
 */
export function rollbackDeployment(
  deploymentId: string,
  reason: RollbackReason,
  details?: string
): {
  success: boolean;
  deployment: CanaryDeployment | null;
  message: string;
  report?: string;
} {
  const deployment = getDeployment(deploymentId);
  if (!deployment) {
    return { success: false, deployment: null, message: 'Deployment not found' };
  }

  const config = getConfig(deployment.configId) || getOrCreateDefaultConfig(deployment.userId);

  // Generate report before rollback
  const healthResult = performHealthCheck(deployment, config);
  const report = generateRollbackReport(deployment, reason, healthResult);

  const now = new Date().toISOString();
  deployment.status = 'rolled_back';
  deployment.currentStage = '0%';
  deployment.canaryTrafficPercent = 0;
  deployment.completedAt = now;
  deployment.rollbackReason = reason;
  deployment.rollbackDetails = details || report;
  deployment.updatedAt = now;

  deployments.set(deploymentId, deployment);

  // Cleanup
  removeRouter(deploymentId);
  clearHealthState(deploymentId);

  return {
    success: true,
    deployment,
    message: `Deployment rolled back: ${reason}`,
    report,
  };
}

/**
 * Cancel a deployment (without rollback)
 */
export function cancelDeployment(deploymentId: string): {
  success: boolean;
  deployment: CanaryDeployment | null;
  message: string;
} {
  const deployment = getDeployment(deploymentId);
  if (!deployment) {
    return { success: false, deployment: null, message: 'Deployment not found' };
  }

  const now = new Date().toISOString();
  deployment.status = 'failed';
  deployment.completedAt = now;
  deployment.updatedAt = now;

  deployments.set(deploymentId, deployment);

  // Cleanup
  removeRouter(deploymentId);
  clearHealthState(deploymentId);

  return {
    success: true,
    deployment,
    message: 'Deployment cancelled',
  };
}

// ============================================
// Health Monitoring
// ============================================

/**
 * Run health check and potentially trigger rollback
 */
export function runHealthCheck(deploymentId: string): HealthCheckResult | null {
  const deployment = getDeployment(deploymentId);
  if (!deployment) return null;

  const config = getConfig(deployment.configId) || getOrCreateDefaultConfig(deployment.userId);
  const result = performHealthCheck(deployment, config);

  // Auto-rollback if needed
  if (result.shouldRollback && config.autoRollbackEnabled) {
    rollbackDeployment(deploymentId, result.rollbackReason!, 'Automatic rollback triggered by health check');
  }

  return result;
}

/**
 * Start periodic health monitoring
 */
export function startHealthMonitoring(
  deploymentId: string,
  intervalMs: number = 30000
): NodeJS.Timer | null {
  const deployment = getDeployment(deploymentId);
  if (!deployment) return null;

  const timer = setInterval(() => {
    const current = getDeployment(deploymentId);
    if (!current || !['rolling_out', 'monitoring'].includes(current.status)) {
      clearInterval(timer);
      return;
    }

    runHealthCheck(deploymentId);
  }, intervalMs);

  return timer;
}

// ============================================
// Auto-Promotion
// ============================================

/**
 * Try to auto-promote if conditions are met
 */
export function tryAutoPromote(deploymentId: string): boolean {
  const result = promoteDeployment(deploymentId);
  return result.success;
}

/**
 * Start auto-promotion loop
 */
export function startAutoPromotion(
  deploymentId: string,
  checkIntervalMs: number = 60000
): NodeJS.Timer | null {
  const deployment = getDeployment(deploymentId);
  if (!deployment) return null;

  const timer = setInterval(() => {
    const current = getDeployment(deploymentId);
    if (!current || !['rolling_out', 'monitoring'].includes(current.status)) {
      clearInterval(timer);
      return;
    }

    tryAutoPromote(deploymentId);
  }, checkIntervalMs);

  return timer;
}
