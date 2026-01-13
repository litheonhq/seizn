/**
 * SLO Configuration
 *
 * Service Level Objectives for Seizn Platform
 *
 * Key Metrics:
 * - P95 Latency: < 500ms (memory operations)
 * - 5xx Error Rate: < 0.1%
 * - API Availability: >= 99.9%
 */

import type { SLOConfig, AlertConfig, OperationSLOConfig } from './types';

/**
 * SLO Targets
 * - p95 latency: < 500ms
 * - 5xx error rate: < 0.1%
 * - API availability: 99.9%
 */
export const SLO_TARGETS: SLOConfig = {
  p95Latency: {
    name: 'P95 Latency',
    target: 500, // milliseconds
    unit: 'ms',
    comparison: 'lt',
  },
  errorRate5xx: {
    name: '5xx Error Rate',
    target: 0.1, // percentage
    unit: '%',
    comparison: 'lt',
  },
  availability: {
    name: 'API Availability',
    target: 99.9, // percentage
    unit: '%',
    comparison: 'gte',
  },
};

/**
 * Operation-specific SLO Targets
 * Different operations have different latency requirements
 */
export const OPERATION_SLO_TARGETS: OperationSLOConfig = {
  // Memory operations (CRUD)
  memory: {
    create: { p95: 500, p99: 1000, name: 'Memory Create' },
    read: { p95: 200, p99: 500, name: 'Memory Read' },
    update: { p95: 500, p99: 1000, name: 'Memory Update' },
    delete: { p95: 300, p99: 600, name: 'Memory Delete' },
    list: { p95: 300, p99: 800, name: 'Memory List' },
  },
  // Query operations (vector search)
  query: {
    simple: { p95: 500, p99: 1000, name: 'Simple Query' },
    semantic: { p95: 800, p99: 1500, name: 'Semantic Query' },
    hybrid: { p95: 1000, p99: 2000, name: 'Hybrid Query' },
  },
  // Embedding operations
  embedding: {
    single: { p95: 300, p99: 600, name: 'Single Embedding' },
    batch: { p95: 1000, p99: 2000, name: 'Batch Embedding' },
  },
  // Reranking operations
  rerank: {
    small: { p95: 200, p99: 500, name: 'Small Rerank (<10 docs)' },
    medium: { p95: 500, p99: 1000, name: 'Medium Rerank (10-50 docs)' },
    large: { p95: 1000, p99: 2000, name: 'Large Rerank (>50 docs)' },
  },
  // API general operations
  api: {
    health: { p95: 50, p99: 100, name: 'Health Check' },
    auth: { p95: 300, p99: 600, name: 'Authentication' },
    general: { p95: 500, p99: 1000, name: 'General API' },
  },
};

/**
 * Alert Configuration
 */
export const ALERT_CONFIG: AlertConfig = {
  enabled: true,
  warningThresholdPercent: 80, // Alert at 80% of threshold
  cooldownMs: 5 * 60 * 1000, // 5 minutes between alerts
};

/**
 * Metrics Collection Configuration
 */
export const METRICS_CONFIG = {
  // Time window for aggregation (5 minutes)
  aggregationWindowMs: 5 * 60 * 1000,

  // Maximum number of data points to keep in memory
  maxDataPoints: 10000,

  // Cleanup interval (every minute)
  cleanupIntervalMs: 60 * 1000,

  // Data retention period (1 hour)
  retentionMs: 60 * 60 * 1000,

  // Paths to exclude from monitoring
  excludedPaths: [
    '/api/health',
    '/api/monitoring/slo',
    '/_next',
    '/favicon.ico',
  ],

  // Methods to monitor
  monitoredMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
};

/**
 * Telegram Alert Configuration
 */
export const TELEGRAM_CONFIG = {
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  chatId: process.env.TELEGRAM_CHAT_ID,
};

/**
 * Sentry Alert Configuration
 */
export const SENTRY_CONFIG = {
  enabled: process.env.NODE_ENV === 'production',
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Sentry metric names
  metricNames: {
    p95Latency: 'seizn.slo.p95_latency_ms',
    errorRate5xx: 'seizn.slo.error_rate_5xx_percent',
    availability: 'seizn.slo.availability_percent',
    memoryOpLatency: 'seizn.memory.operation_latency_ms',
    queryLatency: 'seizn.query.latency_ms',
    requestCount: 'seizn.requests.total',
  },

  // Sample rates
  tracesSampleRate: 1.0,
  profilesSampleRate: 0.1,
};

/**
 * Redis Metrics Configuration
 */
export const REDIS_METRICS_CONFIG = {
  enabled: true,
  keyPrefix: 'seizn:metrics:',
  ttlSeconds: 3600, // 1 hour
  maxDataPoints: 10000,
};
