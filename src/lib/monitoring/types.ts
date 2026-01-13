/**
 * SLO Monitoring Types
 */

export interface SLOTarget {
  name: string;
  target: number;
  unit: string;
  comparison: 'lt' | 'lte' | 'gt' | 'gte';
}

export interface SLOConfig {
  p95Latency: SLOTarget;
  errorRate5xx: SLOTarget;
  availability: SLOTarget;
}

export interface MetricDataPoint {
  value: number;
  timestamp: number;
}

export interface LatencyMetric {
  endpoint: string;
  method: string;
  duration: number;
  statusCode: number;
  timestamp: number;
}

export interface AggregatedMetrics {
  window: {
    start: number;
    end: number;
    durationMs: number;
  };
  latency: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
    count: number;
  };
  errors: {
    total: number;
    rate5xx: number;
    count5xx: number;
    count4xx: number;
  };
  availability: {
    percentage: number;
    totalRequests: number;
    successfulRequests: number;
  };
}

export interface SLOStatus {
  metric: string;
  target: number;
  current: number;
  unit: string;
  status: 'healthy' | 'warning' | 'critical';
  breached: boolean;
  comparison: 'lt' | 'lte' | 'gt' | 'gte';
}

export interface SLOReport {
  timestamp: string;
  window: {
    start: string;
    end: string;
    durationMs: number;
  };
  metrics: AggregatedMetrics;
  slos: {
    p95Latency: SLOStatus;
    errorRate5xx: SLOStatus;
    availability: SLOStatus;
  };
  overallHealth: 'healthy' | 'degraded' | 'critical';
  alerts: AlertEvent[];
}

export interface AlertEvent {
  id: string;
  type: 'slo_breach' | 'threshold_warning';
  metric: string;
  message: string;
  severity: 'warning' | 'critical';
  timestamp: string;
  value: number;
  threshold: number;
}

export interface AlertConfig {
  enabled: boolean;
  warningThresholdPercent: number; // e.g., 80% of target
  cooldownMs: number; // Minimum time between alerts
}

/**
 * Operation-specific latency target
 */
export interface OperationLatencyTarget {
  p95: number; // milliseconds
  p99: number; // milliseconds
  name: string;
}

/**
 * Operation-specific SLO configuration
 */
export interface OperationSLOConfig {
  memory: {
    create: OperationLatencyTarget;
    read: OperationLatencyTarget;
    update: OperationLatencyTarget;
    delete: OperationLatencyTarget;
    list: OperationLatencyTarget;
  };
  query: {
    simple: OperationLatencyTarget;
    semantic: OperationLatencyTarget;
    hybrid: OperationLatencyTarget;
  };
  embedding: {
    single: OperationLatencyTarget;
    batch: OperationLatencyTarget;
  };
  rerank: {
    small: OperationLatencyTarget;
    medium: OperationLatencyTarget;
    large: OperationLatencyTarget;
  };
  api: {
    health: OperationLatencyTarget;
    auth: OperationLatencyTarget;
    general: OperationLatencyTarget;
  };
}

/**
 * Extended latency metric with operation type
 */
export interface ExtendedLatencyMetric extends LatencyMetric {
  operationType?: string;
  operationCategory?: 'memory' | 'query' | 'embedding' | 'rerank' | 'api';
}

/**
 * SLO evaluation result for operations
 */
export interface OperationSLOStatus {
  category: string;
  operation: string;
  name: string;
  p95Target: number;
  p99Target: number;
  currentP95: number;
  currentP99: number;
  count: number;
  p95Breached: boolean;
  p99Breached: boolean;
  status: 'healthy' | 'warning' | 'critical';
}

/**
 * Complete SLO dashboard data
 */
export interface SLODashboard {
  timestamp: string;
  overallHealth: 'healthy' | 'degraded' | 'critical';
  globalSLOs: {
    p95Latency: SLOStatus;
    errorRate5xx: SLOStatus;
    availability: SLOStatus;
  };
  operationSLOs: OperationSLOStatus[];
  recentAlerts: AlertEvent[];
  metrics: AggregatedMetrics;
}
