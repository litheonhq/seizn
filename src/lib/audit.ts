import { NextRequest } from 'next/server';
import { createServerClient } from './supabase';
import { alertAuthFailure, alertSuspiciousActivity } from './telegram';
import { logServerError } from '@/lib/server/logger';

// Re-export all from audit folder for centralized access
export * from './audit/logger';
export * from './audit/tamper-evident';

export interface AuditLogParams {
  userId: string;
  organizationId?: string;
  apiKeyId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  status?: 'success' | 'failed' | 'denied';
  errorMessage?: string;
  isServiceRole?: boolean;
}

export interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

type SupabaseInsertError = { code?: string | null; message?: string | null };

function isAuditLogsMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as SupabaseInsertError;
  const message = (maybe.message || '').toLowerCase();
  return (
    maybe.code === 'PGRST205' &&
    message.includes("could not find the table 'public.audit_logs'")
  );
}

/**
 * Extract audit context from a NextRequest
 */
export function getAuditContext(request: NextRequest): AuditContext {
  // Get IP address (Vercel provides these headers)
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-vercel-forwarded-for') ||
    undefined;

  const userAgent = request.headers.get('user-agent') || undefined;

  // Generate or get request ID
  const requestId =
    request.headers.get('x-request-id') ||
    request.headers.get('x-vercel-id') ||
    crypto.randomUUID();

  return { ipAddress, userAgent, requestId };
}

/** Strip sensitive fields from audit details before persisting */
function sanitizeAuditData(obj: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!obj) return {};
  const sensitiveKeys = ['password', 'secret', 'token', 'api_key', 'key_hash', 'authorization', 'credit_card', 'ssn'];
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (sensitiveKeys.some(s => lower.includes(s))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 500) {
      result[key] = value.substring(0, 500) + '...[truncated]';
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Log an audit event
 */
export async function logAuditEvent(
  params: AuditLogParams,
  context?: AuditContext
): Promise<string | null> {
  // Unauthenticated events (ex: auth failure) may not have a profile row, which
  // can violate FK constraints on audit_logs.user_id. Avoid spamming logs in
  // those cases.
  if (!params.userId || params.userId === "anonymous") {
    return null;
  }

  try {
    const supabase = createServerClient();
    const payload = {
      user_id: params.userId,
      organization_id: params.organizationId || null,
      api_key_id: params.apiKeyId || null,
      action: params.action,
      resource_type: params.resourceType,
      resource_id: params.resourceId || null,
      details: sanitizeAuditData(params.details),
      previous_state: sanitizeAuditData(params.previousState),
      new_state: sanitizeAuditData(params.newState),
      ip_address: context?.ipAddress || null,
      user_agent: context?.userAgent?.substring(0, 500) || null,
      request_id: context?.requestId || null,
      status: params.status || 'success',
      error_message: params.errorMessage?.substring(0, 1000) || null,
      is_service_role: params.isServiceRole || false,
    };

    const { data, error } = await supabase
      .from('audit_logs')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      if (isAuditLogsMissingError(error)) {
        const { data: legacyData, error: legacyError } = await supabase
          .from('audit_log')
          .insert(payload)
          .select('id')
          .single();
        if (!legacyError) {
          return legacyData.id;
        }
        logServerError('Failed to log audit event (legacy fallback)', legacyError);
        return null;
      }
      logServerError('Failed to log audit event', error);
      return null;
    }

    return data.id;
  } catch (error) {
    logServerError('Audit logging error', error);
    return null;
  }
}

/**
 * Log memory access event
 */
export async function logMemoryAccess(
  request: NextRequest,
  userId: string,
  apiKeyId: string | undefined,
  action: 'read' | 'search' | 'bulk_read',
  details: {
    memoryId?: string;
    memoryCount?: number;
    query?: string;
  }
): Promise<void> {
  const context = getAuditContext(request);

  await logAuditEvent(
    {
      userId,
      apiKeyId,
      action: `memory.${action}`,
      resourceType: 'memory',
      resourceId: details.memoryId,
      details: {
        memory_count: details.memoryCount,
        query_length: details.query?.length,
        has_query: !!details.query,
      },
      status: 'success',
    },
    context
  );
}

/**
 * Log failed authentication attempt
 */
export async function logAuthFailure(
  request: NextRequest,
  reason: string,
  apiKeyPrefix?: string
): Promise<void> {
  const context = getAuditContext(request);

  await logAuditEvent(
    {
      userId: 'anonymous',
      action: 'auth.failure',
      resourceType: 'api_key',
      details: {
        reason,
        api_key_prefix: apiKeyPrefix?.substring(0, 8),
      },
      status: 'denied',
      errorMessage: reason,
    },
    context
  );

  // Send Telegram alert for auth failures
  alertAuthFailure(
    context.ipAddress || 'unknown',
    reason
  ).catch((error) => logServerError('Failed to send auth failure alert', error));
}

/**
 * Log suspicious activity
 */
export async function logSuspiciousActivity(
  request: NextRequest,
  userId: string,
  activityType: string,
  details: Record<string, unknown>
): Promise<void> {
  const context = getAuditContext(request);

  await logAuditEvent(
    {
      userId,
      action: `suspicious.${activityType}`,
      resourceType: 'security',
      details,
      status: 'failed',
    },
    context
  );

  // Send Telegram alert for suspicious activity
  alertSuspiciousActivity(
    userId,
    activityType,
    { ...details, ip: context.ipAddress }
  ).catch((error) => logServerError('Failed to send suspicious activity alert', error));
}

// Action types for reference
export const AuditActions = {
  // Memory
  MEMORY_CREATE: 'memory.create',
  MEMORY_READ: 'memory.read',
  MEMORY_SEARCH: 'memory.search',
  MEMORY_UPDATE: 'memory.update',
  MEMORY_DELETE: 'memory.delete',
  MEMORY_BULK_READ: 'memory.bulk_read',

  // API Keys
  API_KEY_CREATE: 'api_key.create',
  API_KEY_REVOKE: 'api_key.revoke',

  // Auth
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_FAILURE: 'auth.failure',

  // Organization
  ORG_CREATE: 'org.create',
  MEMBER_JOIN: 'member.join',
  MEMBER_REMOVE: 'member.remove',
  MEMBER_ROLE_CHANGE: 'member.role_change',

  // Suspicious
  SUSPICIOUS_RATE_LIMIT: 'suspicious.rate_limit',
  SUSPICIOUS_UNUSUAL_ACCESS: 'suspicious.unusual_access',

  // Federated
  FEDERATED_SOURCE_CREATE: 'federated.source.create',
  FEDERATED_SOURCE_UPDATE: 'federated.source.update',
  FEDERATED_SOURCE_DELETE: 'federated.source.delete',
  FEDERATED_SOURCE_VERIFY: 'federated.source.verify',
  FEDERATED_BINDING_CREATE: 'federated.binding.create',
  FEDERATED_BINDING_DELETE: 'federated.binding.delete',
  FEDERATED_ACCESS_GRANT: 'federated.access.grant',
  FEDERATED_ACCESS_REVOKE: 'federated.access.revoke',
} as const;

