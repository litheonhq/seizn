/**
 * Example: Applying the new error system to /api/keys route
 *
 * This example shows how to migrate the API keys management endpoints
 * to use the new standardized error system.
 *
 * @example
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { generateApiKey } from '@/lib/api-key';
import { getSupabaseUserFromBearer } from '@/lib/api/request-user';
import {
  AuthErrors,
  ValidationErrors,
  ResourceErrors,
  RateLimitErrors,
  ExternalErrors,
  InternalErrors,
  withErrorHandler,
  createSuccessResponse,
  generateTraceId,
  SEIZN_ERROR_CODES,
  createApiError,
} from '@/lib/errors';

// ============================================
// GET /api/keys - List user's API keys
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
  const traceId = generateTraceId();
  const startTime = Date.now();

  // 1. Authenticate using session token
  const user = await getSupabaseUserFromBearer(request);
  if (!user) {
    return AuthErrors.accessDenied('API keys', traceId);
  }

  const supabase = createServerClient();

  // 2. Fetch user's API keys
  const { data: keys, error } = await supabase
    .from('api_keys')
    .select(
      'id, name, key_prefix, scopes, last_used_at, expires_at, is_active, created_at'
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(`[${traceId}] List keys error:`, error);
    return ExternalErrors.databaseError('list_api_keys', traceId);
  }

  // 3. Return success response
  const latencyMs = Date.now() - startTime;
  return createSuccessResponse(
    { keys: keys || [] },
    { count: keys?.length || 0 },
    traceId,
    latencyMs
  );
});

// ============================================
// POST /api/keys - Create a new API key
// ============================================

export const POST = withErrorHandler(async (request: NextRequest) => {
  const traceId = generateTraceId();
  const startTime = Date.now();

  // 1. Authenticate using session token
  const user = await getSupabaseUserFromBearer(request);
  if (!user) {
    return AuthErrors.accessDenied('API key creation', traceId);
  }

  // 2. Parse request body
  let body: { name?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is OK, we have a default name
  }

  const name = body.name || 'Default Key';

  // 3. Validate name length
  if (name.length > 100) {
    return ValidationErrors.fieldTooLong('name', 100, name.length, traceId);
  }

  const supabase = createServerClient();

  // 4. Check user's plan limits
  const { data: profile } = (await supabase
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .single()) as { data: { plan: string } | null };

  const plan = profile?.plan || 'free';

  // 5. Count existing active keys
  const { count } = await supabase
    .from('api_keys')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_active', true);

  const keyLimits: Record<string, number> = {
    free: 2,
    pro: 10,
    enterprise: 100,
  };
  const keyLimit = keyLimits[plan] || 2;

  // 6. Check if limit reached
  if ((count || 0) >= keyLimit) {
    return createApiError({
      code: SEIZN_ERROR_CODES.MONTHLY_QUOTA_EXCEEDED, // Reusing quota code for key limits
      message: `API key limit reached (${keyLimit} keys for ${plan} plan)`,
      status: 403,
      hint: `Upgrade to a higher plan or delete unused API keys. Current limit: ${keyLimit} keys.`,
      details: {
        plan,
        current_count: count || 0,
        limit: keyLimit,
      },
      traceId,
    });
  }

  // 7. Generate new API key
  const { key, hash, prefix } = generateApiKey();

  // 8. Set expiration date (90 days from now)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90);

  // 9. Insert key record
  const { data: keyRecord, error: insertError } = await supabase
    .from('api_keys')
    .insert({
      user_id: user.id,
      name: name,
      key_hash: hash,
      key_prefix: prefix,
      scopes: ['memory:read', 'memory:write'],
      is_active: true,
      expires_at: expiresAt.toISOString(),
    })
    .select('id, name, key_prefix, scopes, created_at, expires_at')
    .single();

  if (insertError) {
    console.error(`[${traceId}] Create key error:`, insertError);
    return ExternalErrors.databaseError('create_api_key', traceId);
  }

  // 10. Return success response with full key (shown only once)
  const latencyMs = Date.now() - startTime;
  return createSuccessResponse(
    {
      key, // Full key - show only once!
      key_record: keyRecord,
      warning: 'Save this key securely. It will not be shown again.',
    },
    { operation: 'create' },
    traceId,
    latencyMs
  );
});

// ============================================
// DELETE /api/keys - Revoke an API key
// ============================================

export const DELETE = withErrorHandler(async (request: NextRequest) => {
  const traceId = generateTraceId();
  const startTime = Date.now();

  // 1. Authenticate using session token
  const user = await getSupabaseUserFromBearer(request);
  if (!user) {
    return AuthErrors.accessDenied('API key revocation', traceId);
  }

  // 2. Get key ID from query params
  const { searchParams } = new URL(request.url);
  const keyId = searchParams.get('id');

  if (!keyId) {
    return ValidationErrors.missingField('id', traceId);
  }

  // 3. Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(keyId)) {
    return ValidationErrors.invalidFormat('id', 'UUID format', traceId);
  }

  const supabase = createServerClient();

  // 4. Check if key exists and belongs to user
  const { data: existingKey } = await supabase
    .from('api_keys')
    .select('id, is_active')
    .eq('id', keyId)
    .eq('user_id', user.id)
    .single();

  if (!existingKey) {
    return ResourceErrors.notFound('API key', keyId, traceId);
  }

  if (!existingKey.is_active) {
    return ResourceErrors.stateConflict(
      'API key is already revoked',
      'revoked',
      traceId
    );
  }

  // 5. Revoke the key (soft delete)
  const { error } = await supabase
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', keyId)
    .eq('user_id', user.id);

  if (error) {
    console.error(`[${traceId}] Revoke key error:`, error);
    return ExternalErrors.databaseError('revoke_api_key', traceId);
  }

  // 6. Return success response
  const latencyMs = Date.now() - startTime;
  return createSuccessResponse(
    {
      revoked: true,
      key_id: keyId,
    },
    { operation: 'revoke' },
    traceId,
    latencyMs
  );
});

// ============================================
// PATCH /api/keys/:id - Update API key name/scopes
// ============================================

export async function updateApiKey(
  request: NextRequest,
  keyId: string
): Promise<NextResponse> {
  const traceId = generateTraceId();
  const startTime = Date.now();

  // 1. Authenticate
  const user = await getSupabaseUserFromBearer(request);
  if (!user) {
    return AuthErrors.accessDenied('API key update', traceId);
  }

  // 2. Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(keyId)) {
    return ValidationErrors.invalidFormat('id', 'UUID format', traceId);
  }

  // 3. Parse request body
  let body: { name?: string; scopes?: string[] } = {};
  try {
    body = await request.json();
  } catch {
    return ValidationErrors.invalidJson(undefined, traceId);
  }

  // 4. Validate fields
  if (body.name !== undefined) {
    if (typeof body.name !== 'string') {
      return ValidationErrors.invalidFieldType('name', 'string', typeof body.name, traceId);
    }
    if (body.name.length > 100) {
      return ValidationErrors.fieldTooLong('name', 100, body.name.length, traceId);
    }
  }

  if (body.scopes !== undefined) {
    if (!Array.isArray(body.scopes)) {
      return ValidationErrors.invalidFieldType('scopes', 'array', typeof body.scopes, traceId);
    }

    const validScopes = ['memory:read', 'memory:write', 'memory:delete', 'admin'];
    for (const scope of body.scopes) {
      if (!validScopes.includes(scope)) {
        return ValidationErrors.invalidEnumValue('scopes', scope, validScopes, traceId);
      }
    }
  }

  const supabase = createServerClient();

  // 5. Check key exists
  const { data: existingKey } = await supabase
    .from('api_keys')
    .select('id, is_active')
    .eq('id', keyId)
    .eq('user_id', user.id)
    .single();

  if (!existingKey) {
    return ResourceErrors.notFound('API key', keyId, traceId);
  }

  if (!existingKey.is_active) {
    return ResourceErrors.stateConflict(
      'Cannot update a revoked API key',
      'revoked',
      traceId
    );
  }

  // 6. Build update object
  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.scopes !== undefined) updateData.scopes = body.scopes;

  if (Object.keys(updateData).length === 0) {
    return ValidationErrors.missingField('name or scopes', traceId);
  }

  // 7. Update the key
  const { data: updatedKey, error } = await supabase
    .from('api_keys')
    .update(updateData)
    .eq('id', keyId)
    .eq('user_id', user.id)
    .select('id, name, key_prefix, scopes, updated_at')
    .single();

  if (error) {
    console.error(`[${traceId}] Update key error:`, error);
    return ExternalErrors.databaseError('update_api_key', traceId);
  }

  // 8. Return success response
  const latencyMs = Date.now() - startTime;
  return createSuccessResponse(
    { key: updatedKey },
    { operation: 'update' },
    traceId,
    latencyMs
  );
}
