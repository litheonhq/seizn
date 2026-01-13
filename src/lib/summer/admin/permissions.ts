/**
 * Federated Admin Permissions
 *
 * Granular permission checks for federated source management.
 */
import { createServerClient } from '@/lib/supabase';
import { NextRequest } from 'next/server';
import { getAuditContext, type AuditContext } from '@/lib/audit';

export type FederatedRole = 'owner' | 'editor' | 'viewer';
export type FederatedOperation =
  | 'source.create'
  | 'source.update'
  | 'source.delete'
  | 'source.verify'
  | 'binding.create'
  | 'binding.update'
  | 'binding.delete'
  | 'binding.sync'
  | 'access.grant'
  | 'access.revoke'
  | 'access.update'
  | 'search.execute'
  | 'search.error';

export type FederatedResourceType = 'source' | 'binding' | 'access' | 'search';

export interface FederatedOperationLog {
  userId: string;
  organizationId?: string;
  operation: FederatedOperation;
  resourceType: FederatedResourceType;
  resourceId?: string;
  details?: Record<string, unknown>;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  status?: 'success' | 'failed' | 'denied';
  errorMessage?: string;
  durationMs?: number;
}

/**
 * Check if user has required permission for a federated source
 */
export async function checkSourcePermission(
  userId: string,
  sourceId: string,
  requiredRole: FederatedRole = 'viewer'
): Promise<boolean> {
  const supabase = createServerClient();

  // Use the database function for efficient permission check
  const { data, error } = await supabase.rpc('check_federated_permission', {
    p_user_id: userId,
    p_source_id: sourceId,
    p_required_role: requiredRole,
  });

  if (error) {
    console.error('Permission check error:', error);
    return false;
  }

  return data === true;
}

/**
 * Get user's access level for a source
 */
export async function getSourceAccessLevel(
  userId: string,
  sourceId: string
): Promise<FederatedRole | null> {
  const supabase = createServerClient();

  // Check if user is source owner
  const { data: source } = await supabase
    .from('summer_federated_sources')
    .select('user_id')
    .eq('id', sourceId)
    .maybeSingle();

  if (source?.user_id === userId) {
    return 'owner';
  }

  // Check direct user access
  const { data: directAccess } = await supabase
    .from('summer_federated_source_access')
    .select('role')
    .eq('source_id', sourceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (directAccess?.role) {
    return directAccess.role as FederatedRole;
  }

  // Check org-based access
  const { data: orgAccess } = await supabase
    .from('summer_federated_source_access')
    .select(`
      role,
      organization_id,
      organizations!inner (
        organization_members!inner (
          user_id
        )
      )
    `)
    .eq('source_id', sourceId)
    .not('organization_id', 'is', null);

  if (orgAccess) {
    for (const access of orgAccess) {
      const members = (access as any).organizations?.organization_members ?? [];
      if (members.some((m: any) => m.user_id === userId)) {
        return access.role as FederatedRole;
      }
    }
  }

  return null;
}

/**
 * Get all sources a user has access to
 */
export async function getAccessibleSources(
  userId: string,
  organizationId?: string
): Promise<
  Array<{
    sourceId: string;
    sourceName: string;
    role: FederatedRole;
    provider: string;
    isActive: boolean;
  }>
> {
  const supabase = createServerClient();

  // Get owned sources
  const { data: ownedSources } = await supabase
    .from('summer_federated_sources')
    .select('id, name, provider, is_active')
    .eq('user_id', userId);

  const result: Array<{
    sourceId: string;
    sourceName: string;
    role: FederatedRole;
    provider: string;
    isActive: boolean;
  }> = [];

  for (const source of ownedSources ?? []) {
    result.push({
      sourceId: source.id,
      sourceName: source.name,
      role: 'owner',
      provider: source.provider,
      isActive: source.is_active ?? true,
    });
  }

  // Get sources via direct access grants
  const { data: accessGrants } = await supabase
    .from('summer_federated_source_access')
    .select(`
      source_id,
      role,
      summer_federated_sources (
        id, name, provider, is_active
      )
    `)
    .eq('user_id', userId);

  for (const grant of accessGrants ?? []) {
    const source = (grant as any).summer_federated_sources;
    if (source && !result.some((r) => r.sourceId === source.id)) {
      result.push({
        sourceId: source.id,
        sourceName: source.name,
        role: grant.role as FederatedRole,
        provider: source.provider,
        isActive: source.is_active ?? true,
      });
    }
  }

  // Get sources via organization membership
  if (organizationId) {
    const { data: orgGrants } = await supabase
      .from('summer_federated_source_access')
      .select(`
        source_id,
        role,
        summer_federated_sources (
          id, name, provider, is_active
        )
      `)
      .eq('organization_id', organizationId);

    for (const grant of orgGrants ?? []) {
      const source = (grant as any).summer_federated_sources;
      if (source && !result.some((r) => r.sourceId === source.id)) {
        result.push({
          sourceId: source.id,
          sourceName: source.name,
          role: grant.role as FederatedRole,
          provider: source.provider,
          isActive: source.is_active ?? true,
        });
      }
    }
  }

  return result;
}

/**
 * Grant access to a federated source
 */
export async function grantSourceAccess(params: {
  sourceId: string;
  targetUserId?: string;
  targetOrganizationId?: string;
  role: FederatedRole;
  grantedBy: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!params.targetUserId && !params.targetOrganizationId) {
    return { success: false, error: 'Must specify targetUserId or targetOrganizationId' };
  }

  const supabase = createServerClient();

  const { error } = await supabase.from('summer_federated_source_access').upsert(
    {
      source_id: params.sourceId,
      user_id: params.targetUserId ?? null,
      organization_id: params.targetOrganizationId ?? null,
      role: params.role,
      granted_by: params.grantedBy,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: params.targetUserId
        ? 'source_id,user_id'
        : 'source_id,organization_id',
    }
  );

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Revoke access from a federated source
 */
export async function revokeSourceAccess(params: {
  sourceId: string;
  targetUserId?: string;
  targetOrganizationId?: string;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();

  let query = supabase
    .from('summer_federated_source_access')
    .delete()
    .eq('source_id', params.sourceId);

  if (params.targetUserId) {
    query = query.eq('user_id', params.targetUserId);
  } else if (params.targetOrganizationId) {
    query = query.eq('organization_id', params.targetOrganizationId);
  } else {
    return { success: false, error: 'Must specify targetUserId or targetOrganizationId' };
  }

  const { error } = await query;

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Log a federated operation for audit
 */
export async function logFederatedOperation(
  params: FederatedOperationLog,
  context?: AuditContext
): Promise<string | null> {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('summer_federated_operations')
      .insert({
        user_id: params.userId,
        organization_id: params.organizationId ?? null,
        operation: params.operation,
        resource_type: params.resourceType,
        resource_id: params.resourceId ?? null,
        details: params.details ?? {},
        previous_state: params.previousState ?? null,
        new_state: params.newState ?? null,
        status: params.status ?? 'success',
        error_message: params.errorMessage ?? null,
        ip_address: context?.ipAddress ?? null,
        user_agent: context?.userAgent ?? null,
        request_id: context?.requestId ?? null,
        duration_ms: params.durationMs ?? null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to log federated operation:', error);
      return null;
    }

    return data.id;
  } catch (error) {
    console.error('Federated operation logging error:', error);
    return null;
  }
}

/**
 * Helper to log federated operation from a request
 */
export async function logFederatedOperationFromRequest(
  request: NextRequest,
  params: Omit<FederatedOperationLog, 'userId'> & { userId: string }
): Promise<string | null> {
  const context = getAuditContext(request);
  return logFederatedOperation(params, context);
}

/**
 * Get federated operation logs with filters
 */
export async function getFederatedOperationLogs(params: {
  userId?: string;
  organizationId?: string;
  operation?: FederatedOperation;
  resourceType?: FederatedResourceType;
  resourceId?: string;
  status?: 'success' | 'failed' | 'denied';
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}): Promise<{
  logs: Array<{
    id: string;
    userId: string;
    organizationId?: string;
    operation: string;
    resourceType: string;
    resourceId?: string;
    details: Record<string, unknown>;
    status: string;
    errorMessage?: string;
    createdAt: string;
  }>;
  total: number;
}> {
  const supabase = createServerClient();

  let query = supabase
    .from('summer_federated_operations')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (params.userId) {
    query = query.eq('user_id', params.userId);
  }
  if (params.organizationId) {
    query = query.eq('organization_id', params.organizationId);
  }
  if (params.operation) {
    query = query.eq('operation', params.operation);
  }
  if (params.resourceType) {
    query = query.eq('resource_type', params.resourceType);
  }
  if (params.resourceId) {
    query = query.eq('resource_id', params.resourceId);
  }
  if (params.status) {
    query = query.eq('status', params.status);
  }
  if (params.startDate) {
    query = query.gte('created_at', params.startDate.toISOString());
  }
  if (params.endDate) {
    query = query.lte('created_at', params.endDate.toISOString());
  }

  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    console.error('Failed to fetch federated operation logs:', error);
    return { logs: [], total: 0 };
  }

  return {
    logs: (data ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      organizationId: row.organization_id ?? undefined,
      operation: row.operation,
      resourceType: row.resource_type,
      resourceId: row.resource_id ?? undefined,
      details: row.details ?? {},
      status: row.status,
      errorMessage: row.error_message ?? undefined,
      createdAt: row.created_at,
    })),
    total: count ?? 0,
  };
}
