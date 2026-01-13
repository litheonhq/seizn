/**
 * Canary Deployment Types
 *
 * Type definitions for canary deployment, traffic splitting,
 * and automatic rollback functionality.
 */

// ============================================
// Core Types
// ============================================

/**
 * Deployment status
 */
export type DeploymentStatus =
  | 'pending'      // Waiting to start
  | 'rolling_out'  // Actively rolling out
  | 'monitoring'   // Monitoring after rollout
  | 'stable'       // Successfully completed
  | 'rolling_back' // Rolling back
  | 'rolled_back'  // Rollback completed
  | 'failed';      // Deployment failed

/**
 * Canary stage in progressive rollout
 */
export type CanaryStage = '0%' | '5%' | '10%' | '25%' | '50%' | '75%' | '100%';

/**
 * Metric type for health monitoring
 */
export type CanaryMetricType =
  | 'error_rate'       // Error percentage
  | 'latency_p50'      // 50th percentile latency
  | 'latency_p95'      // 95th percentile latency
  | 'latency_p99'      // 99th percentile latency
  | 'success_rate'     // Success percentage
  | 'quality_score'    // RAG quality score
  | 'groundedness';    // Answer groundedness

/**
 * Rollback reason
 */
export type RollbackReason =
  | 'error_threshold_exceeded'
  | 'latency_threshold_exceeded'
  | 'quality_degradation'
  | 'manual_trigger'
  | 'health_check_failed'
  | 'timeout';

// ============================================
// Canary Configuration
// ============================================

/**
 * Metric threshold for rollback
 */
export interface MetricThreshold {
  /** Metric type */
  metric: CanaryMetricType;
  /** Threshold value */
  threshold: number;
  /** Comparison operator */
  operator: 'gt' | 'lt' | 'gte' | 'lte';
  /** Window size in seconds for metric calculation */
  windowSeconds: number;
  /** Minimum sample size required */
  minSamples: number;
}

/**
 * Canary deployment configuration
 */
export interface CanaryConfig {
  /** Unique identifier */
  id: string;
  /** User who owns this config */
  userId: string;
  /** Configuration name */
  name: string;
  /** Description */
  description?: string;

  // Rollout settings
  /** Stages for progressive rollout */
  stages: CanaryStage[];
  /** Time to wait at each stage (seconds) */
  stageWaitSeconds: number;
  /** Minimum samples required per stage before promotion */
  minSamplesPerStage: number;

  // Rollback settings
  /** Metric thresholds for automatic rollback */
  rollbackThresholds: MetricThreshold[];
  /** Enable automatic rollback */
  autoRollbackEnabled: boolean;
  /** Grace period before rollback (seconds) */
  rollbackGraceSeconds: number;

  // Health check settings
  /** Health check interval (seconds) */
  healthCheckIntervalSeconds: number;
  /** Maximum consecutive failures before rollback */
  maxConsecutiveFailures: number;
  /** Health check timeout (milliseconds) */
  healthCheckTimeoutMs: number;

  /** Is this config active? */
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Default canary configuration
 */
export const DEFAULT_CANARY_CONFIG: Omit<CanaryConfig, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
  name: 'Default Canary Config',
  stages: ['5%', '10%', '25%', '50%', '100%'],
  stageWaitSeconds: 300, // 5 minutes per stage
  minSamplesPerStage: 50,
  rollbackThresholds: [
    {
      metric: 'error_rate',
      threshold: 0.05, // 5% error rate
      operator: 'gt',
      windowSeconds: 60,
      minSamples: 10,
    },
    {
      metric: 'latency_p95',
      threshold: 5000, // 5 seconds
      operator: 'gt',
      windowSeconds: 60,
      minSamples: 10,
    },
  ],
  autoRollbackEnabled: true,
  rollbackGraceSeconds: 30,
  healthCheckIntervalSeconds: 30,
  maxConsecutiveFailures: 3,
  healthCheckTimeoutMs: 5000,
  isActive: true,
};

// ============================================
// Deployment Types
// ============================================

/**
 * Model version for deployment
 */
export interface ModelVersion {
  /** Version identifier */
  id: string;
  /** Version name/tag */
  name: string;
  /** Model configuration */
  config: Record<string, unknown>;
  /** Prompt template ID */
  promptTemplateId?: string;
  /** Retrieval configuration */
  retrievalConfig?: Record<string, unknown>;
  /** Creation timestamp */
  createdAt: string;
}

/**
 * Canary deployment record
 */
export interface CanaryDeployment {
  /** Unique identifier */
  id: string;
  /** User who owns this deployment */
  userId: string;
  /** Canary config used */
  configId: string;
  /** Target collection (optional) */
  collectionId?: string;

  // Versions
  /** Baseline (stable) version */
  baselineVersion: ModelVersion;
  /** Canary (new) version */
  canaryVersion: ModelVersion;

  // Status
  /** Current deployment status */
  status: DeploymentStatus;
  /** Current stage */
  currentStage: CanaryStage;
  /** Canary traffic percentage (0-100) */
  canaryTrafficPercent: number;

  // Metrics
  /** Baseline metrics */
  baselineMetrics: DeploymentMetrics;
  /** Canary metrics */
  canaryMetrics: DeploymentMetrics;

  // Timing
  /** Deployment start time */
  startedAt: string;
  /** Last stage promotion time */
  lastPromotedAt?: string;
  /** Completion/rollback time */
  completedAt?: string;

  // Rollback info
  /** If rolled back, the reason */
  rollbackReason?: RollbackReason;
  /** Rollback details */
  rollbackDetails?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * Metrics collected during deployment
 */
export interface DeploymentMetrics {
  /** Total requests */
  totalRequests: number;
  /** Successful requests */
  successfulRequests: number;
  /** Failed requests */
  failedRequests: number;
  /** Error rate (0-1) */
  errorRate: number;
  /** Average latency (ms) */
  avgLatencyMs: number;
  /** P50 latency (ms) */
  p50LatencyMs: number;
  /** P95 latency (ms) */
  p95LatencyMs: number;
  /** P99 latency (ms) */
  p99LatencyMs: number;
  /** Average quality score (0-1) */
  avgQualityScore?: number;
  /** Average groundedness score (0-1) */
  avgGroundedness?: number;
  /** Last updated */
  lastUpdatedAt: string;
}

/**
 * Empty metrics object
 */
export const EMPTY_METRICS: DeploymentMetrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  errorRate: 0,
  avgLatencyMs: 0,
  p50LatencyMs: 0,
  p95LatencyMs: 0,
  p99LatencyMs: 0,
  lastUpdatedAt: new Date().toISOString(),
};

// ============================================
// Traffic Assignment Types
// ============================================

/**
 * Traffic assignment for a request
 */
export interface TrafficAssignment {
  /** Deployment ID */
  deploymentId: string;
  /** Assigned version ('baseline' or 'canary') */
  assignedVersion: 'baseline' | 'canary';
  /** Version details */
  version: ModelVersion;
  /** Assignment reason */
  reason: 'percentage' | 'sticky' | 'override' | 'fallback';
  /** Timestamp */
  assignedAt: string;
}

/**
 * Traffic routing context
 */
export interface TrafficContext {
  /** User ID (for sticky routing) */
  userId?: string;
  /** API key ID */
  apiKeyId?: string;
  /** Session ID */
  sessionId?: string;
  /** Collection ID */
  collectionId?: string;
  /** Force specific version */
  forceVersion?: 'baseline' | 'canary';
}

// ============================================
// Health Check Types
// ============================================

/**
 * Health check result
 */
export interface HealthCheckResult {
  /** Deployment ID */
  deploymentId: string;
  /** Check timestamp */
  timestamp: string;
  /** Overall health status */
  healthy: boolean;
  /** Individual metric checks */
  checks: MetricCheck[];
  /** Consecutive failures */
  consecutiveFailures: number;
  /** Should trigger rollback */
  shouldRollback: boolean;
  /** Rollback reason if applicable */
  rollbackReason?: RollbackReason;
}

/**
 * Individual metric check result
 */
export interface MetricCheck {
  /** Metric type */
  metric: CanaryMetricType;
  /** Current value */
  value: number;
  /** Threshold */
  threshold: number;
  /** Operator */
  operator: 'gt' | 'lt' | 'gte' | 'lte';
  /** Check passed */
  passed: boolean;
  /** Sample count */
  sampleCount: number;
}

// ============================================
// API Request/Response Types
// ============================================

/**
 * Request to start canary deployment
 */
export interface StartDeploymentRequest {
  /** Canary config ID to use */
  configId?: string;
  /** Target collection ID */
  collectionId?: string;
  /** Baseline version */
  baselineVersion: Omit<ModelVersion, 'id' | 'createdAt'>;
  /** Canary version */
  canaryVersion: Omit<ModelVersion, 'id' | 'createdAt'>;
}

/**
 * Response from starting deployment
 */
export interface StartDeploymentResponse {
  /** Created deployment */
  deployment: CanaryDeployment;
  /** Message */
  message: string;
}

/**
 * Request to get traffic assignment
 */
export interface GetAssignmentRequest {
  /** Deployment ID */
  deploymentId: string;
  /** Traffic context */
  context: TrafficContext;
}

/**
 * Request to record request result
 */
export interface RecordResultRequest {
  /** Deployment ID */
  deploymentId: string;
  /** Version that served the request */
  version: 'baseline' | 'canary';
  /** Request success */
  success: boolean;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Quality score (optional) */
  qualityScore?: number;
  /** Groundedness score (optional) */
  groundedness?: number;
  /** Error message if failed */
  errorMessage?: string;
}

/**
 * Request to promote/rollback deployment
 */
export interface DeploymentActionRequest {
  /** Deployment ID */
  deploymentId: string;
  /** Action to take */
  action: 'promote' | 'rollback' | 'cancel';
  /** Reason (for rollback) */
  reason?: string;
}

// ============================================
// Database Row Types
// ============================================

/**
 * Canary config database row
 */
export interface CanaryConfigRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  stages: CanaryStage[];
  stage_wait_seconds: number;
  min_samples_per_stage: number;
  rollback_thresholds: MetricThreshold[];
  auto_rollback_enabled: boolean;
  rollback_grace_seconds: number;
  health_check_interval_seconds: number;
  max_consecutive_failures: number;
  health_check_timeout_ms: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Canary deployment database row
 */
export interface CanaryDeploymentRow {
  id: string;
  user_id: string;
  config_id: string;
  collection_id: string | null;
  baseline_version: ModelVersion;
  canary_version: ModelVersion;
  status: DeploymentStatus;
  current_stage: CanaryStage;
  canary_traffic_percent: number;
  baseline_metrics: DeploymentMetrics;
  canary_metrics: DeploymentMetrics;
  started_at: string;
  last_promoted_at: string | null;
  completed_at: string | null;
  rollback_reason: RollbackReason | null;
  rollback_details: string | null;
  created_at: string;
  updated_at: string;
}
