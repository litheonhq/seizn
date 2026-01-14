/**
 * PII Audit Logging
 *
 * Provides audit logging support for PII detection and masking operations.
 * Records events for compliance and security monitoring.
 */

import { type PIIType } from './pii-patterns';
import { type PIIDetectionResult } from './pii-detector';

// =============================================================================
// Types (mirrored from @/lib/audit for standalone compatibility)
// =============================================================================

/**
 * Audit context for request tracking
 */
export interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Audit log parameters
 */
interface AuditLogParams {
  userId: string;
  organizationId?: string;
  apiKeyId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  status?: 'success' | 'failed' | 'denied';
  errorMessage?: string;
}

// =============================================================================
// Dynamic Import for Audit Module
// =============================================================================

/**
 * Lazy-loaded audit event logger
 * Uses dynamic import to avoid hard dependency on @/lib/audit
 */
let cachedLogAuditEvent: ((params: AuditLogParams, context?: AuditContext) => Promise<string | null>) | null = null;

async function getLogAuditEvent(): Promise<(params: AuditLogParams, context?: AuditContext) => Promise<string | null>> {
  if (cachedLogAuditEvent) {
    return cachedLogAuditEvent;
  }

  try {
    // Dynamic import to avoid build-time dependency issues
    const auditModule = await import('@/lib/audit');
    cachedLogAuditEvent = auditModule.logAuditEvent;
    return cachedLogAuditEvent;
  } catch {
    // Fallback: console logging when audit module is not available
    cachedLogAuditEvent = async (params: AuditLogParams) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[PII Audit]', JSON.stringify({
          action: params.action,
          resourceType: params.resourceType,
          status: params.status,
          details: params.details,
        }));
      }
      return null;
    };
    return cachedLogAuditEvent;
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Actions that can be logged for PII events
 */
export type PIIAuditAction = 'detected' | 'masked' | 'blocked' | 'allowed' | 'scanned';

/**
 * Parameters for PII audit log
 */
export interface PIIAuditParams {
  /** User ID performing the action */
  userId: string;
  /** Organization ID (optional) */
  organizationId?: string;
  /** Types of PII detected */
  piiTypes: PIIType[];
  /** Action taken */
  action: PIIAuditAction;
  /** Content source (e.g., 'memory', 'chat', 'api') */
  source?: string;
  /** Namespace if applicable */
  namespace?: string;
  /** Whether the operation was blocked */
  wasBlocked?: boolean;
  /** Additional context */
  context?: AuditContext;
}

/**
 * Aggregated PII detection log entry
 */
export interface PIIAuditLogEntry {
  timestamp: Date;
  userId: string;
  organizationId?: string;
  action: PIIAuditAction;
  piiTypes: PIIType[];
  piiCount: number;
  source?: string;
  namespace?: string;
  wasBlocked: boolean;
  maxConfidence: number;
}

// =============================================================================
// Audit Log Actions
// =============================================================================

export const PIIAuditActions = {
  /** PII was detected in content */
  DETECTED: 'pii.detected' as const,
  /** PII was masked before storage */
  MASKED: 'pii.masked' as const,
  /** Content was blocked due to PII */
  BLOCKED: 'pii.blocked' as const,
  /** Content was allowed (no PII or allowed types) */
  ALLOWED: 'pii.allowed' as const,
  /** Content was scanned (general scan event) */
  SCANNED: 'pii.scanned' as const,
};

// =============================================================================
// Logging Functions
// =============================================================================

/**
 * Log a PII detection event
 *
 * IMPORTANT: This function never logs the actual PII values.
 * Only metadata (types, counts, positions) are recorded.
 *
 * @param params - Audit parameters
 * @returns Promise resolving to audit log ID or null on failure
 *
 * @example
 * ```ts
 * await logPIIDetection({
 *   userId: 'user-123',
 *   piiTypes: ['email', 'phone'],
 *   action: 'masked',
 *   source: 'memory',
 * });
 * ```
 */
export async function logPIIDetection(params: PIIAuditParams): Promise<string | null> {
  const {
    userId,
    organizationId,
    piiTypes,
    action,
    source,
    namespace,
    wasBlocked = false,
    context,
  } = params;

  const actionMap: Record<PIIAuditAction, string> = {
    detected: PIIAuditActions.DETECTED,
    masked: PIIAuditActions.MASKED,
    blocked: PIIAuditActions.BLOCKED,
    allowed: PIIAuditActions.ALLOWED,
    scanned: PIIAuditActions.SCANNED,
  };

  try {
    const logAuditEvent = await getLogAuditEvent();
    const logId = await logAuditEvent(
      {
        userId,
        organizationId,
        action: actionMap[action],
        resourceType: 'pii',
        details: {
          pii_types: piiTypes,
          pii_count: piiTypes.length,
          source,
          namespace,
          was_blocked: wasBlocked,
        },
        status: wasBlocked ? 'denied' : 'success',
      },
      context
    );

    return logId;
  } catch (error) {
    console.error('[PII Audit] Failed to log PII detection:', error);
    return null;
  }
}

/**
 * Log PII detection result from detector
 *
 * @param userId - User ID
 * @param result - Detection result from pii-detector
 * @param action - Action taken
 * @param options - Additional options
 */
export async function logPIIDetectionResult(
  userId: string,
  result: PIIDetectionResult,
  action: PIIAuditAction,
  options: {
    organizationId?: string;
    source?: string;
    namespace?: string;
    context?: AuditContext;
  } = {}
): Promise<string | null> {
  if (!result.found && action !== 'scanned') {
    // Don't log if nothing was found (unless it's a scan event)
    return null;
  }

  return logPIIDetection({
    userId,
    organizationId: options.organizationId,
    piiTypes: result.types,
    action,
    source: options.source,
    namespace: options.namespace,
    wasBlocked: action === 'blocked',
    context: options.context,
  });
}

/**
 * Log when PII content is blocked
 *
 * @param userId - User ID
 * @param piiTypes - Types of PII that caused the block
 * @param reason - Reason for blocking
 * @param context - Request context
 */
export async function logPIIBlocked(
  userId: string,
  piiTypes: PIIType[],
  reason: string,
  context?: AuditContext
): Promise<string | null> {
  try {
    const logAuditEvent = await getLogAuditEvent();
    const logId = await logAuditEvent(
      {
        userId,
        action: PIIAuditActions.BLOCKED,
        resourceType: 'pii',
        details: {
          pii_types: piiTypes,
          pii_count: piiTypes.length,
          block_reason: reason,
        },
        status: 'denied',
        errorMessage: reason,
      },
      context
    );

    return logId;
  } catch (error) {
    console.error('[PII Audit] Failed to log PII block:', error);
    return null;
  }
}

/**
 * Log when PII is masked
 *
 * @param userId - User ID
 * @param piiTypes - Types of PII that were masked
 * @param count - Number of items masked
 * @param context - Request context
 */
export async function logPIIMasked(
  userId: string,
  piiTypes: PIIType[],
  count: number,
  context?: AuditContext
): Promise<string | null> {
  try {
    const logAuditEvent = await getLogAuditEvent();
    const logId = await logAuditEvent(
      {
        userId,
        action: PIIAuditActions.MASKED,
        resourceType: 'pii',
        details: {
          pii_types: piiTypes,
          masked_count: count,
        },
        status: 'success',
      },
      context
    );

    return logId;
  } catch (error) {
    console.error('[PII Audit] Failed to log PII masking:', error);
    return null;
  }
}

// =============================================================================
// Batch Logging
// =============================================================================

/**
 * Log multiple PII events in batch
 *
 * @param events - Array of PII audit parameters
 */
export async function logPIIBatch(events: PIIAuditParams[]): Promise<(string | null)[]> {
  return Promise.all(events.map((event) => logPIIDetection(event)));
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Summary of PII events for a time period
 */
export interface PIIAuditSummary {
  totalEvents: number;
  byAction: Record<PIIAuditAction, number>;
  byType: Partial<Record<PIIType, number>>;
  blockedCount: number;
  maskedCount: number;
}

/**
 * Create an empty PII audit summary
 */
export function createEmptyPIISummary(): PIIAuditSummary {
  return {
    totalEvents: 0,
    byAction: {
      detected: 0,
      masked: 0,
      blocked: 0,
      allowed: 0,
      scanned: 0,
    },
    byType: {},
    blockedCount: 0,
    maskedCount: 0,
  };
}

/**
 * Aggregate PII audit entries into a summary
 */
export function aggregatePIIAuditEntries(entries: PIIAuditLogEntry[]): PIIAuditSummary {
  const summary = createEmptyPIISummary();

  for (const entry of entries) {
    summary.totalEvents++;
    summary.byAction[entry.action]++;

    for (const type of entry.piiTypes) {
      summary.byType[type] = (summary.byType[type] || 0) + 1;
    }

    if (entry.wasBlocked) {
      summary.blockedCount++;
    }

    if (entry.action === 'masked') {
      summary.maskedCount += entry.piiCount;
    }
  }

  return summary;
}
