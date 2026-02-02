/**
 * Seizn Winter - Policy Versioning System
 *
 * Version control for organization policies including:
 * - Version history tracking
 * - Rollback capability
 * - Version comparison
 * - Draft/Published state management
 */

import { createServerClient } from '@/lib/supabase';
import { logAuditEvent } from './audit-log';
import type {
  PolicyType,
  PolicyConfig,
  PolicyScope,
  PaginatedResult,
} from './types';

// ============================================
// Types (local until exported from types.ts)
// ============================================

export type PolicyVersionState = 'draft' | 'published' | 'archived';
export type PolicyVersionChangeType = 'create' | 'update' | 'rollback';

export interface PolicyVersion {
  id: string;
  policy_id: string;
  organization_id: string;

  // Version info
  version: number;
  state: PolicyVersionState;

  // Snapshot of policy at this version
  policy_type: PolicyType;
  name: string;
  description?: string;
  config: PolicyConfig;
  scope: PolicyScope;
  priority: number;

  // Version metadata
  change_summary?: string;
  change_type: PolicyVersionChangeType;

  // Who created this version
  created_by?: string;
  created_at: string;

  // Publication info
  published_at?: string;
  published_by?: string;

  // Superseded info
  superseded_at?: string;
  superseded_by?: string;
}

export interface PolicyVersionDiff {
  version_a: {
    id: string;
    version: number;
    state: PolicyVersionState;
    created_at: string;
  };
  version_b: {
    id: string;
    version: number;
    state: PolicyVersionState;
    created_at: string;
  };
  changes: {
    name?: { from: string; to: string } | null;
    description?: { from: string | null; to: string | null } | null;
    config?: { from: PolicyConfig; to: PolicyConfig } | null;
    scope?: { from: PolicyScope; to: PolicyScope } | null;
    priority?: { from: number; to: number } | null;
  };
}

// ============================================
// Parameter Types
// ============================================

export interface CreateVersionParams {
  policy_id: string;
  created_by: string;
  change_summary?: string;
  change_type?: PolicyVersionChangeType;
}

export interface ListVersionsParams {
  policy_id: string;
  state?: PolicyVersionState;
  limit?: number;
  offset?: number;
}

export interface RollbackParams {
  policy_id: string;
  target_version: number;
  rolled_back_by: string;
  reason?: string;
}

export interface UpdateDraftParams {
  version_id: string;
  name?: string;
  description?: string;
  config?: Partial<PolicyConfig>;
  scope?: PolicyScope;
  priority?: number;
  change_summary?: string;
}

// ============================================
// Version CRUD Operations
// ============================================

/**
 * Create a new draft version of a policy
 */
export async function createPolicyVersion(
  params: CreateVersionParams
): Promise<PolicyVersion> {
  const supabase = createServerClient();

  // Use the database function to create version
  const { data, error } = await supabase.rpc('create_policy_version', {
    p_policy_id: params.policy_id,
    p_created_by: params.created_by,
    p_change_summary: params.change_summary || null,
    p_change_type: params.change_type || 'update',
  });

  if (error) throw error;

  // Fetch the created version
  const version = await getPolicyVersion(data);
  if (!version) {
    throw new Error('Failed to fetch created version');
  }

  return version;
}

/**
 * Get a policy version by ID
 */
export async function getPolicyVersion(
  versionId: string
): Promise<PolicyVersion | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('winter_org_policy_versions')
    .select('*')
    .eq('id', versionId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data as PolicyVersion;
}

/**
 * Get the current published version for a policy
 */
export async function getCurrentVersion(
  policyId: string
): Promise<PolicyVersion | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('winter_org_policy_versions')
    .select('*')
    .eq('policy_id', policyId)
    .eq('state', 'published')
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data as PolicyVersion;
}

/**
 * Get the draft version for a policy (if any)
 */
export async function getDraftVersion(
  policyId: string
): Promise<PolicyVersion | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('winter_org_policy_versions')
    .select('*')
    .eq('policy_id', policyId)
    .eq('state', 'draft')
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data as PolicyVersion;
}

/**
 * List all versions for a policy
 */
export async function listPolicyVersions(
  params: ListVersionsParams
): Promise<PaginatedResult<PolicyVersion>> {
  const supabase = createServerClient();

  const limit = params.limit || 50;
  const offset = params.offset || 0;

  let query = supabase
    .from('winter_org_policy_versions')
    .select('*', { count: 'exact' })
    .eq('policy_id', params.policy_id)
    .order('version', { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.state) {
    query = query.eq('state', params.state);
  }

  const { data, error, count } = await query;

  if (error) {
    if (error.code === '42P01') {
      return { data: [], total: 0, limit, offset, has_more: false };
    }
    throw error;
  }

  return {
    data: (data || []) as PolicyVersion[],
    total: count || 0,
    limit,
    offset,
    has_more: (count || 0) > offset + limit,
  };
}

/**
 * Update a draft version
 */
export async function updateDraftVersion(
  params: UpdateDraftParams,
  updatedBy: string
): Promise<PolicyVersion> {
  const supabase = createServerClient();

  // Verify version is in draft state
  const current = await getPolicyVersion(params.version_id);
  if (!current) {
    throw new Error('Version not found');
  }
  if (current.state !== 'draft') {
    throw new Error('Can only update draft versions');
  }

  // Build update object
  const updates: Record<string, unknown> = {};

  if (params.name !== undefined) updates.name = params.name;
  if (params.description !== undefined) updates.description = params.description;
  if (params.scope !== undefined) updates.scope = params.scope;
  if (params.priority !== undefined) updates.priority = params.priority;
  if (params.change_summary !== undefined) updates.change_summary = params.change_summary;

  if (params.config) {
    updates.config = {
      ...current.config,
      ...params.config,
    };
  }

  const { data, error } = await supabase
    .from('winter_org_policy_versions')
    .update(updates)
    .eq('id', params.version_id)
    .select()
    .single();

  if (error) throw error;

  return data as PolicyVersion;
}

/**
 * Delete a draft version
 */
export async function deleteDraftVersion(
  versionId: string,
  deletedBy: string
): Promise<void> {
  const supabase = createServerClient();

  // Verify version is in draft state
  const version = await getPolicyVersion(versionId);
  if (!version) {
    throw new Error('Version not found');
  }
  if (version.state !== 'draft') {
    throw new Error('Can only delete draft versions');
  }

  const { error } = await supabase
    .from('winter_org_policy_versions')
    .delete()
    .eq('id', versionId);

  if (error) throw error;

  // Clear draft reference on policy
  await supabase
    .from('winter_org_policies')
    .update({ draft_version_id: null })
    .eq('id', version.policy_id)
    .eq('draft_version_id', versionId);
}

// ============================================
// Version Lifecycle Operations
// ============================================

/**
 * Publish a draft version
 */
export async function publishVersion(
  versionId: string,
  publishedBy: string
): Promise<PolicyVersion> {
  const supabase = createServerClient();

  // Use the database function to publish
  const { data, error } = await supabase.rpc('publish_policy_version', {
    p_version_id: versionId,
    p_published_by: publishedBy,
  });

  if (error) throw error;
  if (!data) {
    throw new Error('Failed to publish version');
  }

  // Fetch the updated version
  const version = await getPolicyVersion(versionId);
  if (!version) {
    throw new Error('Failed to fetch published version');
  }

  // Log audit event
  await logAuditEvent({
    user_id: publishedBy,
    organization_id: version.organization_id,
    action: 'policy.version_publish',
    resource_type: 'policies',
    resource_id: version.policy_id,
    details: {
      version_id: versionId,
      version: version.version,
    },
    status: 'success',
  });

  return version;
}

/**
 * Rollback to a previous version
 */
export async function rollbackToVersion(
  params: RollbackParams
): Promise<PolicyVersion> {
  const supabase = createServerClient();

  // Use the database function to rollback
  const { data, error } = await supabase.rpc('rollback_policy_to_version', {
    p_policy_id: params.policy_id,
    p_target_version: params.target_version,
    p_rolled_back_by: params.rolled_back_by,
    p_reason: params.reason || null,
  });

  if (error) throw error;

  // Fetch the created rollback version
  const version = await getPolicyVersion(data);
  if (!version) {
    throw new Error('Failed to fetch rollback version');
  }

  // Log audit event
  await logAuditEvent({
    user_id: params.rolled_back_by,
    organization_id: version.organization_id,
    action: 'policy.version_rollback',
    resource_type: 'policies',
    resource_id: params.policy_id,
    details: {
      target_version: params.target_version,
      new_version_id: data,
      reason: params.reason,
    },
    status: 'success',
  });

  return version;
}

// ============================================
// Version Comparison
// ============================================

/**
 * Compare two policy versions
 */
export async function compareVersions(
  versionIdA: string,
  versionIdB: string
): Promise<PolicyVersionDiff> {
  const supabase = createServerClient();

  // Use the database function to compare
  const { data, error } = await supabase.rpc('compare_policy_versions', {
    p_version_id_a: versionIdA,
    p_version_id_b: versionIdB,
  });

  if (error) throw error;

  return data as PolicyVersionDiff;
}

/**
 * Compare a version with the current published version
 */
export async function compareWithCurrent(
  versionId: string
): Promise<PolicyVersionDiff | null> {
  const version = await getPolicyVersion(versionId);
  if (!version) {
    throw new Error('Version not found');
  }

  const current = await getCurrentVersion(version.policy_id);
  if (!current) {
    return null; // No current published version to compare with
  }

  if (current.id === versionId) {
    return null; // Same version
  }

  return compareVersions(current.id, versionId);
}

// ============================================
// Version History
// ============================================

/**
 * Get version history for a policy with optional filtering
 */
export async function getVersionHistory(
  policyId: string,
  options?: {
    includeArchived?: boolean;
    includeDrafts?: boolean;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }
): Promise<PaginatedResult<PolicyVersion>> {
  const supabase = createServerClient();

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  let query = supabase
    .from('winter_org_policy_versions')
    .select('*', { count: 'exact' })
    .eq('policy_id', policyId)
    .order('version', { ascending: false })
    .range(offset, offset + limit - 1);

  // Filter by state
  const states: PolicyVersionState[] = ['published'];
  if (options?.includeArchived) states.push('archived');
  if (options?.includeDrafts) states.push('draft');
  query = query.in('state', states);

  // Filter by date range
  if (options?.startDate) {
    query = query.gte('created_at', options.startDate.toISOString());
  }
  if (options?.endDate) {
    query = query.lte('created_at', options.endDate.toISOString());
  }

  const { data, error, count } = await query;

  if (error) {
    if (error.code === '42P01') {
      return { data: [], total: 0, limit, offset, has_more: false };
    }
    throw error;
  }

  return {
    data: (data || []) as PolicyVersion[],
    total: count || 0,
    limit,
    offset,
    has_more: (count || 0) > offset + limit,
  };
}

/**
 * Get the version that was active at a specific point in time
 */
export async function getVersionAtTime(
  policyId: string,
  timestamp: Date
): Promise<PolicyVersion | null> {
  const supabase = createServerClient();

  // Find the published version that was active at the given time
  const { data, error } = await supabase
    .from('winter_org_policy_versions')
    .select('*')
    .eq('policy_id', policyId)
    .eq('state', 'archived')
    .lte('published_at', timestamp.toISOString())
    .or(`superseded_at.gt.${timestamp.toISOString()},superseded_at.is.null`)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No archived version found, check current
      const current = await getCurrentVersion(policyId);
      if (current && current.published_at) {
        const publishedAt = new Date(current.published_at);
        if (publishedAt <= timestamp) {
          return current;
        }
      }
      return null;
    }
    throw error;
  }

  return data as PolicyVersion;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Check if a policy has uncommitted changes (draft version)
 */
export async function hasDraftChanges(policyId: string): Promise<boolean> {
  const draft = await getDraftVersion(policyId);
  return draft !== null;
}

/**
 * Get summary of changes between consecutive versions
 */
export async function getVersionChangeSummary(
  policyId: string,
  limit?: number
): Promise<Array<{
  version: number;
  change_type: PolicyVersionChangeType;
  change_summary: string | null;
  created_at: string;
  created_by: string | null;
}>> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('winter_org_policy_versions')
    .select('version, change_type, change_summary, created_at, created_by')
    .eq('policy_id', policyId)
    .in('state', ['published', 'archived'])
    .order('version', { ascending: false })
    .limit(limit || 10);

  if (error) throw error;

  return (data || []) as Array<{
    version: number;
    change_type: PolicyVersionChangeType;
    change_summary: string | null;
    created_at: string;
    created_by: string | null;
  }>;
}

/**
 * Discard all draft changes for a policy
 */
export async function discardDraftChanges(
  policyId: string,
  discardedBy: string
): Promise<void> {
  const draft = await getDraftVersion(policyId);
  if (draft) {
    await deleteDraftVersion(draft.id, discardedBy);
  }
}
