/**
 * Canary Traffic Router
 *
 * Routes traffic between baseline and canary versions
 * based on deployment configuration.
 */

import { createHash } from 'crypto';
import type {
  CanaryDeployment,
  TrafficAssignment,
  TrafficContext,
  ModelVersion,
  CanaryStage,
} from './types';

// ============================================
// Stage to Percentage Mapping
// ============================================

const STAGE_PERCENTAGES: Record<CanaryStage, number> = {
  '0%': 0,
  '5%': 5,
  '10%': 10,
  '25%': 25,
  '50%': 50,
  '75%': 75,
  '100%': 100,
};

/**
 * Convert stage to percentage
 */
export function stageToPercent(stage: CanaryStage): number {
  return STAGE_PERCENTAGES[stage];
}

/**
 * Convert percentage to nearest stage
 */
export function percentToStage(percent: number): CanaryStage {
  const stages = Object.entries(STAGE_PERCENTAGES)
    .sort((a, b) => a[1] - b[1]);

  for (const [stage, pct] of stages) {
    if (percent <= pct) {
      return stage as CanaryStage;
    }
  }
  return '100%';
}

// ============================================
// Traffic Router Class
// ============================================

export class CanaryRouter {
  private deployment: CanaryDeployment;
  private stickyAssignments: Map<string, 'baseline' | 'canary'> = new Map();

  constructor(deployment: CanaryDeployment) {
    this.deployment = deployment;
  }

  /**
   * Get traffic assignment for a request
   */
  assign(context: TrafficContext): TrafficAssignment {
    const now = new Date().toISOString();

    // Check if deployment is active
    if (!this.isDeploymentActive()) {
      return this.createAssignment('baseline', 'fallback', now);
    }

    // Check for forced version
    if (context.forceVersion) {
      return this.createAssignment(context.forceVersion, 'override', now);
    }

    // Check for sticky assignment
    const stickyKey = this.getStickyKey(context);
    if (stickyKey) {
      const existing = this.stickyAssignments.get(stickyKey);
      if (existing) {
        return this.createAssignment(existing, 'sticky', now);
      }
    }

    // Percentage-based routing
    const assignedVersion = this.routeByPercentage(context);

    // Store sticky assignment
    if (stickyKey) {
      this.stickyAssignments.set(stickyKey, assignedVersion);
    }

    return this.createAssignment(assignedVersion, 'percentage', now);
  }

  /**
   * Route based on percentage
   */
  private routeByPercentage(context: TrafficContext): 'baseline' | 'canary' {
    const canaryPercent = this.deployment.canaryTrafficPercent;

    if (canaryPercent === 0) return 'baseline';
    if (canaryPercent === 100) return 'canary';

    // Deterministic hash-based routing for consistency
    const hashInput = this.getHashInput(context);
    const hash = createHash('sha256').update(hashInput).digest('hex');
    const hashNum = parseInt(hash.substring(0, 8), 16);
    const bucket = hashNum % 100;

    return bucket < canaryPercent ? 'canary' : 'baseline';
  }

  /**
   * Get sticky key for a context
   */
  private getStickyKey(context: TrafficContext): string | null {
    if (context.userId) return `user:${context.userId}`;
    if (context.sessionId) return `session:${context.sessionId}`;
    if (context.apiKeyId) return `apikey:${context.apiKeyId}`;
    return null;
  }

  /**
   * Get hash input for deterministic routing
   */
  private getHashInput(context: TrafficContext): string {
    const parts = [
      this.deployment.id,
      context.userId || '',
      context.sessionId || '',
      context.apiKeyId || '',
      context.collectionId || '',
    ];
    return parts.join(':');
  }

  /**
   * Check if deployment is active
   */
  private isDeploymentActive(): boolean {
    return ['rolling_out', 'monitoring'].includes(this.deployment.status);
  }

  /**
   * Create traffic assignment
   */
  private createAssignment(
    version: 'baseline' | 'canary',
    reason: TrafficAssignment['reason'],
    timestamp: string
  ): TrafficAssignment {
    const versionDetails = version === 'baseline'
      ? this.deployment.baselineVersion
      : this.deployment.canaryVersion;

    return {
      deploymentId: this.deployment.id,
      assignedVersion: version,
      version: versionDetails,
      reason,
      assignedAt: timestamp,
    };
  }

  /**
   * Update deployment (e.g., after stage promotion)
   */
  updateDeployment(deployment: CanaryDeployment): void {
    this.deployment = deployment;
  }

  /**
   * Clear sticky assignments (e.g., after rollback)
   */
  clearStickyAssignments(): void {
    this.stickyAssignments.clear();
  }

  /**
   * Get current deployment
   */
  getDeployment(): CanaryDeployment {
    return this.deployment;
  }
}

// ============================================
// Router Factory
// ============================================

const activeRouters = new Map<string, CanaryRouter>();

/**
 * Get or create router for a deployment
 */
export function getRouter(deployment: CanaryDeployment): CanaryRouter {
  let router = activeRouters.get(deployment.id);

  if (!router) {
    router = new CanaryRouter(deployment);
    activeRouters.set(deployment.id, router);
  } else {
    router.updateDeployment(deployment);
  }

  return router;
}

/**
 * Remove router for a deployment
 */
export function removeRouter(deploymentId: string): void {
  activeRouters.delete(deploymentId);
}

/**
 * Get traffic assignment for a deployment
 */
export function assignTraffic(
  deployment: CanaryDeployment,
  context: TrafficContext
): TrafficAssignment {
  const router = getRouter(deployment);
  return router.assign(context);
}

// ============================================
// Utility Functions
// ============================================

/**
 * Calculate next stage in rollout
 */
export function getNextStage(
  currentStage: CanaryStage,
  availableStages: CanaryStage[]
): CanaryStage | null {
  const currentIdx = availableStages.indexOf(currentStage);

  if (currentIdx === -1) {
    return availableStages[0] || null;
  }

  if (currentIdx >= availableStages.length - 1) {
    return null; // Already at last stage
  }

  return availableStages[currentIdx + 1];
}

/**
 * Get previous stage for rollback
 */
export function getPreviousStage(
  currentStage: CanaryStage,
  availableStages: CanaryStage[]
): CanaryStage | null {
  const currentIdx = availableStages.indexOf(currentStage);

  if (currentIdx <= 0) {
    return null; // Already at first stage or not found
  }

  return availableStages[currentIdx - 1];
}

/**
 * Check if deployment is at final stage
 */
export function isAtFinalStage(
  currentStage: CanaryStage,
  availableStages: CanaryStage[]
): boolean {
  const currentIdx = availableStages.indexOf(currentStage);
  return currentIdx === availableStages.length - 1;
}
