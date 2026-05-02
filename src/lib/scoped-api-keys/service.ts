/**
 * Scoped API Keys Service
 *
 * Service layer for creating and managing scoped API keys.
 */

import { createServerClient } from '../supabase';
import { generateApiKey, hashApiKey } from '../api-key';
import type { Permission } from '../rbac/types';
import {
  ScopedApiKey,
  ApiKeyScope,
  IpRestriction,
  CreateScopedApiKeyRequest,
  CreateScopedApiKeyResponse,
  ListScopedKeysOptions,
  ScopeLevel,
  ScopedApiKeyDbRecord,
  dbRecordToScopedApiKey,
} from './types';
import { validateScopeConfig, validateIpRestriction } from './validation';

async function assertOrganizationScopeAccess(
  userId: string,
  scope: ApiKeyScope
): Promise<void> {
  if (scope.level === 'user') {
    if (scope.organizationId || scope.projectIds?.length) {
      throw new Error('User-level API keys cannot be bound to an organization or project');
    }
    return;
  }

  if (!scope.organizationId) {
    throw new Error('Organization-scoped API keys require an organization ID');
  }

  const supabase = createServerClient();
  const { data: membership, error } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', scope.organizationId)
    .eq('user_id', userId)
    .single();

  if (error || !membership) {
    throw new Error('User is not a member of the specified organization');
  }

  if (scope.actions.includes('admin') && !['owner', 'admin'].includes(membership.role)) {
    throw new Error('Only organization admins can create keys with admin permissions');
  }
}

/**
 * Create a new scoped API key
 */
export async function createScopedApiKey(
  userId: string,
  request: CreateScopedApiKeyRequest
): Promise<CreateScopedApiKeyResponse> {
  // Validate scope configuration
  const scopeValidation = validateScopeConfig(request.scope as ApiKeyScope);
  if (!scopeValidation.valid) {
    throw new Error(`Invalid scope configuration: ${scopeValidation.errors.join(', ')}`);
  }

  // Validate IP restriction if provided
  if (request.ipRestriction) {
    const ipValidation = validateIpRestriction(request.ipRestriction);
    if (!ipValidation.valid) {
      throw new Error(`Invalid IP restriction: ${ipValidation.errors.join(', ')}`);
    }
  }

  const supabase = createServerClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .single();

  // Count existing active keys
  const { count } = await supabase
    .from('api_keys')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_active', true);

  const plan = profile?.plan || 'free';
  const keyLimits: Record<string, number> = {
    free: 2,
    plus: 5,
    pro: 10,
    enterprise: 100,
  };
  const keyLimit = keyLimits[plan] || 2;

  if ((count || 0) >= keyLimit) {
    throw new Error(`API key limit reached (${keyLimit} keys for ${plan} plan)`);
  }

  await assertOrganizationScopeAccess(userId, request.scope as ApiKeyScope);

  // Generate new API key
  const { key, hash, prefix } = generateApiKey();

  // Calculate expiration date
  const expiresInDays = request.expiresInDays ?? 90;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  // Build scope config
  const scopeConfig: ApiKeyScope = {
    level: request.scope.level,
    organizationId: request.scope.level === 'user' ? undefined : request.scope.organizationId,
    projectIds: request.scope.level === 'project' ? request.scope.projectIds : undefined,
    actions: request.scope.actions,
    customPermissions: request.scope.customPermissions as Permission[] | undefined,
    deniedPermissions: request.scope.deniedPermissions as Permission[] | undefined,
  };

  // Insert key record
  const { data: keyRecord, error: insertError } = await supabase
    .from('api_keys')
    .insert({
      user_id: userId,
      organization_id: scopeConfig.organizationId || null,
      name: request.name,
      key_hash: hash,
      key_prefix: prefix,
      scope_config: scopeConfig,
      ip_restriction: request.ipRestriction || null,
      rate_limit_override: request.rateLimitOverride || null,
      description: request.description || null,
      scopes: mapActionsToLegacyScopes(request.scope.actions),
      is_active: true,
      expires_at: expiresAt.toISOString(),
    })
    .select(`
      id,
      user_id,
      name,
      key_prefix,
      organization_id,
      scope_config,
      ip_restriction,
      rate_limit_override,
      description,
      metadata,
      last_used_at,
      expires_at,
      is_active,
      created_at
    `)
    .single();

  if (insertError) {
    console.error('Create scoped key error:', insertError);
    throw new Error(`Failed to create API key: ${insertError.message}`);
  }

  return {
    key,
    keyRecord: dbRecordToScopedApiKey(keyRecord as ScopedApiKeyDbRecord),
    message: 'Save this key securely. It will not be shown again.',
  };
}

/**
 * List scoped API keys for a user
 */
export async function listScopedApiKeys(
  userId: string,
  options?: ListScopedKeysOptions
): Promise<ScopedApiKey[]> {
  const supabase = createServerClient();

  let query = supabase
    .from('api_keys')
    .select(`
      id,
      user_id,
      name,
      key_prefix,
      organization_id,
      scope_config,
      ip_restriction,
      rate_limit_override,
      description,
      metadata,
      last_used_at,
      expires_at,
      is_active,
      created_at
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  // Apply filters
  if (!options?.includeInactive) {
    query = query.eq('is_active', true);
  }

  if (options?.organizationId) {
    query = query.eq('organization_id', options.organizationId);
  }

  if (options?.scopeLevel) {
    query = query.eq('scope_config->>level', options.scopeLevel);
  }

  if (options?.offset) {
    query = query.range(options.offset, (options.offset || 0) + (options.limit || 50) - 1);
  } else if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('List scoped keys error:', error);
    throw new Error(`Failed to list API keys: ${error.message}`);
  }

  return (data || []).map(record => dbRecordToScopedApiKey(record as ScopedApiKeyDbRecord));
}

/**
 * Get a scoped API key by ID
 */
export async function getScopedApiKey(
  userId: string,
  keyId: string
): Promise<ScopedApiKey | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('api_keys')
    .select(`
      id,
      user_id,
      name,
      key_prefix,
      organization_id,
      scope_config,
      ip_restriction,
      rate_limit_override,
      description,
      metadata,
      last_used_at,
      expires_at,
      is_active,
      created_at
    `)
    .eq('id', keyId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return dbRecordToScopedApiKey(data as ScopedApiKeyDbRecord);
}

/**
 * Update a scoped API key's scope or restrictions
 */
export async function updateScopedApiKey(
  userId: string,
  keyId: string,
  updates: {
    name?: string;
    description?: string;
    scope?: Partial<ApiKeyScope>;
    ipRestriction?: IpRestriction | null;
    rateLimitOverride?: number | null;
  }
): Promise<ScopedApiKey> {
  const supabase = createServerClient();

  // Fetch current key
  const { data: currentKey, error: fetchError } = await supabase
    .from('api_keys')
    .select('*')
    .eq('id', keyId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !currentKey) {
    throw new Error('API key not found');
  }

  // Build update object
  const updateData: Record<string, unknown> = {};

  if (updates.name !== undefined) {
    updateData.name = updates.name;
  }

  if (updates.description !== undefined) {
    updateData.description = updates.description;
  }

  if (updates.scope !== undefined) {
    const newScopeConfig = {
      ...(currentKey.scope_config || {}),
      ...updates.scope,
    } as ApiKeyScope;

    if (newScopeConfig.level === 'user') {
      delete newScopeConfig.organizationId;
      delete newScopeConfig.projectIds;
    } else if (newScopeConfig.level === 'organization') {
      delete newScopeConfig.projectIds;
    }

    const scopeValidation = validateScopeConfig(newScopeConfig);
    if (!scopeValidation.valid) {
      throw new Error(`Invalid scope configuration: ${scopeValidation.errors.join(', ')}`);
    }

    await assertOrganizationScopeAccess(userId, newScopeConfig);

    updateData.scope_config = newScopeConfig;
    updateData.organization_id = newScopeConfig.organizationId || null;
  }

  if (updates.ipRestriction !== undefined) {
    if (updates.ipRestriction) {
      const ipValidation = validateIpRestriction(updates.ipRestriction);
      if (!ipValidation.valid) {
        throw new Error(`Invalid IP restriction: ${ipValidation.errors.join(', ')}`);
      }
    }
    updateData.ip_restriction = updates.ipRestriction;
  }

  if (updates.rateLimitOverride !== undefined) {
    updateData.rate_limit_override = updates.rateLimitOverride;
  }

  // Update the key
  const { data, error } = await supabase
    .from('api_keys')
    .update(updateData)
    .eq('id', keyId)
    .eq('user_id', userId)
    .select(`
      id,
      user_id,
      name,
      key_prefix,
      organization_id,
      scope_config,
      ip_restriction,
      rate_limit_override,
      description,
      metadata,
      last_used_at,
      expires_at,
      is_active,
      created_at
    `)
    .single();

  if (error) {
    console.error('Update scoped key error:', error);
    throw new Error(`Failed to update API key: ${error.message}`);
  }

  return dbRecordToScopedApiKey(data as ScopedApiKeyDbRecord);
}

/**
 * Revoke (deactivate) a scoped API key
 */
export async function revokeScopedApiKey(
  userId: string,
  keyId: string
): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', keyId)
    .eq('user_id', userId);

  if (error) {
    console.error('Revoke scoped key error:', error);
    throw new Error(`Failed to revoke API key: ${error.message}`);
  }
}

/**
 * Delete a scoped API key permanently
 */
export async function deleteScopedApiKey(
  userId: string,
  keyId: string
): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('api_keys')
    .delete()
    .eq('id', keyId)
    .eq('user_id', userId);

  if (error) {
    console.error('Delete scoped key error:', error);
    throw new Error(`Failed to delete API key: ${error.message}`);
  }
}

/**
 * Rotate a scoped API key (create new key with same settings, revoke old)
 */
export async function rotateScopedApiKey(
  userId: string,
  keyId: string
): Promise<CreateScopedApiKeyResponse> {
  const supabase = createServerClient();

  // Fetch current key
  const currentKey = await getScopedApiKey(userId, keyId);
  if (!currentKey) {
    throw new Error('API key not found');
  }

  // Generate new key
  const { key, hash, prefix } = generateApiKey();

  // Calculate new expiration (same duration as original)
  const expiresAt = new Date();
  if (currentKey.expiresAt) {
    const originalDuration = currentKey.expiresAt.getTime() - currentKey.createdAt.getTime();
    expiresAt.setTime(expiresAt.getTime() + originalDuration);
  } else {
    expiresAt.setDate(expiresAt.getDate() + 90);
  }

  // Create new key with same settings
  const { data: newKeyRecord, error: insertError } = await supabase
    .from('api_keys')
    .insert({
      user_id: userId,
      organization_id: currentKey.scope.organizationId || null,
      name: `${currentKey.name} (rotated)`,
      key_hash: hash,
      key_prefix: prefix,
      scope_config: currentKey.scope,
      ip_restriction: currentKey.ipRestriction || null,
      rate_limit_override: currentKey.rateLimitOverride || null,
      description: currentKey.description || null,
      metadata: {
        ...(currentKey.metadata || {}),
        rotatedFrom: keyId,
        rotatedAt: new Date().toISOString(),
      },
      scopes: mapActionsToLegacyScopes(currentKey.scope.actions),
      is_active: true,
      expires_at: expiresAt.toISOString(),
    })
    .select(`
      id,
      user_id,
      name,
      key_prefix,
      organization_id,
      scope_config,
      ip_restriction,
      rate_limit_override,
      description,
      metadata,
      last_used_at,
      expires_at,
      is_active,
      created_at
    `)
    .single();

  if (insertError) {
    console.error('Rotate key - create new key error:', insertError);
    throw new Error(`Failed to create rotated key: ${insertError.message}`);
  }

  // Revoke old key
  await revokeScopedApiKey(userId, keyId);

  return {
    key,
    keyRecord: dbRecordToScopedApiKey(newKeyRecord as ScopedApiKeyDbRecord),
    message: 'Key rotated successfully. Save the new key securely. It will not be shown again.',
  };
}

/**
 * Get API keys for an organization (admin only)
 */
export async function getOrganizationApiKeys(
  userId: string,
  organizationId: string
): Promise<ScopedApiKey[]> {
  const supabase = createServerClient();

  // Verify user is admin/owner of the organization
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw new Error('Only organization admins can view organization API keys');
  }

  const { data, error } = await supabase
    .from('api_keys')
    .select(`
      id,
      user_id,
      name,
      key_prefix,
      organization_id,
      scope_config,
      ip_restriction,
      rate_limit_override,
      description,
      metadata,
      last_used_at,
      expires_at,
      is_active,
      created_at
    `)
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Get org keys error:', error);
    throw new Error(`Failed to list organization API keys: ${error.message}`);
  }

  return (data || []).map(record => dbRecordToScopedApiKey(record as ScopedApiKeyDbRecord));
}

/**
 * Map action types to legacy scopes for backward compatibility
 */
function mapActionsToLegacyScopes(actions: string[]): string[] {
  const scopes: string[] = [];

  if (actions.includes('read') || actions.includes('write') || actions.includes('admin')) {
    scopes.push('memory:read');
    scopes.push('graph:read');
    scopes.push('fall:read');
  }

  if (actions.includes('write') || actions.includes('admin')) {
    scopes.push('memory:write');
    scopes.push('graph:write');
    scopes.push('fall:write');
  }

  if (actions.includes('admin')) {
    scopes.push('memory:delete');
    scopes.push('graph:delete');
    scopes.push('fall:delete');
    scopes.push('settings:write');
  }

  return scopes;
}
