/**
 * API Key Validation
 * Provides validateApiKey function for API route authentication
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '../supabase';
import { hashApiKey } from '../api-key';

export interface ValidateApiKeySuccess {
  valid: true;
  userId: string;
  organizationId: string;
  scopes: string[];
  keyId: string;
  plan: string;
}

export interface ValidateApiKeyFailure {
  valid: false;
  error: string;
}

export type ValidateApiKeyResult = ValidateApiKeySuccess | ValidateApiKeyFailure;

export function hasApiScope(scopes: string[] | undefined, requiredScope: string): boolean {
  if (!Array.isArray(scopes)) {
    return false;
  }

  if (scopes.includes('*') || scopes.includes('admin')) {
    return true;
  }

  if (scopes.includes(requiredScope)) {
    return true;
  }

  const namespace = requiredScope.split(':')[0];
  return scopes.includes(`${namespace}:*`);
}

export function hasAnyApiScope(
  scopes: string[] | undefined,
  requiredScopes: readonly string[]
): boolean {
  return requiredScopes.some((scope) => hasApiScope(scopes, scope));
}

type ApiKeyScopeConfig = {
  level?: 'user' | 'organization' | 'project';
  organizationId?: string;
};

function parseScopeConfig(value: unknown): ApiKeyScopeConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const config = value as Record<string, unknown>;
  return {
    level:
      config.level === 'user' || config.level === 'organization' || config.level === 'project'
        ? config.level
        : undefined,
    organizationId: typeof config.organizationId === 'string' ? config.organizationId : undefined,
  };
}

function isOrganizationScoped(scopeConfig: ApiKeyScopeConfig | null): boolean {
  return scopeConfig?.level === 'organization' || scopeConfig?.level === 'project';
}

/**
 * Extract API key from request headers
 * Supports both Bearer token and x-api-key
 */
function extractApiKey(request: NextRequest): string | null {
  // Try Authorization: Bearer first
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) {
      return match[1];
    }
  }

  // Fall back to x-api-key (legacy)
  const xApiKey = request.headers.get('x-api-key');
  if (xApiKey) {
    return xApiKey;
  }

  return null;
}

/**
 * Validate API key and return user/org info
 */
export async function validateApiKey(request: NextRequest): Promise<ValidateApiKeyResult> {
  const apiKey = extractApiKey(request);

  if (!apiKey) {
    return {
      valid: false,
      error: 'API key required. Use Authorization: Bearer <your-api-key> header.',
    };
  }

  const supabase = createServerClient();
  const keyHash = hashApiKey(apiKey);

  // Verify API key
  const { data: keyData, error: keyError } = await supabase
    .from('api_keys')
    .select('id, user_id, scopes, expires_at, organization_id, scope_config')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .single();

  if (keyError || !keyData) {
    return {
      valid: false,
      error: 'Invalid or inactive API key',
    };
  }

  // Check expiration
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return {
      valid: false,
      error: 'API key has expired',
    };
  }

  // Get user profile with organization
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, organization_id')
    .eq('id', keyData.user_id)
    .single();

  const scopeConfig = parseScopeConfig(keyData.scope_config);
  const keyOrganizationId = keyData.organization_id ?? scopeConfig?.organizationId ?? null;

  if (keyOrganizationId) {
    if (!isOrganizationScoped(scopeConfig)) {
      return {
        valid: false,
        error: 'API key organization binding is inconsistent with its scope',
      };
    }

    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', keyOrganizationId)
      .eq('user_id', keyData.user_id)
      .maybeSingle();

    if (membershipError || !membership) {
      return {
        valid: false,
        error: 'API key is not authorized for its organization',
      };
    }
  }

  const organizationId = keyOrganizationId ?? profile?.organization_id ?? null;

  if (!organizationId) {
    return {
      valid: false,
      error: 'User has no organization',
    };
  }

  return {
    valid: true,
    userId: keyData.user_id,
    organizationId,
    scopes: keyData.scopes || [],
    keyId: keyData.id,
    plan: profile?.plan || 'free',
  };
}
