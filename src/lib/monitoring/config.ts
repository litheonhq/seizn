/**
 * SLO Configuration
 */

import type { SLOConfig, AlertConfig } from './types';

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
