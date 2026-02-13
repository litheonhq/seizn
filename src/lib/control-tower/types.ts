/**
 * Control Tower - Types
 *
 * Unified monitoring and management dashboard types
 * Epic D: Control Tower UI from Paid Features Blueprint
 */

// ============================================
// System Health Types
// ============================================

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export type ServiceName =
  | 'api'
  | 'database'
  | 'cache'
  | 'vector_store'
  | 'llm_gateway'
  | 'storage'
  | 'auth'
  | 'webhooks'
  | 'background_jobs';

export interface ServiceHealth {
  name: ServiceName;
  displayName: string;
  status: HealthStatus;
  latencyMs?: number;
  lastCheck: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface SystemHealth {
  overall: HealthStatus;
  services: ServiceHealth[];
  timestamp: string;
  uptimeSeconds: number;
  version: string;
}

// ============================================
// Metrics Types
// ============================================

export interface MetricValue {
  value: number;
  timestamp: string;
  labels?: Record<string, string>;
}

export interface MetricSeries {
  name: string;
  displayName: string;
  unit: string;
  values: MetricValue[];
  aggregation: 'sum' | 'avg' | 'max' | 'min' | 'count' | 'p50' | 'p95' | 'p99';
}

export interface DashboardMetrics {
  // Request metrics
  totalRequests: number;
  requestsPerSecond: number;
  errorRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;

  // Resource metrics
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  diskUsagePercent: number;
  activeConnections: number;

  // Business metrics
  activeUsers: number;
  totalMemories: number;
  totalQueries: number;
  llmTokensUsed: number;
  embeddingsGenerated: number;

  // Time range
  periodStart: string;
  periodEnd: string;
}

// ============================================
// Alert Types
// ============================================

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';
export type AlertStatus = 'firing' | 'resolved' | 'acknowledged' | 'silenced';

export interface Alert {
  id: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  status: AlertStatus;
  source: string; // ServiceName, 'system', 'rule_evaluation', 'manual', etc.
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  fingerprint: string;
}

export interface AlertRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  severity: AlertSeverity;
  condition: AlertCondition;
  notificationChannels: string[];
  silenceUntil?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertCondition {
  metric: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne';
  threshold: number;
  duration: string; // e.g., '5m', '1h'
  aggregation?: 'sum' | 'avg' | 'max' | 'min' | 'count';
}

export interface NotificationChannel {
  id: string;
  name: string;
  type: 'email' | 'slack' | 'webhook' | 'pagerduty' | 'telegram';
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
}

// ============================================
// Audit & Activity Types
// ============================================

export interface ActivityEvent {
  id: string;
  type: string;
  actor: {
    id: string;
    type: 'user' | 'system' | 'api_key';
    name?: string;
  };
  resource: {
    type: string;
    id?: string;
    name?: string;
  };
  action: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

// ============================================
// Resource Usage Types
// ============================================

export interface ResourceUsage {
  userId: string;
  organizationId?: string;
  period: 'hour' | 'day' | 'week' | 'month';
  periodStart: string;
  periodEnd: string;
  metrics: {
    apiCalls: number;
    llmTokens: number;
    embeddingCalls: number;
    storageBytes: number;
    memoriesCreated: number;
    queriesExecuted: number;
  };
}

export interface UsageQuota {
  metric: string;
  limit: number;
  used: number;
  resetAt?: string;
}

// ============================================
// Configuration Types
// ============================================

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description?: string;
  enabled: boolean;
  rolloutPercentage: number;
  targetUsers?: string[];
  targetOrganizations?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RateLimitConfig {
  id: string;
  name: string;
  endpoint?: string;
  method?: string;
  limit: number;
  windowSeconds: number;
  enabled: boolean;
  scope: 'global' | 'user' | 'organization' | 'api_key';
}

// ============================================
// Dashboard Configuration
// ============================================

export interface ControlTowerWidget {
  id: string;
  type:
    | 'system_health'
    | 'metrics_chart'
    | 'alert_list'
    | 'activity_feed'
    | 'resource_usage'
    | 'quota_status'
    | 'service_map';
  title: string;
  config: Record<string, unknown>;
  gridPosition: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ControlTowerDashboard {
  id: string;
  name: string;
  description?: string;
  widgets: ControlTowerWidget[];
  refreshIntervalSeconds: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// API Response Types
// ============================================

export interface ControlTowerOverview {
  health: SystemHealth;
  metrics: DashboardMetrics;
  activeAlerts: Alert[];
  recentActivity: ActivityEvent[];
  quotaStatus: UsageQuota[];
}

export interface FailingTraceSignal {
  id: string;
  endpoint: string;
  method: string;
  statusCode: number;
  latencyMs: number;
  occurredAt: string;
}

export interface SecurityPolicyEventSignal {
  id: string;
  action: string;
  resourceType: string;
  status: string;
  occurredAt: string;
  details?: Record<string, unknown>;
}

export interface SearchQualityRegressionSignal {
  id: string;
  metricKey: string;
  baselineValue: number;
  candidateValue: number;
  delta: number;
  severity: 'warning' | 'critical';
  acknowledged: boolean;
  occurredAt: string;
}

export interface ControlTowerSignals {
  failingTraces: FailingTraceSignal[];
  securityPolicyEvents: SecurityPolicyEventSignal[];
  searchQualityRegressions: SearchQualityRegressionSignal[];
  generatedAt: string;
}

export interface TimeRange {
  start: string;
  end: string;
  granularity: '1m' | '5m' | '15m' | '1h' | '6h' | '1d';
}
