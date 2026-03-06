import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import { buildBasicApiKeyInsertPayload, generateApiKey } from '@/lib/api-key';
import {
  AuthErrors,
  ValidationErrors,
  ServerErrors,
  RateLimitErrors,
} from '@/lib/api-error';
import { logAuditEvent, getAuditContext, AuditActions } from '@/lib/audit';
import { checkIpRateLimitAsync } from '@/lib/rate-limit';
import { logServerError } from '@/lib/server/logger';

/** Session freshness window for sensitive key operations (15 minutes) */
const SESSION_FRESHNESS_MS = 15 * 60 * 1000;

/** Check if user session is fresh enough for sensitive operations */
function isSessionFresh(lastSignInAt: string | undefined): boolean {
  if (!lastSignInAt) return false;
  const signInTime = new Date(lastSignInAt).getTime();
  return Date.now() - signInTime < SESSION_FRESHNESS_MS;
}

// GET /api/keys - List user's API keys
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return AuthErrors.unauthorized('API keys');
    }

    const supabase = createServerClient();

    const { data: keys, error } = await supabase
      .from('api_keys')
      .select('id, name, key_prefix, scopes, last_used_at, expires_at, is_active, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      logServerError('List keys error', error);
      return ServerErrors.database('list_keys');
    }

    return NextResponse.json({
      success: true,
      keys: keys || [],
    });
  } catch (error) {
    logServerError('List keys error', error);
    return ServerErrors.internal('list_keys');
  }
}

// POST /api/keys - Create a new API key
export async function POST(request: NextRequest) {
  try {
    // IP rate limit for key creation (stricter: 5/min)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const ipLimit = await checkIpRateLimitAsync(ip);
    if (!ipLimit.allowed) {
      return RateLimitErrors.rateLimitExceeded();
    }

    const user = await getRequestUser(request);
    if (!user) {
      return AuthErrors.unauthorized('API keys');
    }

    // Warn if session is stale (not blocking, but logged)
    const sessionFresh = isSessionFresh(user.lastSignInAt ?? undefined);

    const body = await request.json();
    const name = body.name || 'Default Key';

    // Validate name length
    if (typeof name !== 'string' || name.length > 100) {
      return ValidationErrors.invalidField('name', 'Key name must be 1-100 characters');
    }

    const supabase = createServerClient();

    // Check user's plan limits
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single() as { data: { plan: string } | null };

    // Count existing keys
    const { count } = await supabase
      .from('api_keys')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true);

    const plan = profile?.plan || 'free';
    const keyLimit = plan === 'free' ? 2 : plan === 'pro' ? 10 : 100;

    if ((count || 0) >= keyLimit) {
      return RateLimitErrors.quotaExceeded('monthly', plan);
    }

    // Generate new API key
    const { key, hash, prefix } = generateApiKey();

    // Set expiration date (90 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    // Insert key record
    const { data: keyRecord, error: insertError } = await supabase
      .from('api_keys')
      .insert(
        buildBasicApiKeyInsertPayload({
          userId: user.id,
          name,
          hash,
          prefix,
          scopes: ['memory:read', 'memory:write'],
          expiresAt: expiresAt.toISOString(),
          metadata: {
            source: 'api_keys_route',
          },
        })
      )
      .select('id, name, key_prefix, scopes, created_at')
      .single();

    if (insertError) {
      logServerError('Create key error', insertError);
      return ServerErrors.database('create_key');
    }

    // Audit log: API key created
    logAuditEvent(
      {
        userId: user.id,
        action: AuditActions.API_KEY_CREATE,
        resourceType: 'api_key',
        resourceId: keyRecord.id,
        details: {
          key_prefix: prefix,
          key_name: name,
          expires_at: expiresAt.toISOString(),
          session_fresh: sessionFresh,
        },
        status: 'success',
      },
      getAuditContext(request)
    ).catch((error) => logServerError('API key create audit error', error));

    // Return the full key only once (never stored/shown again)
    return NextResponse.json({
      success: true,
      key: key, // Full key - show only once!
      keyRecord: keyRecord,
      message: 'Save this key securely. It will not be shown again.',
    });
  } catch (error) {
    logServerError('Create key error', error);
    return ServerErrors.internal('create_key');
  }
}

// DELETE /api/keys - Revoke an API key
export async function DELETE(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return AuthErrors.unauthorized('API keys');
    }

    const { searchParams } = new URL(request.url);
    const keyId = searchParams.get('id');

    if (!keyId) {
      return ValidationErrors.missingField('id');
    }

    // Validate UUID format to prevent injection
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(keyId)) {
      return ValidationErrors.invalidField('id', 'Invalid key ID format');
    }

    const supabase = createServerClient();

    // Get key info before revoking (for audit log)
    const { data: keyBefore } = await supabase
      .from('api_keys')
      .select('key_prefix, name')
      .eq('id', keyId)
      .eq('user_id', user.id)
      .single();

    const { error } = await supabase
      .from('api_keys')
      .update({ is_active: false })
      .eq('id', keyId)
      .eq('user_id', user.id);

    if (error) {
      logServerError('Revoke key error', error);
      return ServerErrors.database('revoke_key');
    }

    // Audit log: API key revoked
    logAuditEvent(
      {
        userId: user.id,
        action: AuditActions.API_KEY_REVOKE,
        resourceType: 'api_key',
        resourceId: keyId,
        details: {
          key_prefix: keyBefore?.key_prefix,
          key_name: keyBefore?.name,
        },
        status: 'success',
      },
      getAuditContext(request)
    ).catch((error) => logServerError('API key revoke audit error', error));

    return NextResponse.json({
      success: true,
      message: 'API key revoked',
    });
  } catch (error) {
    logServerError('Revoke key error', error);
    return ServerErrors.internal('revoke_key');
  }
}
