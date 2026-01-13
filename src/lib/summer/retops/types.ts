/**
 * RetOps (Retrieval Operations) Dashboard Types
 *
 * Types for monitoring and analyzing retrieval operations performance.
 */

// ============================================
// Core Metric Types
// ============================================

/**
 * Time period for aggregating metrics
 */
export type TimePeriod = '1h' | '6h' | '24h' | '7d' | '30d';

/**
 * Granularity for time series data
 */
export type TimeGranularity = '1m' | '5m' | '15m' | '1h' | '1d';

/**
 * Alert severity levels
 */
export type AlertSeverity = 'info' | 'warning' | 'critical';

/**
 * Alert status
 */
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

// ============================================
// RetOps Metrics
// ============================================

/**
 * Core RetOps metrics snapshot
 */
export interface RetOpsMetrics {
  /** Timestamp of the metrics snapshot */
  timestamp: string;
  /** User or organization ID */
  userId: string;
  /** Collection ID (optional, for collection-specific metrics) */
  collectionId?: string;

  /** Queries per second (current) */
  qps: number;
  /** Total query count in period */
  totalQueries: number;

  /** Latency percentiles in milliseconds */
  latency: LatencyMetrics;

  /** Cache metrics */
  cache: CacheMetrics;

  /** Error metrics */
  errors: ErrorMetrics;

  /** Quality metrics */
  quality: QualityMetrics;
}

/**
 * Latency metrics with percentiles
 */
export interface LatencyMetrics {
  /** p50 (median) latency in ms */
  p50: number;
  /** p75 latency in ms */
  p75: number;
  /** p90 latency in ms */
  p90: number;
  /** p95 latency in ms */
  p95: number;
  /** p99 latency in ms */
  p99: number;
  /** Average latency in ms */
  avg: number;
  /** Maximum latency in ms */
  max: number;
}

/**
 * Cache performance metrics
 */
export interface CacheMetrics {
  /** Total cache hits */
  hits: number;
  /** Total cache misses */
  misses: number;
  /** Cache hit rate (0-1) */
  hitRate: number;
  /** Semantic cache hit rate (0-1) */
  semanticHitRate: number;
  /** Average time saved per cache hit in ms */
  avgTimeSavedMs: number;
}

/**
 * Error metrics
 */
export interface ErrorMetrics {
  /** Total error count */
  total: number;
  /** Error rate (0-1) */
  rate: number;
  /** Errors by type */
  byType: Record<string, number>;
  /** Recent error samples */
  recentSamples?: ErrorSample[];
}

/**
 * Single error sample
 */
export interface ErrorSample {
  /** Error timestamp */
  timestamp: string;
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Request trace ID */
  traceId?: string;
}

// ============================================
// Quality Metrics
// ============================================

/**
 * Search quality metrics
 */
export interface QualityMetrics {
  /** Mean Reciprocal Rank (0-1) */
  mrr: number;
  /** Normalized Discounted Cumulative Gain (0-1) */
  ndcg: number;
  /** Precision at K */
  precisionAtK: PrecisionAtK;
  /** Recall at K */
  recallAtK: RecallAtK;
  /** Groundedness score (0-1, for RAG responses) */
  groundedness?: number;
  /** Average rerank improvement (0-1) */
  rerankImprovement?: number;
}

/**
 * Precision at different K values
 */
export interface PrecisionAtK {
  p1: number;
  p3: number;
  p5: number;
  p10: number;
}

/**
 * Recall at different K values
 */
export interface RecallAtK {
  r1: number;
  r3: number;
  r5: number;
  r10: number;
}

// ============================================
// Retrieval Statistics
// ============================================

/**
 * Comprehensive retrieval statistics
 */
export interface RetrievalStats {
  /** Time period for these stats */
  period: TimePeriod;
  /** Start timestamp */
  startTime: string;
  /** End timestamp */
  endTime: string;

  /** Query volume stats */
  queryVolume: QueryVolumeStats;

  /** Search type breakdown */
  searchTypes: SearchTypeStats;

  /** Top queries */
  topQueries: TopQuery[];

  /** Collection breakdown */
  collectionBreakdown: CollectionStats[];

  /** Embedding model usage */
  embeddingUsage: EmbeddingUsageStats;

  /** Rerank usage */
  rerankUsage: RerankUsageStats;
}

/**
 * Query volume statistics
 */
export interface QueryVolumeStats {
  /** Total queries in period */
  total: number;
  /** Queries per second (average) */
  avgQps: number;
  /** Peak QPS */
  peakQps: number;
  /** Time series data */
  timeSeries: TimeSeriesPoint[];
}

/**
 * Time series data point
 */
export interface TimeSeriesPoint {
  /** Timestamp */
  timestamp: string;
  /** Value */
  value: number;
}

/**
 * Search type breakdown stats
 */
export interface SearchTypeStats {
  /** Vector search count */
  vector: number;
  /** Keyword search count */
  keyword: number;
  /** Hybrid search count */
  hybrid: number;
  /** Federated search count */
  federated: number;
}

/**
 * Top query information
 */
export interface TopQuery {
  /** Query text (truncated for privacy) */
  queryHash: string;
  /** Query preview (first N chars) */
  queryPreview?: string;
  /** Number of times executed */
  count: number;
  /** Average latency in ms */
  avgLatencyMs: number;
  /** Average result count */
  avgResultCount: number;
  /** Cache hit rate for this query */
  cacheHitRate: number;
  /** Last executed timestamp */
  lastExecuted: string;
}

/**
 * Per-collection statistics
 */
export interface CollectionStats {
  /** Collection ID */
  collectionId: string;
  /** Collection name */
  collectionName: string;
  /** Query count */
  queryCount: number;
  /** Average latency */
  avgLatencyMs: number;
  /** Document count */
  documentCount: number;
  /** Chunk count */
  chunkCount: number;
}

/**
 * Embedding model usage stats
 */
export interface EmbeddingUsageStats {
  /** Total embeddings generated */
  totalEmbeddings: number;
  /** Tokens used */
  tokensUsed: number;
  /** Model breakdown */
  byModel: Record<string, number>;
  /** Average embedding latency */
  avgLatencyMs: number;
}

/**
 * Rerank usage stats
 */
export interface RerankUsageStats {
  /** Total rerank calls */
  totalCalls: number;
  /** Documents reranked */
  documentsReranked: number;
  /** Average improvement score */
  avgImprovement: number;
  /** Provider breakdown */
  byProvider: Record<string, number>;
}

// ============================================
// Alerts
// ============================================

/**
 * RetOps alert definition
 */
export interface RetOpsAlert {
  /** Alert ID */
  id: string;
  /** Alert type */
  type: AlertType;
  /** Severity level */
  severity: AlertSeverity;
  /** Current status */
  status: AlertStatus;
  /** Alert title */
  title: string;
  /** Alert message */
  message: string;
  /** Metric that triggered the alert */
  metric: string;
  /** Threshold value */
  threshold: number;
  /** Current value */
  currentValue: number;
  /** Created timestamp */
  createdAt: string;
  /** Last updated timestamp */
  updatedAt: string;
  /** Acknowledged by (user ID) */
  acknowledgedBy?: string;
  /** Acknowledged at timestamp */
  acknowledgedAt?: string;
  /** Resolved at timestamp */
  resolvedAt?: string;
}

/**
 * Alert types
 */
export type AlertType =
  | 'high_latency'
  | 'error_rate_spike'
  | 'qps_spike'
  | 'cache_degradation'
  | 'quality_degradation'
  | 'embedding_failure'
  | 'rerank_failure'
  | 'quota_warning'
  | 'anomaly_detected';

/**
 * Alert threshold configuration
 */
export interface AlertThreshold {
  /** Metric name */
  metric: string;
  /** Warning threshold */
  warning: number;
  /** Critical threshold */
  critical: number;
  /** Comparison operator */
  operator: 'gt' | 'gte' | 'lt' | 'lte';
  /** Window size for evaluation */
  windowMinutes: number;
}

// ============================================
// Anomaly Detection
// ============================================

/**
 * Detected anomaly
 */
export interface Anomaly {
  /** Anomaly ID */
  id: string;
  /** Metric name */
  metric: string;
  /** Detection timestamp */
  detectedAt: string;
  /** Expected value */
  expectedValue: number;
  /** Actual value */
  actualValue: number;
  /** Deviation score (Z-score or similar) */
  deviationScore: number;
  /** Severity based on deviation */
  severity: AlertSeverity;
  /** Possible cause */
  possibleCause?: string;
  /** Recommended action */
  recommendedAction?: string;
}

/**
 * Anomaly detection configuration
 */
export interface AnomalyDetectionConfig {
  /** Enable anomaly detection */
  enabled: boolean;
  /** Metrics to monitor */
  metrics: string[];
  /** Sensitivity (1-10, higher = more sensitive) */
  sensitivity: number;
  /** Lookback window for baseline */
  baselineWindowHours: number;
  /** Minimum data points for detection */
  minDataPoints: number;
}

// ============================================
// Dashboard Configuration
// ============================================

/**
 * Dashboard widget configuration
 */
export interface DashboardWidget {
  /** Widget ID */
  id: string;
  /** Widget type */
  type: WidgetType;
  /** Widget title */
  title: string;
  /** Position in grid */
  position: { x: number; y: number };
  /** Size in grid units */
  size: { width: number; height: number };
  /** Widget-specific config */
  config?: Record<string, unknown>;
}

/**
 * Widget types available
 */
export type WidgetType =
  | 'metrics_overview'
  | 'query_volume_chart'
  | 'latency_distribution'
  | 'quality_trend'
  | 'top_queries'
  | 'alerts_panel'
  | 'cache_performance'
  | 'error_breakdown';

/**
 * Dashboard layout configuration
 */
export interface DashboardConfig {
  /** Dashboard ID */
  id: string;
  /** Dashboard name */
  name: string;
  /** Widgets */
  widgets: DashboardWidget[];
  /** Auto-refresh interval in seconds */
  refreshInterval: number;
  /** Default time period */
  defaultPeriod: TimePeriod;
}

// ============================================
// API Request/Response Types
// ============================================

/**
 * Metrics query parameters
 */
export interface MetricsQueryParams {
  /** Time period */
  period?: TimePeriod;
  /** Collection ID filter */
  collectionId?: string;
  /** Granularity for time series */
  granularity?: TimeGranularity;
  /** Include time series data */
  includeTimeSeries?: boolean;
}

/**
 * Metrics API response
 */
export interface MetricsResponse {
  success: boolean;
  metrics: RetOpsMetrics;
  timeSeries?: TimeSeriesData;
}

/**
 * Time series data for multiple metrics
 */
export interface TimeSeriesData {
  /** Timestamps */
  timestamps: string[];
  /** QPS values */
  qps: number[];
  /** Latency p50 values */
  latencyP50: number[];
  /** Latency p99 values */
  latencyP99: number[];
  /** Error rate values */
  errorRate: number[];
  /** Cache hit rate values */
  cacheHitRate: number[];
}

/**
 * Stats query parameters
 */
export interface StatsQueryParams {
  /** Time period */
  period?: TimePeriod;
  /** Collection ID filter */
  collectionId?: string;
  /** Include top queries */
  includeTopQueries?: boolean;
  /** Top queries limit */
  topQueriesLimit?: number;
}

/**
 * Stats API response
 */
export interface StatsResponse {
  success: boolean;
  stats: RetrievalStats;
}

/**
 * Quality metrics query parameters
 */
export interface QualityQueryParams {
  /** Time period */
  period?: TimePeriod;
  /** Collection ID filter */
  collectionId?: string;
  /** Include historical trend */
  includeTrend?: boolean;
}

/**
 * Quality metrics API response
 */
export interface QualityResponse {
  success: boolean;
  quality: QualityMetrics;
  trend?: QualityTrendPoint[];
}

/**
 * Quality trend data point
 */
export interface QualityTrendPoint {
  timestamp: string;
  mrr: number;
  ndcg: number;
  groundedness?: number;
}

/**
 * Alerts query parameters
 */
export interface AlertsQueryParams {
  /** Filter by status */
  status?: AlertStatus;
  /** Filter by severity */
  severity?: AlertSeverity;
  /** Limit results */
  limit?: number;
}

/**
 * Alerts API response
 */
export interface AlertsResponse {
  success: boolean;
  alerts: RetOpsAlert[];
  activeCount: number;
  acknowledgedCount: number;
}
