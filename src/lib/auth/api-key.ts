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
    .select('id, user_id, scopes, expires_at')
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

  if (!profile?.organization_id) {
    return {
      valid: false,
      error: 'User has no organization',
    };
  }

  return {
    valid: true,
    userId: keyData.user_id,
    organizationId: profile.organization_id,
    scopes: keyData.scopes || [],
    keyId: keyData.id,
    plan: profile.plan || 'free',
  };
}
