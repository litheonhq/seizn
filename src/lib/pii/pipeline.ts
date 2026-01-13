/**
 * PII Pipeline Integration
 *
 * Provides a high-level interface for processing content through
 * the PII scanner before writing to the database.
 */

import { scanForPII, maskPII, type PIIMatch, type PIIType, type PIIScanResult } from './scanner';
import {
  getPIIConfig,
  getEffectivePolicy,
  shouldScanNamespace,
  type PIIAction,
} from './config';
import * as Sentry from '@sentry/nextjs';
import { getRedis } from '@/lib/redis';

// =============================================================================
// Redis Key Constants for PII Metrics
// =============================================================================

const PII_REDIS_KEYS = {
  /** Daily detection count by type: seizn:pii:daily:{date}:{type} */
  DAILY_COUNT: 'seizn:pii:daily',
  /** Daily action count: seizn:pii:actions:{date}:{action} */
  ACTION_COUNT: 'seizn:pii:actions',
  /** Namespace statistics: seizn:pii:namespace:{date}:{namespace} */
  NAMESPACE_STATS: 'seizn:pii:namespace',
};

// TTL for PII metrics: 30 days
const PII_METRICS_TTL = 60 * 60 * 24 * 30;

// =============================================================================
// Types
// =============================================================================

export interface PIIProcessResult {
  /** Whether the content is allowed to be written */
  allowed: boolean;

  /** The content to write (may be masked) */
  content: string;

  /** Original content (if different from output) */
  originalContent?: string;

  /** Whether the content was modified (masked) */
  wasModified: boolean;

  /** Detailed scan results */
  scanResult: PIIScanResult;

  /** Any warnings to log */
  warnings: PIIWarning[];

  /** Error message if blocked */
  error?: PIIBlockError;
}

export interface PIIWarning {
  type: PIIType;
  message: string;
  confidence: number;
}

export interface PIIBlockError {
  code: 'PII_BLOCKED';
  message: string;
  blockedTypes: PIIType[];
  maskedPreview?: string;
}

// =============================================================================
// Main Processing Function
// =============================================================================

/**
 * Process content through PII scanner before writing
 *
 * This is the main entry point for the Write Pipeline integration.
 * It scans content, applies policies, and returns processed content
 * with appropriate action taken (block, mask, or allow).
 *
 * @param content - The content to process
 * @param namespace - The namespace (affects policy)
 * @returns Processing result with allowed status and processed content
 */
export function processPIIForWrite(
  content: string,
  namespace: string = 'default'
): PIIProcessResult {
  const config = getPIIConfig();

  // Check if scanning should be performed for this namespace
  if (!shouldScanNamespace(namespace, config)) {
    return {
      allowed: true,
      content,
      wasModified: false,
      scanResult: {
        hasPII: false,
        detectedTypes: [],
        confidence: 0,
        details: [],
      },
      warnings: [],
    };
  }

  // Scan the content
  const scanResult = scanForPII(content, {
    confidenceThreshold: config.globalConfidenceThreshold,
  });

  // If no PII detected, allow as-is
  if (!scanResult.hasPII) {
    return {
      allowed: true,
      content,
      wasModified: false,
      scanResult,
      warnings: [],
    };
  }

  // Categorize matches by action
  const categorized = categorizePIIMatches(scanResult.details, namespace, config);

  // If there are blocked types, reject the write
  if (categorized.block.length > 0) {
    const blockedTypes = Array.from(new Set(categorized.block.map(m => m.type)));
    const blockMessages = blockedTypes.map(type => {
      const policy = getEffectivePolicy(type, namespace, config);
      return policy.blockMessage || `${type} is not allowed`;
    });

    // Generate masked preview if configured
    let maskedPreview: string | undefined;
    if (config.includeMaskedInError) {
      maskedPreview = maskPII(content, scanResult.details);
    }

    return {
      allowed: false,
      content,
      wasModified: false,
      scanResult,
      warnings: generateWarnings(categorized.warn),
      error: {
        code: 'PII_BLOCKED',
        message: blockMessages.join('; '),
        blockedTypes,
        maskedPreview,
      },
    };
  }

  // Apply masking if needed
  let processedContent = content;
  let wasModified = false;

  if (categorized.mask.length > 0) {
    processedContent = maskPII(content, categorized.mask);
    wasModified = true;
    scanResult.maskedContent = processedContent;
  }

  // Generate warnings
  const warnings = generateWarnings(categorized.warn);

  // Log detections if configured
  if (config.logDetections && scanResult.details.length > 0) {
    logPIIDetection(scanResult, namespace, categorized);
  }

  return {
    allowed: true,
    content: processedContent,
    originalContent: wasModified ? content : undefined,
    wasModified,
    scanResult,
    warnings,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

interface CategorizedMatches {
  block: PIIMatch[];
  mask: PIIMatch[];
  warn: PIIMatch[];
  allow: PIIMatch[];
}

/**
 * Categorize PII matches by their policy action
 */
function categorizePIIMatches(
  matches: PIIMatch[],
  namespace: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any
): CategorizedMatches {
  const result: CategorizedMatches = {
    block: [],
    mask: [],
    warn: [],
    allow: [],
  };

  for (const match of matches) {
    const policy = getEffectivePolicy(match.type, namespace, config);
    const threshold = policy.confidenceThreshold ?? config.globalConfidenceThreshold;

    // Only apply policy if match confidence meets threshold
    if (match.confidence >= threshold) {
      const action = policy.action as PIIAction;
      result[action].push(match);
    } else {
      // Below threshold, treat as allowed
      result.allow.push(match);
    }
  }

  return result;
}

/**
 * Generate warning messages for warn-action matches
 */
function generateWarnings(matches: PIIMatch[]): PIIWarning[] {
  return matches.map(match => ({
    type: match.type,
    message: `Detected potential ${match.type} in content`,
    confidence: match.confidence,
  }));
}

/**
 * Log PII detection to monitoring services
 *
 * Records PII detection events to:
 * - Console (development only)
 * - Sentry (custom event with tags)
 * - Redis (daily counters for analytics)
 *
 * IMPORTANT: Never logs actual PII values - only types, counts, and confidence scores
 */
function logPIIDetection(
  scanResult: PIIScanResult,
  namespace: string,
  categorized: CategorizedMatches
): void {
  const summary = {
    timestamp: new Date().toISOString(),
    namespace,
    detectedTypes: scanResult.detectedTypes,
    counts: {
      blocked: categorized.block.length,
      masked: categorized.mask.length,
      warned: categorized.warn.length,
      allowed: categorized.allow.length,
    },
    highestConfidence: scanResult.confidence,
  };

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[PII Detection]', JSON.stringify(summary));
  }

  // Production logging: Sentry custom event
  if (process.env.NODE_ENV === 'production') {
    recordPIIToSentry(summary);
  }

  // Production logging: Redis metrics (fire-and-forget)
  recordPIIToRedis(summary).catch((error) => {
    console.warn('[PII Metrics] Failed to record to Redis:', error);
  });
}

/**
 * Record PII detection to Sentry as a custom event
 * Only records metadata - never actual PII values
 */
function recordPIIToSentry(summary: {
  timestamp: string;
  namespace: string;
  detectedTypes: PIIType[];
  counts: {
    blocked: number;
    masked: number;
    warned: number;
    allowed: number;
  };
  highestConfidence: number;
}): void {
  try {
    Sentry.withScope((scope) => {
      // Set tags for filtering and grouping
      scope.setTag('pii.namespace', summary.namespace);
      scope.setTag('pii.has_blocked', (summary.counts.blocked > 0).toString());
      scope.setTag('pii.has_masked', (summary.counts.masked > 0).toString());

      // Set context with detailed information (no actual PII values)
      scope.setContext('pii_detection', {
        detectedTypes: summary.detectedTypes,
        counts: summary.counts,
        highestConfidence: summary.highestConfidence,
        totalDetections:
          summary.counts.blocked +
          summary.counts.masked +
          summary.counts.warned +
          summary.counts.allowed,
      });

      // Set level based on whether any PII was blocked
      const level = summary.counts.blocked > 0 ? 'warning' : 'info';
      scope.setLevel(level);

      // Capture as a custom event (not an error)
      Sentry.captureMessage(
        `PII Detection: ${summary.detectedTypes.join(', ')} in namespace "${summary.namespace}"`,
        level
      );
    });

    // Also record as metric if available
    if (typeof Sentry.metrics?.gauge === 'function') {
      // Record detection event count (gauge used as Sentry metrics API)
      Sentry.metrics.gauge('seizn.pii.detections', 1, {
        unit: 'none',
      });

      // Record per-type detection
      for (const type of summary.detectedTypes) {
        Sentry.metrics.gauge(`seizn.pii.type.${type}`, 1, {
          unit: 'none',
        });
      }
    }
  } catch (error) {
    console.warn('[PII Sentry] Failed to record event:', error);
  }
}

/**
 * Record PII detection metrics to Redis
 * Stores daily counters for analytics dashboard
 */
async function recordPIIToRedis(summary: {
  timestamp: string;
  namespace: string;
  detectedTypes: PIIType[];
  counts: {
    blocked: number;
    masked: number;
    warned: number;
    allowed: number;
  };
  highestConfidence: number;
}): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  try {
    // Use pipeline for atomic operations
    const pipeline = redis.pipeline();

    // Increment daily detection count per type
    for (const type of summary.detectedTypes) {
      const typeKey = `${PII_REDIS_KEYS.DAILY_COUNT}:${today}:${type}`;
      pipeline.incr(typeKey);
      pipeline.expire(typeKey, PII_METRICS_TTL);
    }

    // Increment action counts
    const actions = ['blocked', 'masked', 'warned', 'allowed'] as const;
    for (const action of actions) {
      if (summary.counts[action] > 0) {
        const actionKey = `${PII_REDIS_KEYS.ACTION_COUNT}:${today}:${action}`;
        pipeline.incrby(actionKey, summary.counts[action]);
        pipeline.expire(actionKey, PII_METRICS_TTL);
      }
    }

    // Increment namespace detection count
    const namespaceKey = `${PII_REDIS_KEYS.NAMESPACE_STATS}:${today}:${summary.namespace}`;
    pipeline.incr(namespaceKey);
    pipeline.expire(namespaceKey, PII_METRICS_TTL);

    // Execute all commands
    await pipeline.exec();
  } catch (error) {
    // Log but don't throw - metrics should not break the main flow
    console.warn('[PII Redis] Failed to record metrics:', error);
  }
}

// =============================================================================
// Utility Functions for API Routes
// =============================================================================

/**
 * Create an error response for blocked PII
 */
export function createPIIBlockedResponse(error: PIIBlockError): {
  success: false;
  error: {
    code: string;
    message: string;
    blockedTypes: PIIType[];
    maskedPreview?: string;
  };
} {
  return {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      blockedTypes: error.blockedTypes,
      maskedPreview: error.maskedPreview,
    },
  };
}

/**
 * Check if content passes PII policy (quick check without full processing)
 */
export function contentPassesPIIPolicy(
  content: string,
  namespace: string = 'default'
): boolean {
  const result = processPIIForWrite(content, namespace);
  return result.allowed;
}

// =============================================================================
// PII Metrics Query Functions
// =============================================================================

/**
 * Get PII detection statistics for a specific date
 */
export async function getPIIStats(date?: string): Promise<{
  byType: Record<string, number>;
  byAction: Record<string, number>;
  byNamespace: Record<string, number>;
} | null> {
  const redis = getRedis();
  if (!redis) return null;

  const targetDate = date || new Date().toISOString().split('T')[0];

  try {
    // Get all type counts for the date
    const typeKeys = await redis.keys(`${PII_REDIS_KEYS.DAILY_COUNT}:${targetDate}:*`);
    const byType: Record<string, number> = {};

    for (const key of typeKeys) {
      const type = key.split(':').pop() || '';
      const count = await redis.get<number>(key);
      if (count !== null) {
        byType[type] = count;
      }
    }

    // Get action counts
    const actionKeys = await redis.keys(`${PII_REDIS_KEYS.ACTION_COUNT}:${targetDate}:*`);
    const byAction: Record<string, number> = {};

    for (const key of actionKeys) {
      const action = key.split(':').pop() || '';
      const count = await redis.get<number>(key);
      if (count !== null) {
        byAction[action] = count;
      }
    }

    // Get namespace counts
    const namespaceKeys = await redis.keys(`${PII_REDIS_KEYS.NAMESPACE_STATS}:${targetDate}:*`);
    const byNamespace: Record<string, number> = {};

    for (const key of namespaceKeys) {
      const namespace = key.split(':').pop() || '';
      const count = await redis.get<number>(key);
      if (count !== null) {
        byNamespace[namespace] = count;
      }
    }

    return { byType, byAction, byNamespace };
  } catch (error) {
    console.error('[PII Stats] Failed to get statistics:', error);
    return null;
  }
}
