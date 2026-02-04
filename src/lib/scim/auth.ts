/**
 * SCIM Authentication
 *
 * Bearer token authentication for SCIM endpoints.
 * Each organization has its own SCIM token.
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { hashSCIMToken, generateSCIMToken } from './utils';

// ============================================
// Types
// ============================================

export interface SCIMAuthResult {
  success: true;
  organizationId: string;
  configId: string;
}

export interface SCIMAuthError {
  success: false;
  error: string;
  status: number;
}

export type SCIMAuthResponse = SCIMAuthResult | SCIMAuthError;

// ============================================
// Authentication
// ============================================

/**
 * Authenticate SCIM request using Bearer token
 * Token is organization-specific and stored hashed in database
 */
export async function authenticateSCIMRequest(
  request: NextRequest
): Promise<SCIMAuthResponse> {
  // Extract organization ID from query params or path
  const orgId = extractOrganizationId(request);
  if (!orgId) {
    return {
      success: false,
      error: 'Organization ID required. Use ?org=<org_id> query parameter.',
      status: 400,
    };
  }

  // Extract Bearer token
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return {
      success: false,
      error: 'Authorization header required',
      status: 401,
    };
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return {
      success: false,
      error: 'Invalid Authorization header format. Use: Bearer <token>',
      status: 401,
    };
  }

  const token = match[1];

  // Validate token against database
  const supabase = createServerClient();
  const tokenHash = hashSCIMToken(token);

  const { data: config, error } = await supabase
    .from('scim_configs')
    .select('id, organization_id, enabled')
    .eq('organization_id', orgId)
    .eq('token_hash', tokenHash)
    .single();

  if (error || !config) {
    return {
      success: false,
      error: 'Invalid SCIM token',
      status: 401,
    };
  }

  if (!config.enabled) {
    return {
      success: false,
      error: 'SCIM provisioning is disabled for this organization',
      status: 403,
    };
  }

  return {
    success: true,
    organizationId: config.organization_id,
    configId: config.id,
  };
}

/**
 * Extract organization ID from request
 * Supports query parameter or path parameter
 */
function extractOrganizationId(request: NextRequest): string | null {
  const url = new URL(request.url);

  // First, try query parameter
  const orgId = url.searchParams.get('org');
  if (orgId) {
    return orgId;
  }

  // Try to extract from path if using /api/scim/v2/org/{orgId}/...
  const pathMatch = url.pathname.match(/\/api\/scim\/v2\/org\/([^/]+)/);
  if (pathMatch) {
    return pathMatch[1];
  }

  return null;
}

// ============================================
// Token Management
// ============================================

/**
 * Create or regenerate SCIM token for an organization
 */
export async function createSCIMToken(
  organizationId: string,
  createdBy?: string
): Promise<{ token: string; configId: string }> {
  const supabase = createServerClient();
  const token = generateSCIMToken();
  const tokenHash = hashSCIMToken(token);

  // Check if config already exists
  const { data: existing } = await supabase
    .from('scim_configs')
    .select('id')
    .eq('organization_id', organizationId)
    .single();

  if (existing) {
    // Update existing config with new token
    const { data, error } = await supabase
      .from('scim_configs')
      .update({
        token_hash: tokenHash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to regenerate SCIM token: ${error.message}`);
    }

    return { token, configId: data.id };
  }

  // Create new config
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.seizn.com';
  const { data, error } = await supabase
    .from('scim_configs')
    .insert({
      organization_id: organizationId,
      token_hash: tokenHash,
      base_url: `${baseUrl}/api/scim/v2`,
      enabled: true,
      sync_users: true,
      sync_groups: true,
      auto_provision: true,
      auto_deprovision: true,
      default_role: 'member',
      created_by: createdBy,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create SCIM config: ${error.message}`);
  }

  return { token, configId: data.id };
}

/**
 * Get SCIM configuration for an organization
 */
export async function getSCIMConfig(organizationId: string) {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('scim_configs')
    .select('*')
    .eq('organization_id', organizationId)
    .single();

  if (error) {
    return null;
  }

  return {
    id: data.id,
    organizationId: data.organization_id,
    enabled: data.enabled,
    baseUrl: data.base_url,
    syncUsers: data.sync_users,
    syncGroups: data.sync_groups,
    autoProvision: data.auto_provision,
    autoDeprovision: data.auto_deprovision,
    defaultRole: data.default_role,
    groupRoleMapping: data.group_role_mapping,
    groupToOrgMapping: data.group_to_org_mapping,
    createdBy: data.created_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    lastSyncAt: data.last_sync_at,
  };
}

/**
 * Update SCIM configuration
 */
export async function updateSCIMConfig(
  organizationId: string,
  updates: {
    enabled?: boolean;
    syncUsers?: boolean;
    syncGroups?: boolean;
    autoProvision?: boolean;
    autoDeprovision?: boolean;
    defaultRole?: 'viewer' | 'member' | 'admin';
    groupRoleMapping?: Record<string, string>;
    groupToOrgMapping?: Record<string, string>;
  }
) {
  const supabase = createServerClient();

  const dbUpdates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.enabled !== undefined) dbUpdates.enabled = updates.enabled;
  if (updates.syncUsers !== undefined) dbUpdates.sync_users = updates.syncUsers;
  if (updates.syncGroups !== undefined) dbUpdates.sync_groups = updates.syncGroups;
  if (updates.autoProvision !== undefined) dbUpdates.auto_provision = updates.autoProvision;
  if (updates.autoDeprovision !== undefined) dbUpdates.auto_deprovision = updates.autoDeprovision;
  if (updates.defaultRole !== undefined) dbUpdates.default_role = updates.defaultRole;
  if (updates.groupRoleMapping !== undefined) dbUpdates.group_role_mapping = updates.groupRoleMapping;
  if (updates.groupToOrgMapping !== undefined) dbUpdates.group_to_org_mapping = updates.groupToOrgMapping;

  const { error } = await supabase
    .from('scim_configs')
    .update(dbUpdates)
    .eq('organization_id', organizationId);

  if (error) {
    throw new Error(`Failed to update SCIM config: ${error.message}`);
  }
}

/**
 * Revoke SCIM token (disable SCIM)
 */
export async function revokeSCIMToken(organizationId: string): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('scim_configs')
    .update({
      enabled: false,
      token_hash: null,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', organizationId);

  if (error) {
    throw new Error(`Failed to revoke SCIM token: ${error.message}`);
  }
}
