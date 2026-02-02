/**
 * Dead Letter Queue (DLQ) Types
 *
 * Types for managing failed jobs that have exceeded max retries.
 */

import type { HealingJobType, IssueType, TriggerSource, IssuesSummary, ActionSummary, JobError } from '../types';

// ============================================
// Core Enums
// ============================================

/**
 * Status of a DLQ entry
 */
export type DLQStatus = 'pending' | 'retrying' | 'resolved' | 'archived' | 'discarded';

/**
 * Failure code categories for grouping
 */
export type FailureCode =
  | 'timeout'           // Job execution timeout
  | 'rate_limit'        // Rate limit exceeded
  | 'resource_exhausted' // Memory/CPU/disk limit
  | 'auth_error'        // Authentication/authorization failure
  | 'network_error'     // Network connectivity issues
  | 'data_error'        // Invalid/corrupted data
  | 'config_error'      // Configuration issues
  | 'dependency_error'  // External service dependency failure
  | 'unknown';          // Unclassified errors

// ============================================
// DLQ Entry Types
// ============================================

/**
 * Dead Letter Queue entry
 */
export interface DLQEntry {
  id: string;

  // Original job reference
  originalJobId: string;
  collectionId: string;
  userId: string;
  orgId?: string;

  // Original job data
  jobType: HealingJobType;
  targetIssues: IssueType[];
  priority: number;

  // Failure information
  failureReason: string;
  failureCode?: FailureCode;
  failureDetails?: FailureDetails;

  // Retry tracking
  originalRetryCount: number;
  dlqRetryCount: number;
  maxDlqRetries: number;
  lastRetryAt?: string;
  nextRetryAt?: string;

  // Status
  status: DLQStatus;
  resolutionNotes?: string;
  resolvedBy?: string;
  resolvedAt?: string;

  // Original job metrics
  chunksScanned: number;
  chunksHealed: number;
  chunksFailed: number;
  issuesFound: IssuesSummary;
  actionsTaken: ActionSummary[];
  errors: JobError[];

  // Original timing
  originalScheduledAt?: string;
  originalStartedAt?: string;
  originalFailedAt?: string;
  originalDurationMs?: number;

  // Trigger info
  triggeredBy: TriggerSource;
  triggerRuleId?: string;

  // Alert tracking
  alertSent: boolean;
  alertSentAt?: string;
  alertAcknowledged: boolean;
  alertAcknowledgedAt?: string;
  alertAcknowledgedBy?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * Detailed failure information
 */
export interface FailureDetails {
  stackTrace?: string;
  errorMessage?: string;
  context?: Record<string, unknown>;
  lastSuccessfulStep?: string;
  failedStep?: string;
  resourceMetrics?: ResourceMetrics;
}

/**
 * Resource metrics at time of failure
 */
export interface ResourceMetrics {
  memoryUsedMb?: number;
  memoryLimitMb?: number;
  cpuUsagePercent?: number;
  diskUsedGb?: number;
  diskLimitGb?: number;
  activeConnections?: number;
}

// ============================================
// DLQ Statistics Types
// ============================================

/**
 * DLQ statistics for a user
 */
export interface DLQStats {
  pendingCount: number;
  retryingCount: number;
  resolvedCount: number;
  archivedCount: number;
  discardedCount: number;
  totalCount: number;
  unacknowledgedAlerts: number;
  oldestPendingAt?: string;
}

/**
 * Extended DLQ statistics with breakdown
 */
export interface DLQExtendedStats extends DLQStats {
  pendingByFailureCode: Record<FailureCode, number>;
  newestEntryAt?: string;
  avgResolutionTimeMs?: number;
  retrySuccessRate?: number;
}

// ============================================
// API Request/Response Types
// ============================================

/**
 * List DLQ params
 */
export interface ListDLQParams {
  collectionId?: string;
  status?: DLQStatus | DLQStatus[];
  failureCode?: FailureCode | FailureCode[];
  limit?: number;
  offset?: number;
  sortBy?: 'created_at' | 'updated_at' | 'priority';
  sortOrder?: 'asc' | 'desc';
}

/**
 * DLQ list response
 */
export interface DLQListResponse {
  success: boolean;
  entries: DLQEntry[];
  total: number;
  stats?: DLQStats;
}

/**
 * Retry DLQ request
 */
export interface RetryDLQRequest {
  dlqId: string;
  modifyJob?: {
    priority?: number;
    targetIssues?: IssueType[];
  };
}

/**
 * Retry DLQ response
 */
export interface RetryDLQResponse {
  success: boolean;
  newJobId: string;
  dlqEntry: DLQEntry;
}

/**
 * Resolve DLQ request
 */
export interface ResolveDLQRequest {
  dlqId: string;
  status: 'resolved' | 'archived' | 'discarded';
  resolutionNotes?: string;
}

/**
 * Resolve DLQ response
 */
export interface ResolveDLQResponse {
  success: boolean;
  dlqEntry: DLQEntry;
}

/**
 * Bulk DLQ action request
 */
export interface BulkDLQActionRequest {
  dlqIds: string[];
  action: 'retry' | 'resolve' | 'archive' | 'discard' | 'acknowledge';
  resolutionNotes?: string;
}

/**
 * Bulk DLQ action response
 */
export interface BulkDLQActionResponse {
  success: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  errors?: Array<{ dlqId: string; error: string }>;
}

// ============================================
// Alert Types
// ============================================

/**
 * DLQ alert configuration
 */
export interface DLQAlertConfig {
  enabled: boolean;
  emailAlerts: boolean;
  webhookAlerts: boolean;
  webhookUrl?: string;
  alertThreshold: number; // Alert when pending count exceeds this
  criticalThreshold: number; // Critical alert threshold
  cooldownMinutes: number; // Minimum time between alerts
}

/**
 * DLQ alert payload
 */
export interface DLQAlertPayload {
  type: 'dlq_alert';
  severity: 'warning' | 'critical';
  userId: string;
  collectionId?: string;
  pendingCount: number;
  threshold: number;
  oldestPendingAt?: string;
  recentFailures: Array<{
    dlqId: string;
    failureReason: string;
    failureCode?: string;
    createdAt: string;
  }>;
  timestamp: string;
}

// ============================================
// Monitoring Types
// ============================================

/**
 * DLQ monitoring metrics
 */
export interface DLQMetrics {
  userId: string;
  timestamp: string;
  gauges: {
    pendingCount: number;
    retryingCount: number;
    unacknowledgedAlerts: number;
    oldestPendingAgeMs: number;
  };
  counters: {
    entriesCreated: number;
    retriesAttempted: number;
    retriesSucceeded: number;
    entriesResolved: number;
    entriesDiscarded: number;
  };
  histograms: {
    resolutionTimeMs: number[];
    retryCountDistribution: Record<number, number>;
  };
}

// ============================================
// Constants
// ============================================

/**
 * Default DLQ configuration
 */
export const DEFAULT_DLQ_CONFIG = {
  maxDlqRetries: 3,
  alertThreshold: 5,
  criticalThreshold: 20,
  cooldownMinutes: 60,
  retentionDays: 30,
} as const;

/**
 * Failure code descriptions
 */
export const FAILURE_CODE_DESCRIPTIONS: Record<FailureCode, string> = {
  timeout: 'Job execution exceeded the time limit',
  rate_limit: 'Rate limit for embeddings or API calls was exceeded',
  resource_exhausted: 'System resources (memory, CPU, disk) were exhausted',
  auth_error: 'Authentication or authorization failure',
  network_error: 'Network connectivity or external service unreachable',
  data_error: 'Invalid, corrupted, or missing data',
  config_error: 'Configuration error or missing settings',
  dependency_error: 'External service or dependency failure',
  unknown: 'Unclassified or unexpected error',
};

/**
 * Classify error message into failure code
 */
export function classifyFailureCode(error: Error | string): FailureCode {
  const message = typeof error === 'string' ? error.toLowerCase() : error.message.toLowerCase();

  if (message.includes('timeout') || message.includes('timed out') || message.includes('deadline exceeded')) {
    return 'timeout';
  }

  if (message.includes('rate limit') || message.includes('too many requests') || message.includes('429')) {
    return 'rate_limit';
  }

  if (message.includes('memory') || message.includes('cpu') || message.includes('disk') || message.includes('quota')) {
    return 'resource_exhausted';
  }

  if (message.includes('auth') || message.includes('unauthorized') || message.includes('forbidden') || message.includes('401') || message.includes('403')) {
    return 'auth_error';
  }

  if (message.includes('network') || message.includes('connection') || message.includes('unreachable') || message.includes('econnrefused') || message.includes('dns')) {
    return 'network_error';
  }

  if (message.includes('invalid') || message.includes('corrupt') || message.includes('missing') || message.includes('not found') || message.includes('null') || message.includes('undefined')) {
    return 'data_error';
  }

  if (message.includes('config') || message.includes('setting') || message.includes('environment') || message.includes('env')) {
    return 'config_error';
  }

  if (message.includes('service') || message.includes('external') || message.includes('dependency') || message.includes('api')) {
    return 'dependency_error';
  }

  return 'unknown';
}
