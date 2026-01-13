/**
 * SLO Monitoring Module
 *
 * Provides SLO (Service Level Objective) monitoring for the Seizn API.
 *
 * Features:
 * - Automatic metrics collection (p95 latency, 5xx error rate, availability)
 * - Configurable SLO targets
 * - Telegram alerts for SLO breaches
 * - Dashboard API endpoint
 *
 * SLO Targets:
 * - P95 Latency: < 500ms
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
 * Environment Variables:
 * - TELEGRAM_BOT_TOKEN: Telegram bot token for alerts
 * - TELEGRAM_CHAT_ID: Telegram chat ID for alerts
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
} from './types';

// Configuration
export { SLO_TARGETS, ALERT_CONFIG, METRICS_CONFIG, TELEGRAM_CONFIG } from './config';

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
