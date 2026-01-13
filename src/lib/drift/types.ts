/**
 * Embedding Drift Radar Types
 *
 * Types for detecting and analyzing embedding distribution drift
 * to proactively prevent search quality degradation.
 */

// ============================================
// Core Types
// ============================================

/**
 * Drift alert types
 */
export type DriftAlertType =
  | 'centroid_shift'     // Query/doc centroid moved significantly
  | 'entropy_change'     // Distribution diversity changed
  | 'score_drop'         // Search relevance scores decreased
  | 'score_variance'     // Score consistency changed
  | 'rerank_drift'       // Reranker behavior changed
  | 'query_drift'        // Query pattern changed
  | 'doc_drift'          // Document distribution changed
  | 'embedding_anomaly'; // Unusual embedding patterns

/**
 * Alert severity levels
 */
export type DriftSeverity = 'info' | 'warning' | 'critical';

/**
 * Alert status
 */
export type DriftAlertStatus = 'active' | 'acknowledged' | 'resolved' | 'ignored';

// ============================================
// Drift Snapshot
// ============================================

/**
 * Daily snapshot of embedding distribution metrics
 */
export interface DriftSnapshot {
  id: string;
  userId: string;
  orgId?: string;
  collectionId: string;
  snapshotDate: string; // YYYY-MM-DD

  // Query distribution metrics
  queryCentroid?: number[]; // Vector representation
  queryCount: number;
  queryEntropy?: number;
  queryStdDev?: number;

  // Document distribution metrics
  docCentroid?: number[];
  docCount: number;
  docEntropy?: number;
  docStdDev?: number;

  // Score distribution metrics
  avgTop1Score?: number;
  avgTopKScore?: number;
  scoreStdDev?: number;
  minScore?: number;
  maxScore?: number;

  // Rerank distribution metrics
  rerankBoostAvg?: number;
  rerankBoostStdDev?: number;
  rerankPositionChangeAvg?: number;

  // Computed drift metrics (vs previous snapshot)
  centroidShiftMagnitude?: number;
  entropyChangePct?: number;
  scoreChangePct?: number;

  // Raw metadata
  metadata?: DriftSnapshotMetadata;

  createdAt: string;
  updatedAt: string;
}

/**
 * Additional metadata stored with snapshot
 */
export interface DriftSnapshotMetadata {
  querySampleIds?: string[];
  scoreHistogram?: HistogramBucket[];
  embeddingModel?: string;
  dimension?: number;
  collectionName?: string;
}

/**
 * Histogram bucket for score distribution
 */
export interface HistogramBucket {
  bucket: number;
  count: number;
  label?: string;
}

// ============================================
// Drift Alert
// ============================================

/**
 * Drift detection alert
 */
export interface DriftAlert {
  id: string;
  userId: string;
  orgId?: string;
  collectionId: string;

  alertType: DriftAlertType;
  severity: DriftSeverity;
  status: DriftAlertStatus;

  title: string;
  message: string;

  // Detected values
  currentValue?: number;
  previousValue?: number;
  threshold?: number;
  deviationPct?: number;

  // Recommendations
  recommendations: DriftRecommendation[];

  // Related snapshots
  snapshotId?: string;
  comparisonSnapshotId?: string;

  // Status tracking
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  resolutionNotes?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * Recommended action for drift resolution
 */
export interface DriftRecommendation {
  action: DriftActionType;
  description: string;
  impact: 'low' | 'medium' | 'high';
  autoApplicable: boolean;
}

/**
 * Types of corrective actions
 */
export type DriftActionType =
  | 'reindex'
  | 'adjust_topk'
  | 'adjust_chunk_size'
  | 'enable_rerank'
  | 'review_queries'
  | 'review_new_docs'
  | 'review_diversity'
  | 'monitor'
  | 'model_update'
  | 'retrain_reranker';

// ============================================
// Drift Thresholds
// ============================================

/**
 * Configurable thresholds for drift detection
 */
export interface DriftThresholds {
  id?: string;
  userId: string;
  collectionId?: string;

  // Centroid shift thresholds (0-1 scale)
  centroidShiftWarning: number;  // Default: 0.05 (5%)
  centroidShiftCritical: number; // Default: 0.10 (10%)

  // Entropy change thresholds (percentage)
  entropyChangeWarning: number;  // Default: 15%
  entropyChangeCritical: number; // Default: 25%

  // Score drop thresholds (percentage)
  scoreDropWarning: number;      // Default: 10%
  scoreDropCritical: number;     // Default: 20%

  // Alert settings
  alertsEnabled: boolean;
  emailNotifications: boolean;
  webhookUrl?: string;

  // Comparison settings
  comparisonWindowDays: number;  // Default: 7
  minQueriesForAlert: number;    // Default: 100
}

/**
 * Default thresholds
 */
export const DEFAULT_DRIFT_THRESHOLDS: Omit<DriftThresholds, 'userId'> = {
  centroidShiftWarning: 0.05,
  centroidShiftCritical: 0.10,
  entropyChangeWarning: 15.0,
  entropyChangeCritical: 25.0,
  scoreDropWarning: 10.0,
  scoreDropCritical: 20.0,
  alertsEnabled: true,
  emailNotifications: false,
  comparisonWindowDays: 7,
  minQueriesForAlert: 100,
};

// ============================================
// Analysis Results
// ============================================

/**
 * Result of drift analysis
 */
export interface DriftAnalysisResult {
  snapshot: DriftSnapshot;
  previousSnapshot?: DriftSnapshot;
  alerts: DriftAlert[];
  summary: DriftSummary;
}

/**
 * Summary of drift analysis
 */
export interface DriftSummary {
  collectionId: string;
  collectionName?: string;
  analysisDate: string;

  // Overall health score (0-100)
  healthScore: number;
  healthStatus: 'healthy' | 'warning' | 'degraded' | 'critical';

  // Key metrics
  queryCount: number;
  docCount: number;
  avgScore: number;

  // Drift indicators
  centroidShift: number;
  entropyChange: number;
  scoreChange: number;

  // Trend (vs 7 days ago)
  trend: 'improving' | 'stable' | 'degrading';

  // Active alerts count
  activeAlerts: number;
}

// ============================================
// Time Series Data
// ============================================

/**
 * Time series data point for drift metrics
 */
export interface DriftTimeSeriesPoint {
  date: string;
  centroidShift?: number;
  avgScore?: number;
  queryEntropy?: number;
  queryCount: number;
  docCount: number;
}

/**
 * Time series data for drift visualization
 */
export interface DriftTimeSeries {
  collectionId: string;
  startDate: string;
  endDate: string;
  points: DriftTimeSeriesPoint[];
}

// ============================================
// API Request/Response Types
// ============================================

/**
 * Parameters for snapshot queries
 */
export interface DriftSnapshotQueryParams {
  collectionId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * Parameters for alert queries
 */
export interface DriftAlertQueryParams {
  collectionId?: string;
  status?: DriftAlertStatus;
  severity?: DriftSeverity;
  alertType?: DriftAlertType;
  limit?: number;
  offset?: number;
}

/**
 * Request to trigger manual analysis
 */
export interface AnalyzeRequest {
  collectionId: string;
  forceRecalculate?: boolean;
}

/**
 * Response for snapshot list
 */
export interface SnapshotsResponse {
  success: boolean;
  snapshots: DriftSnapshot[];
  total: number;
}

/**
 * Response for alert list
 */
export interface AlertsResponse {
  success: boolean;
  alerts: DriftAlert[];
  total: number;
  activeCount: number;
}

/**
 * Response for analysis
 */
export interface AnalysisResponse {
  success: boolean;
  result: DriftAnalysisResult;
}

/**
 * Response for acknowledge alert
 */
export interface AcknowledgeResponse {
  success: boolean;
  alert: DriftAlert;
}

// ============================================
// Collector Input Types
// ============================================

/**
 * Raw data input for snapshot collection
 */
export interface SnapshotCollectorInput {
  collectionId: string;
  userId: string;
  orgId?: string;

  // Query data from traces
  queryEmbeddings: number[][];
  queryCount: number;

  // Document data
  docEmbeddings?: number[][];
  docCount: number;

  // Score data from search results
  scores: number[];

  // Rerank data
  rerankBoosts?: number[];
  rerankPositionChanges?: number[];

  // Metadata
  embeddingModel?: string;
  dimension?: number;
}

// ============================================
// Dashboard Props
// ============================================

/**
 * Props for drift dashboard component
 */
export interface DriftDashboardProps {
  collectionId?: string;
  className?: string;
  refreshInterval?: number;
}

/**
 * Props for drift chart component
 */
export interface DriftChartProps {
  timeSeries: DriftTimeSeries;
  height?: number;
  loading?: boolean;
}

/**
 * Props for drift alert card component
 */
export interface DriftAlertCardProps {
  alert: DriftAlert;
  onAcknowledge?: (alertId: string) => void;
  onResolve?: (alertId: string, notes?: string) => void;
  compact?: boolean;
}
