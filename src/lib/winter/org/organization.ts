/**
 * Seizn Winter - Organization Management
 *
 * CRUD operations for organizations including:
 * - Organization creation/update/deletion
 * - Organization settings management
 * - Usage statistics
 */

import { createServerClient } from '@/lib/supabase';
import { seedDefaultOrganizationIdIfMissing } from '@/lib/profile/organization';
import type {
  Organization,
  OrganizationSettings,
  OrganizationPlan,
  OrgRole,
  OrgMember,
} from './types';
import { logAuditEvent } from './audit-log';

// ============================================
// Types
// ============================================

export interface CreateOrganizationParams {
  name: string;
  slug?: string;
  owner_id: string;
  plan?: OrganizationPlan;
  settings?: Partial<OrganizationSettings>;
}

export interface UpdateOrganizationParams {
  id: string;
  name?: string;
  settings?: Partial<OrganizationSettings>;
  memory_limit?: number;
  api_calls_limit?: number;
}

export interface OrganizationUsageStats {
  total_api_calls: number;
  total_memories: number;
  total_input_tokens: number;
  total_output_tokens: number;
  member_count: number;
  storage_used_mb: number;
}

// ============================================
// Organization CRUD
// ============================================

/**
 * Create a new organization with the specified owner
 */
export async function createOrganization(
  params: CreateOrganizationParams
): Promise<Organization> {
  const supabase = createServerClient();

  // Generate slug if not provided
  const slug =
    params.slug ||
    params.name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);

  // Check if slug is taken
  const { data: existing } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .single();

  if (existing) {
    throw new Error('Organization slug already exists');
  }

  // Use the create_organization function if available, or manual insert
  const { data: orgId, error: rpcError } = await supabase.rpc('create_organization', {
    p_name: params.name.trim(),
    p_slug: slug,
    p_owner_id: params.owner_id,
  });

  if (rpcError) {
    // Fallback to manual creation
    const { data: org, error: insertError } = await supabase
      .from('organizations')
      .insert({
        name: params.name.trim(),
        slug,
        plan: params.plan || 'team',
        settings: params.settings || {},
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Add owner
    await supabase.from('organization_members').insert({
      organization_id: org.id,
      user_id: params.owner_id,
      role: 'owner',
      status: 'active',
    });

    await seedDefaultOrganizationIdIfMissing(supabase, {
      userId: params.owner_id,
      organizationId: String(org.id),
    });

    // Log audit event
    await logAuditEvent({
      user_id: params.owner_id,
      organization_id: org.id,
      action: 'org.create',
      resource_type: 'settings',
      resource_id: org.id,
      details: { name: org.name, slug: org.slug, plan: org.plan },
      status: 'success',
    });

    return org as Organization;
  }

  // Fetch the created organization
  const { data: org, error: fetchError } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();

  if (fetchError) throw fetchError;

  // Update settings if provided
  if (params.settings) {
    await supabase
      .from('organizations')
      .update({ settings: params.settings })
      .eq('id', orgId);
  }

  await seedDefaultOrganizationIdIfMissing(supabase, {
    userId: params.owner_id,
    organizationId: String(orgId),
  });

  // Log audit event
  await logAuditEvent({
    user_id: params.owner_id,
    organization_id: orgId,
    action: 'org.create',
    resource_type: 'settings',
    resource_id: orgId,
    details: { name: org.name, slug: org.slug, plan: org.plan },
    status: 'success',
  });

  return org as Organization;
}

/**
 * Get an organization by ID
 */
export async function getOrganization(orgId: string): Promise<Organization | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return data as Organization;
}

/**
 * Get an organization by slug
 */
export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data as Organization;
}

/**
 * Get all organizations for a user
 */
export async function getUserOrganizations(userId: string): Promise<
  Array<{
    organization: Organization;
    role: OrgRole;
  }>
> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('organization_members')
    .select(
      `
      role,
      organization:organizations (*)
    `
    )
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) throw error;

  return (data || []).map((item) => ({
    organization: item.organization as unknown as Organization,
    role: item.role as OrgRole,
  }));
}

/**
 * Update an organization
 */
export async function updateOrganization(
  params: UpdateOrganizationParams,
  updatedBy: string
): Promise<Organization> {
  const supabase = createServerClient();

  // Get current state for audit log
  const { data: currentOrg } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!currentOrg) {
    throw new Error('Organization not found');
  }

  // Build update object
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (params.name) updates.name = params.name.trim();
  if (params.settings) {
    updates.settings = {
      ...(currentOrg.settings || {}),
      ...params.settings,
    };
  }
  if (params.memory_limit !== undefined) updates.memory_limit = params.memory_limit;
  if (params.api_calls_limit !== undefined) updates.api_calls_limit = params.api_calls_limit;

  const { data: org, error } = await supabase
    .from('organizations')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) throw error;

  // Log audit event
  await logAuditEvent({
    user_id: updatedBy,
    organization_id: params.id,
    action: 'org.update',
    resource_type: 'settings',
    resource_id: params.id,
    previous_state: currentOrg,
    new_state: org,
    details: { updated_fields: Object.keys(updates).filter((k) => k !== 'updated_at') },
    status: 'success',
  });

  return org as Organization;
}

/**
 * Update organization settings
 */
export async function updateOrganizationSettings(
  orgId: string,
  settings: Partial<OrganizationSettings>,
  updatedBy: string
): Promise<OrganizationSettings> {
  const supabase = createServerClient();

  // Get current settings
  const { data: currentOrg } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .single();

  if (!currentOrg) {
    throw new Error('Organization not found');
  }

  const newSettings = {
    ...(currentOrg.settings || {}),
    ...settings,
  };

  const { data, error } = await supabase
    .from('organizations')
    .update({
      settings: newSettings,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId)
    .select('settings')
    .single();

  if (error) throw error;

  // Log settings change
  await logAuditEvent({
    user_id: updatedBy,
    organization_id: orgId,
    action: 'org.settings_change',
    resource_type: 'settings',
    resource_id: orgId,
    previous_state: currentOrg.settings,
    new_state: newSettings,
    details: { changed_keys: Object.keys(settings) },
    status: 'success',
  });

  return data.settings as OrganizationSettings;
}

/**
 * Delete an organization
 */
export async function deleteOrganization(
  orgId: string,
  deletedBy: string
): Promise<void> {
  const supabase = createServerClient();

  // Get org for audit log
  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();

  if (!org) {
    throw new Error('Organization not found');
  }

  // Delete organization (cascades to members, invites, etc.)
  const { error } = await supabase.from('organizations').delete().eq('id', orgId);

  if (error) throw error;

  // Log deletion (org_id will be null since org is deleted)
  await logAuditEvent({
    user_id: deletedBy,
    action: 'org.delete',
    resource_type: 'settings',
    resource_id: orgId,
    previous_state: org,
    details: { name: org.name, slug: org.slug },
    status: 'success',
  });
}

// ============================================
// Organization Usage & Stats
// ============================================

/**
 * Get organization usage statistics
 */
export async function getOrganizationUsage(
  orgId: string,
  startDate?: Date
): Promise<OrganizationUsageStats> {
  const supabase = createServerClient();

  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Try RPC function first
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_organization_usage', {
    p_org_id: orgId,
    p_start_date: start.toISOString(),
  });

  if (!rpcError && rpcData && rpcData.length > 0) {
    return {
      total_api_calls: rpcData[0].total_api_calls || 0,
      total_memories: rpcData[0].total_memories || 0,
      total_input_tokens: rpcData[0].total_input_tokens || 0,
      total_output_tokens: rpcData[0].total_output_tokens || 0,
      member_count: rpcData[0].member_count || 0,
      storage_used_mb: 0, // Calculate separately if needed
    };
  }

  // Fallback to manual queries
  const [apiCallsResult, memoriesResult, membersResult] = await Promise.all([
    supabase
      .from('usage_logs')
      .select('input_tokens, output_tokens', { count: 'exact' })
      .eq('organization_id', orgId)
      .gte('created_at', start.toISOString()),
    supabase
      .from('memories')
      .select('id', { count: 'exact' })
      .eq('organization_id', orgId)
      .eq('is_deleted', false),
    supabase
      .from('organization_members')
      .select('id', { count: 'exact' })
      .eq('organization_id', orgId),
  ]);

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  if (apiCallsResult.data) {
    for (const log of apiCallsResult.data) {
      totalInputTokens += (log as { input_tokens?: number }).input_tokens || 0;
      totalOutputTokens += (log as { output_tokens?: number }).output_tokens || 0;
    }
  }

  return {
    total_api_calls: apiCallsResult.count || 0,
    total_memories: memoriesResult.count || 0,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    member_count: membersResult.count || 0,
    storage_used_mb: 0,
  };
}

/**
 * Check if organization is within its limits
 */
export async function checkOrganizationLimits(
  orgId: string
): Promise<{
  within_limits: boolean;
  memory_usage: { current: number; limit: number; percentage: number };
  api_usage: { current: number; limit: number; percentage: number };
}> {
  const supabase = createServerClient();

  // Get org limits
  const { data: org } = await supabase
    .from('organizations')
    .select('memory_limit, api_calls_limit')
    .eq('id', orgId)
    .single();

  if (!org) {
    throw new Error('Organization not found');
  }

  const usage = await getOrganizationUsage(orgId);

  const memoryPercentage = (usage.total_memories / org.memory_limit) * 100;
  const apiPercentage = (usage.total_api_calls / org.api_calls_limit) * 100;

  return {
    within_limits: memoryPercentage < 100 && apiPercentage < 100,
    memory_usage: {
      current: usage.total_memories,
      limit: org.memory_limit,
      percentage: Math.round(memoryPercentage * 100) / 100,
    },
    api_usage: {
      current: usage.total_api_calls,
      limit: org.api_calls_limit,
      percentage: Math.round(apiPercentage * 100) / 100,
    },
  };
}

// ============================================
// Organization Context
// ============================================

/**
 * Get organization context for a user (org + member info + permissions)
 */
export async function getOrgContext(
  orgId: string,
  userId: string
): Promise<{
  organization: Organization;
  member: OrgMember;
} | null> {
  const supabase = createServerClient();

  const { data: memberData, error: memberError } = await supabase
    .from('organization_members')
    .select(
      `
      *,
      organization:organizations (*)
    `
    )
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .single();

  if (memberError || !memberData) {
    return null;
  }

  return {
    organization: memberData.organization as unknown as Organization,
    member: {
      id: memberData.id,
      organization_id: memberData.organization_id,
      user_id: memberData.user_id,
      role: memberData.role,
      permissions: memberData.permissions || {},
      invited_by: memberData.invited_by,
      invited_at: memberData.invited_at,
      accepted_at: memberData.accepted_at,
      status: memberData.status || 'active',
      created_at: memberData.created_at,
    } as OrgMember,
  };
}

/**
 * Check if user has access to organization
 */
export async function hasOrgAccess(
  orgId: string,
  userId: string
): Promise<boolean> {
  const supabase = createServerClient();

  const { data } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  return !!data;
}

/**
 * Get user's role in organization
 */
export async function getUserOrgRole(
  orgId: string,
  userId: string
): Promise<OrgRole | null> {
  const supabase = createServerClient();

  const { data } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  return data?.role as OrgRole | null;
}
