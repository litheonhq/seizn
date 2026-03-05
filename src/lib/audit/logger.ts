/**
 * Enhanced Audit Logger for Seizn
 *
 * Provides comprehensive audit logging with automatic actor extraction
 * and support for team-based audit trails.
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { AuditActionType, ResourceType } from '@/lib/rbac/types';

/**
 * Audit event parameters
 */
export interface AuditEvent {
  /** The action being logged */
  action: AuditActionType | string;
  /** Type of resource being acted upon */
  resourceType: ResourceType | string;
  /** ID of the specific resource (optional) */
  resourceId?: string;
  /** Team/organization ID (optional for personal resources) */
  teamId?: string;
  /** Additional event details */
  details?: Record<string, unknown>;
  /** Previous state for update operations */
  previousState?: Record<string, unknown>;
  /** New state for update operations */
  newState?: Record<string, unknown>;
  /** Event status */
  status?: 'success' | 'failed' | 'denied';
  /** Error message if status is failed */
  errorMessage?: string;
}

/**
 * Actor information extracted from request
 */
export interface AuditActor {
  userId: string;
  apiKeyId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  isServiceRole?: boolean;
}

/**
 * Full audit log entry
 */
export interface AuditLogEntry {
  id: string;
  userId: string;
  organizationId?: string;
  apiKeyId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details: Record<string, unknown>;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  status: string;
  errorMessage?: string;
  isServiceRole: boolean;
  createdAt: string;
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
 * Extract actor information from a NextRequest
 */
export function extractActor(request: NextRequest): Partial<AuditActor> {
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-vercel-forwarded-for') ||
    undefined;

  const userAgent = request.headers.get('user-agent') || undefined;

  const requestId =
    request.headers.get('x-request-id') ||
    request.headers.get('x-vercel-id') ||
    crypto.randomUUID();

  return { ipAddress, userAgent, requestId };
}

/**
 * Extract user ID from JWT token in request
 */
export async function extractUserFromRequest(
  request: NextRequest
): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id || null;
}

/**
 * Create a full actor from request
 * Combines user extraction with IP/UA information
 */
export async function createActorFromRequest(
  request: NextRequest,
  overrides?: Partial<AuditActor>
): Promise<AuditActor | null> {
  const userId = overrides?.userId || (await extractUserFromRequest(request));

  if (!userId) {
    return null;
  }

  const extracted = extractActor(request);

  return {
    userId,
    apiKeyId: overrides?.apiKeyId,
    ipAddress: overrides?.ipAddress || extracted.ipAddress,
    userAgent: overrides?.userAgent || extracted.userAgent,
    requestId: overrides?.requestId || extracted.requestId,
    isServiceRole: overrides?.isServiceRole || false,
  };
}

/**
 * Log an audit event
 *
 * @param actor - The actor performing the action
 * @param event - The audit event to log
 * @returns The created audit log ID or null on failure
 */
export async function logAuditEvent(
  actor: AuditActor,
  event: AuditEvent
): Promise<string | null> {
  try {
    const supabase = createServerClient();
    const payload = {
      user_id: actor.userId,
      organization_id: event.teamId || null,
      api_key_id: actor.apiKeyId || null,
      action: event.action,
      resource_type: event.resourceType,
      resource_id: event.resourceId || null,
      details: event.details || {},
      previous_state: event.previousState || null,
      new_state: event.newState || null,
      ip_address: actor.ipAddress || null,
      user_agent: actor.userAgent || null,
      request_id: actor.requestId || null,
      status: event.status || 'success',
      error_message: event.errorMessage || null,
      is_service_role: actor.isServiceRole || false,
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
        console.error('Failed to log audit event (legacy fallback):', legacyError);
        return null;
      }
      console.error('Failed to log audit event:', error);
      return null;
    }

    return data.id;
  } catch (error) {
    console.error('Audit logging error:', error);
    return null;
  }
}

/**
 * Convenience function to log audit event from request
 * Automatically extracts actor information
 */
export async function logAuditEventFromRequest(
  request: NextRequest,
  event: AuditEvent,
  actorOverrides?: Partial<AuditActor>
): Promise<string | null> {
  const actor = await createActorFromRequest(request, actorOverrides);

  if (!actor) {
    console.warn('Could not extract actor from request for audit logging');
    return null;
  }

  return logAuditEvent(actor, event);
}

/**
 * Query audit logs for a team
 */
export interface AuditLogQuery {
  teamId: string;
  action?: string;
  resourceType?: string;
  userId?: string;
  status?: 'success' | 'failed' | 'denied';
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Get audit logs for a team
 */
export async function getTeamAuditLogs(
  query: AuditLogQuery
): Promise<{ logs: AuditLogEntry[]; total: number }> {
  const supabase = createServerClient();

  let dbQuery = supabase
    .from('audit_logs')
    .select(
      `
      id,
      user_id,
      organization_id,
      api_key_id,
      action,
      resource_type,
      resource_id,
      details,
      previous_state,
      new_state,
      ip_address,
      user_agent,
      request_id,
      status,
      error_message,
      is_service_role,
      created_at,
      user:profiles (
        email,
        full_name
      )
    `,
      { count: 'exact' }
    )
    .eq('organization_id', query.teamId)
    .order('created_at', { ascending: false });

  if (query.action) {
    dbQuery = dbQuery.eq('action', query.action);
  }

  if (query.resourceType) {
    dbQuery = dbQuery.eq('resource_type', query.resourceType);
  }

  if (query.userId) {
    dbQuery = dbQuery.eq('user_id', query.userId);
  }

  if (query.status) {
    dbQuery = dbQuery.eq('status', query.status);
  }

  if (query.startDate) {
    dbQuery = dbQuery.gte('created_at', query.startDate.toISOString());
  }

  if (query.endDate) {
    dbQuery = dbQuery.lte('created_at', query.endDate.toISOString());
  }

  const limit = Math.min(query.limit || 50, 100);
  const offset = query.offset || 0;
  dbQuery = dbQuery.range(offset, offset + limit - 1);

  const { data, error, count } = await dbQuery;

  if (error) {
    console.error('Failed to fetch audit logs:', error);
    return { logs: [], total: 0 };
  }

  const logs: AuditLogEntry[] = (data || []).map((log) => ({
    id: log.id,
    userId: log.user_id,
    organizationId: log.organization_id,
    apiKeyId: log.api_key_id,
    action: log.action,
    resourceType: log.resource_type,
    resourceId: log.resource_id,
    details: log.details as Record<string, unknown>,
    previousState: log.previous_state as Record<string, unknown> | undefined,
    newState: log.new_state as Record<string, unknown> | undefined,
    ipAddress: log.ip_address,
    userAgent: log.user_agent,
    requestId: log.request_id,
    status: log.status,
    errorMessage: log.error_message,
    isServiceRole: log.is_service_role,
    createdAt: log.created_at,
  }));

  return { logs, total: count || 0 };
}

/**
 * Helper to create audit event for member actions
 */
export function createMemberAuditEvent(
  action: 'invite' | 'join' | 'remove' | 'role_change',
  teamId: string,
  memberId: string,
  details: {
    email?: string;
    role?: string;
    previousRole?: string;
    invitedBy?: string;
  }
): AuditEvent {
  const actionMap = {
    invite: 'member.invite',
    join: 'member.join',
    remove: 'member.remove',
    role_change: 'member.role_change',
  };

  return {
    action: actionMap[action],
    resourceType: 'member',
    resourceId: memberId,
    teamId,
    details: {
      email: details.email,
      role: details.role,
      invited_by: details.invitedBy,
    },
    previousState:
      action === 'role_change' ? { role: details.previousRole } : undefined,
    newState:
      action === 'role_change' ? { role: details.role } : undefined,
  };
}

/**
 * Helper to create audit event for API key actions
 */
export function createApiKeyAuditEvent(
  action: 'create' | 'revoke' | 'delete',
  teamId: string | undefined,
  apiKeyId: string,
  details: {
    name: string;
    scopes?: string[];
  }
): AuditEvent {
  const actionMap = {
    create: 'api_key.create',
    revoke: 'api_key.revoke',
    delete: 'api_key.delete',
  };

  return {
    action: actionMap[action],
    resourceType: 'api_key',
    resourceId: apiKeyId,
    teamId,
    details: {
      name: details.name,
      scopes: details.scopes,
    },
  };
}

/**
 * Helper to create audit event for collection actions
 */
export function createCollectionAuditEvent(
  action: 'create' | 'update' | 'delete',
  teamId: string,
  collectionId: string,
  details: {
    name?: string;
    previousName?: string;
  }
): AuditEvent {
  const actionMap = {
    create: 'collection.create',
    update: 'collection.update',
    delete: 'collection.delete',
  };

  return {
    action: actionMap[action],
    resourceType: 'collection',
    resourceId: collectionId,
    teamId,
    details: {
      name: details.name,
    },
    previousState:
      action === 'update' ? { name: details.previousName } : undefined,
    newState: action === 'update' ? { name: details.name } : undefined,
  };
}

/**
 * Helper to create audit event for settings changes
 */
export function createSettingsAuditEvent(
  teamId: string,
  changes: {
    field: string;
    previousValue: unknown;
    newValue: unknown;
  }
): AuditEvent {
  return {
    action: 'settings.update',
    resourceType: 'settings',
    teamId,
    details: {
      field: changes.field,
    },
    previousState: { [changes.field]: changes.previousValue },
    newState: { [changes.field]: changes.newValue },
  };
}
