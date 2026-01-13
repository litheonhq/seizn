/**
 * SLO Monitoring Module
 *
 * Provides SLO (Service Level Objective) monitoring for the Seizn API.
 *
 * Features:
 * - Automatic metrics collection (p95 latency, 5xx error rate, availability)
 * - Configurable SLO targets (global and operation-specific)
 * - Telegram alerts for SLO breaches
 * - Sentry integration for metrics and alerts
 * - Optional Redis persistence for metrics
 * - Dashboard API endpoint
 *
 * SLO Targets:
 * - P95 Latency: < 500ms (memory operations)
 * - 5xx Error Rate: < 0.1%
 * - API Availability: >= 99.9%
 *
 * Usage:
 *
 * 1. Wrap API handlers for automatic collection:
 * ```ts
 * import { withMetrics } from '@/lib/monitoring';
 *
 * export const GET = withMetrics(async (request) => {
 *   // Your handler logic
 *   return NextResponse.json({ data });
 * });
 * ```
 *
 * 2. Manual metric recording:
 * ```ts
 * import { recordApiMetric, createTimer } from '@/lib/monitoring';
 *
 * const timer = createTimer();
 * // ... do work ...
 * timer.record('/api/endpoint', 'POST', 200);
 * ```
 *
 * 3. Get SLO status:
 * ```ts
 * import { getSLOStatus, generateSLOReport } from '@/lib/monitoring';
 *
 * const status = getSLOStatus();
 * const report = await generateSLOReport();
 * ```
 *
 * 4. Sentry integration:
 * ```ts
 * import { withSentryMonitoring, recordLatencyMetric } from '@/lib/monitoring';
 *
 * // Wrap operation with Sentry monitoring
 * const result = await withSentryMonitoring('memory', '/api/memories', async () => {
 *   return await createMemory(data);
 * });
 *
 * // Manual latency recording
 * recordLatencyMetric('memory', 150, '/api/memories');
 * ```
 *
 * Environment Variables:
 * - TELEGRAM_BOT_TOKEN: Telegram bot token for alerts
 * - TELEGRAM_CHAT_ID: Telegram chat ID for alerts
 * - SENTRY_DSN: Sentry DSN for error tracking
 * - UPSTASH_REDIS_REST_URL: Redis URL for metrics persistence
 * - UPSTASH_REDIS_REST_TOKEN: Redis token
 */

// Types
export type {
  SLOTarget,
  SLOConfig,
  MetricDataPoint,
  LatencyMetric,
  AggregatedMetrics,
  SLOStatus,
  SLOReport,
  AlertEvent,
  AlertConfig,
  OperationLatencyTarget,
  OperationSLOConfig,
  ExtendedLatencyMetric,
  OperationSLOStatus,
  SLODashboard,
} from './types';

// Configuration
export {
  SLO_TARGETS,
  OPERATION_SLO_TARGETS,
  ALERT_CONFIG,
  METRICS_CONFIG,
  TELEGRAM_CONFIG,
  SENTRY_CONFIG,
  REDIS_METRICS_CONFIG,
} from './config';

// Metrics collection
export { metricsCollector, recordMetric } from './collector';

// SLO evaluation
export { generateSLOReport, getSLOStatus, getSLOTargets } from './slo';

// Alerts
export { alertManager, sendSLOBreachAlert } from './alerts';

// API wrapper
export {
  withMetrics,
  monitoredGET,
  monitoredPOST,
  monitoredPUT,
  monitoredPATCH,
  monitoredDELETE,
  createMonitoredHandlers,
  recordApiMetric,
  createTimer,
} from './wrapper';

// Sentry integration
export {
  SENTRY_ALERT_THRESHOLDS,
  SLO_METRIC_NAMES,
  recordSLOMetric,
  recordLatencyMetric,
  recordSLOError,
  reportSLOStatus,
  sendSentryAlert,
  createSLOTransaction,
  withSentryMonitoring,
  SENTRY_ALERT_RULES_CONFIG,
} from './sentry-alerts';

// Redis persistence
export {
  RedisMetricsStore,
  redisMetricsStore,
  recordMetricWithPersistence,
  syncMetricsToRedis,
} from './redis-metrics';
