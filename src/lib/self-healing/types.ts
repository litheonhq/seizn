/**
 * Self-Healing Index Types
 *
 * Types for automatic index maintenance, issue detection, and repair.
 */

// ============================================
// Core Enums
// ============================================

/**
 * Types of index issues that can be detected
 */
export type IssueType =
  | 'stale'              // Source modified after embedding
  | 'orphaned'           // No parent document
  | 'missing_embedding'  // Chunk without embedding vector
  | 'corrupted'          // Invalid or malformed data
  | 'inconsistent'       // Metadata mismatch
  | 'low_quality';       // Below quality threshold

/**
 * Severity levels for detected issues
 */
export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Status of index health
 */
export type HealthStatus = 'healthy' | 'warning' | 'degraded' | 'critical' | 'unknown';

/**
 * Job types for healing operations
 */
export type HealingJobType = 'full_scan' | 'incremental' | 'targeted' | 'emergency';

/**
 * Job status
 */
export type JobStatus = 'pending' | 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/**
 * Healing action types
 */
export type HealingActionType =
  | 'reembed'         // Re-generate embeddings
  | 'delete'          // Remove from index
  | 'flag'            // Mark for review
  | 'reindex'         // Full reindex
  | 'quarantine'      // Isolate problematic chunks
  | 'restore'         // Restore from backup
  | 'update_metadata'; // Fix metadata issues

/**
 * Action result status
 */
export type ActionStatus = 'pending' | 'running' | 'success' | 'partial' | 'failed' | 'rolled_back';

/**
 * Score trend direction
 */
export type ScoreTrend = 'improving' | 'stable' | 'degrading';

/**
 * Job trigger source
 */
export type TriggerSource = 'manual' | 'scheduled' | 'rule' | 'alert' | 'system';

/**
 * Rule trigger operator
 */
export type TriggerOperator = 'AND' | 'OR';

/**
 * Issue queue status
 */
export type IssueQueueStatus = 'pending' | 'processing' | 'resolved' | 'ignored' | 'failed';

/**
 * Detector type for issue discovery
 */
export type DetectorType = 'scanner' | 'realtime' | 'user_report' | 'system';

/**
 * Resolution method
 */
export type ResolutionMethod = 'auto' | 'manual' | 'rule';

// ============================================
// Index Health Types
// ============================================

/**
 * Index health metrics for a collection
 */
export interface IndexHealth {
  id: string;
  collectionId: string;
  userId: string;
  orgId?: string;

  // Chunk metrics
  totalChunks: number;
  healthyChunks: number;
  staleChunks: number;
  orphanedChunks: number;
  missingEmbeddings: number;
  corruptedChunks: number;

  // Computed scores (0-1)
  healthScore: number;
  freshnessScore: number;
  consistencyScore: number;
  coverageScore: number;

  // Status
  status: HealthStatus;

  // Check info
  lastCheckedAt: string | null;
  checkDurationMs: number | null;
  checkError?: string;

  // Trend
  previousHealthScore?: number;
  scoreTrend?: ScoreTrend;

  // Metadata
  metadata?: IndexHealthMetadata;

  createdAt: string;
  updatedAt: string;
}

/**
 * Additional metadata for index health
 */
export interface IndexHealthMetadata {
  embeddingModel?: string;
  dimension?: number;
  totalDocuments?: number;
  lastDocumentUpdate?: string;
  scanType?: HealingJobType;
}

// ============================================
// Healing Job Types
// ============================================

/**
 * Healing job definition
 */
export interface HealingJob {
  id: string;
  collectionId: string;
  userId: string;
  orgId?: string;

  // Configuration
  jobType: HealingJobType;
  targetIssues: IssueType[];
  priority: number;

  // Status
  status: JobStatus;
  progressPercent: number;

  // Metrics
  chunksScanned: number;
  chunksHealed: number;
  chunksFailed: number;
  chunksSkipped: number;

  // Results
  issuesFound: IssuesSummary;
  actionsTaken: ActionSummary[];
  errors: JobError[];

  // Timing
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  estimatedDurationMs?: number;
  actualDurationMs?: number;

  // Worker
  workerId?: string;
  retryCount: number;
  maxRetries: number;

  // Trigger
  triggeredBy: TriggerSource;
  triggerRuleId?: string;

  createdAt: string;
}

/**
 * Summary of issues found during scan
 */
export interface IssuesSummary {
  total: number;
  byType: Record<IssueType, number>;
  bySeverity: Record<IssueSeverity, number>;
}

/**
 * Summary of an action taken
 */
export interface ActionSummary {
  actionType: HealingActionType;
  issueType: IssueType;
  chunkCount: number;
  successCount: number;
  failureCount: number;
  durationMs: number;
}

/**
 * Job error details
 */
export interface JobError {
  timestamp: string;
  chunkId?: string;
  action?: HealingActionType;
  message: string;
  code?: string;
  retryable: boolean;
}

// ============================================
// Healing Rule Types
// ============================================

/**
 * Healing rule definition
 */
export interface HealingRule {
  id: string;
  userId: string;
  orgId?: string;
  collectionId?: string;

  // Configuration
  name: string;
  description?: string;
  triggerCondition: string;
  triggerOperator: TriggerOperator;
  conditions: RuleCondition[];

  // Action
  action: HealingActionType;
  actionParams?: RuleActionParams;

  // Notifications
  notifyEmail: boolean;
  notifyWebhook: boolean;
  webhookUrl?: string;

  // Schedule
  autoExecute: boolean;
  scheduleCron?: string;
  lastExecutedAt?: string;
  nextExecutionAt?: string;

  // Limits
  maxChunksPerRun: number;
  cooldownMinutes: number;
  requireApproval: boolean;

  // Status
  isActive: boolean;
  executionCount: number;
  lastError?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * Rule condition definition
 */
export interface RuleCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'matches';
  value: string | number | boolean;
}

/**
 * Action parameters for a rule
 */
export interface RuleActionParams {
  batchSize?: number;
  dryRun?: boolean;
  notifyOnComplete?: boolean;
  customMessage?: string;
  targetChunks?: string[];
}

// ============================================
// Healing Action Types
// ============================================

/**
 * Record of a healing action taken
 */
export interface HealingAction {
  id: string;
  jobId?: string;
  ruleId?: string;
  userId: string;
  collectionId: string;

  // Action details
  actionType: HealingActionType;
  chunkIds: string[];
  chunkCount: number;

  // Issue context
  issueType: IssueType;
  issueSeverity?: IssueSeverity;

  // Result
  status: ActionStatus;
  successCount: number;
  failureCount: number;
  details?: ActionDetails;
  errorMessage?: string;

  // Timing
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;

  // Rollback
  canRollback: boolean;
  rollbackData?: RollbackData;
  rolledBackAt?: string;

  createdAt: string;
}

/**
 * Detailed results of an action
 */
export interface ActionDetails {
  successfulChunks: string[];
  failedChunks: FailedChunk[];
  skippedChunks: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Information about a failed chunk
 */
export interface FailedChunk {
  chunkId: string;
  reason: string;
  code?: string;
}

/**
 * Data needed for rollback
 */
export interface RollbackData {
  originalState: Record<string, unknown>[];
  backupLocation?: string;
}

// ============================================
// Issue Queue Types
// ============================================

/**
 * Queued issue for resolution
 */
export interface QueuedIssue {
  id: string;
  collectionId: string;
  userId: string;

  // Issue details
  chunkId: string;
  documentId?: string;
  issueType: IssueType;
  issueSeverity: IssueSeverity;

  // Detection
  detectedAt: string;
  detectorType: DetectorType;

  // Resolution
  status: IssueQueueStatus;
  resolvedAt?: string;
  resolvedBy?: ResolutionMethod;
  resolutionJobId?: string;

  // Details
  details?: IssueDetails;

  createdAt: string;
}

/**
 * Detailed information about an issue
 */
export interface IssueDetails {
  sourceModifiedAt?: string;
  embeddingCreatedAt?: string;
  parentDocumentId?: string;
  expectedMetadata?: Record<string, unknown>;
  actualMetadata?: Record<string, unknown>;
  qualityScore?: number;
  errorMessage?: string;
}

// ============================================
// Configuration Types
// ============================================

/**
 * Self-healing configuration
 */
export interface HealingConfig {
  id: string;
  userId: string;
  orgId?: string;
  collectionId?: string;

  // Auto-healing
  autoHealingEnabled: boolean;
  autoScanEnabled: boolean;
  scanIntervalHours: number;

  // Thresholds
  staleThresholdDays: number;
  healthAlertThreshold: number;
  criticalAlertThreshold: number;

  // Limits
  maxConcurrentJobs: number;
  maxChunksPerScan: number;
  batchSize: number;

  // Notifications
  emailAlerts: boolean;
  webhookAlerts: boolean;
  webhookUrl?: string;

  // Rate limiting
  reembedRateLimit: number;
  deleteRequiresApproval: boolean;

  createdAt: string;
  updatedAt: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_HEALING_CONFIG: Omit<HealingConfig, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
  autoHealingEnabled: true,
  autoScanEnabled: true,
  scanIntervalHours: 24,
  staleThresholdDays: 30,
  healthAlertThreshold: 0.7,
  criticalAlertThreshold: 0.5,
  maxConcurrentJobs: 2,
  maxChunksPerScan: 10000,
  batchSize: 100,
  emailAlerts: false,
  webhookAlerts: false,
  reembedRateLimit: 100,
  deleteRequiresApproval: true,
};

// ============================================
// Scanner Types
// ============================================

/**
 * Scan options
 */
export interface ScanOptions {
  chunkIds?: string[];
  documentIds?: string[];
  issueTypes?: IssueType[];
  limit?: number;
  offset?: number;
  includeMetadata?: boolean;
  staleThresholdDays?: number;
}

/**
 * Scan result
 */
export interface ScanResult {
  healthScore: number;
  freshnessScore: number;
  consistencyScore: number;
  issues: IndexIssue[];
  recommendations: Recommendation[];
  metrics: ScanMetrics;
  duration: number;
}

/**
 * Individual issue detected during scan
 */
export interface IndexIssue {
  type: IssueType;
  chunkIds: string[];
  severity: IssueSeverity;
  details: string;
  suggestedAction: HealingActionType;
  metadata?: Record<string, unknown>;
}

/**
 * Recommendation for improving index health
 */
export interface Recommendation {
  action: HealingActionType;
  reason: string;
  impact: 'low' | 'medium' | 'high';
  estimatedChunks: number;
  autoApplicable: boolean;
  priority: number;
}

/**
 * Metrics collected during scan
 */
export interface ScanMetrics {
  totalChunks: number;
  scannedChunks: number;
  healthyChunks: number;
  issuesByType: Record<IssueType, number>;
  issuesBySeverity: Record<IssueSeverity, number>;
  oldestChunkAge: number;
  newestChunkAge: number;
  avgEmbeddingAge: number;
}

// ============================================
// Healer Types
// ============================================

/**
 * Healing options
 */
export interface HealingOptions {
  dryRun?: boolean;
  batchSize?: number;
  rateLimit?: number;
  notifyOnComplete?: boolean;
  stopOnError?: boolean;
  maxRetries?: number;
}

/**
 * Healing result
 */
export interface HealingResult {
  success: boolean;
  actionsExecuted: number;
  chunksHealed: number;
  chunksFailed: number;
  errors: HealingError[];
  duration: number;
  actions: ActionResult[];
}

/**
 * Result of a single action
 */
export interface ActionResult {
  actionType: HealingActionType;
  chunkIds: string[];
  success: boolean;
  successCount: number;
  failureCount: number;
  error?: string;
  duration: number;
}

/**
 * Healing error
 */
export interface HealingError {
  chunkId: string;
  actionType: HealingActionType;
  message: string;
  code?: string;
  retryable: boolean;
  timestamp: string;
}

/**
 * Reembed result
 */
export interface ReembedResult {
  success: boolean;
  reembeddedCount: number;
  failedCount: number;
  errors: ReembedError[];
  tokensUsed: number;
  duration: number;
}

/**
 * Reembed error
 */
export interface ReembedError {
  chunkId: string;
  message: string;
  code?: string;
}

// ============================================
// API Request/Response Types
// ============================================

/**
 * Get health request params
 */
export interface GetHealthParams {
  collectionId: string;
  forceRefresh?: boolean;
}

/**
 * Health response
 */
export interface HealthResponse {
  success: boolean;
  health: IndexHealth;
}

/**
 * Scan request
 */
export interface ScanRequest {
  collectionId: string;
  options?: ScanOptions;
}

/**
 * Scan response
 */
export interface ScanResponse {
  success: boolean;
  result: ScanResult;
}

/**
 * List jobs params
 */
export interface ListJobsParams {
  collectionId?: string;
  status?: JobStatus | JobStatus[];
  limit?: number;
  offset?: number;
}

/**
 * Jobs response
 */
export interface JobsResponse {
  success: boolean;
  jobs: HealingJob[];
  total: number;
}

/**
 * Create job request
 */
export interface CreateJobRequest {
  collectionId: string;
  jobType: HealingJobType;
  targetIssues?: IssueType[];
  priority?: number;
  scheduledAt?: string;
}

/**
 * Job response
 */
export interface JobResponse {
  success: boolean;
  job: HealingJob;
}

/**
 * List rules params
 */
export interface ListRulesParams {
  collectionId?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Rules response
 */
export interface RulesResponse {
  success: boolean;
  rules: HealingRule[];
  total: number;
}

/**
 * Create/update rule request
 */
export interface RuleRequest {
  name: string;
  collectionId?: string;
  description?: string;
  triggerCondition: string;
  conditions?: RuleCondition[];
  action: HealingActionType;
  actionParams?: RuleActionParams;
  autoExecute?: boolean;
  scheduleCron?: string;
  maxChunksPerRun?: number;
}

/**
 * Rule response
 */
export interface RuleResponse {
  success: boolean;
  rule: HealingRule;
}

// ============================================
// Dashboard Props
// ============================================

/**
 * Props for health dashboard
 */
export interface HealthDashboardProps {
  collectionId?: string;
  className?: string;
  refreshInterval?: number;
}

/**
 * Props for issue list
 */
export interface IssueListProps {
  issues: IndexIssue[];
  onResolve?: (issue: IndexIssue) => void;
  onIgnore?: (issue: IndexIssue) => void;
  loading?: boolean;
  compact?: boolean;
}

/**
 * Props for healing job card
 */
export interface HealingJobCardProps {
  job: HealingJob;
  onCancel?: (jobId: string) => void;
  onRetry?: (jobId: string) => void;
  onViewDetails?: (jobId: string) => void;
  compact?: boolean;
}

/**
 * Props for rule editor
 */
export interface RuleEditorProps {
  rule?: HealingRule;
  collectionId?: string;
  onSave: (rule: RuleRequest) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}
