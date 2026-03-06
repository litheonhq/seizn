import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import { buildBasicApiKeyInsertPayload, generateApiKey } from '@/lib/api-key';
import { sendEmail } from '@/lib/email';
import { apiKeyCreatedEmail } from '@/lib/email/templates';
import { logServerError } from '@/lib/server/logger';
import {
  AuthErrors,
  ValidationErrors,
  ServerErrors,
  RateLimitErrors,
} from '@/lib/api-error';

// GET /api/dashboard/keys - List user's API keys (NextAuth session)
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user?.id) {
      return AuthErrors.unauthorized('API keys');
    }

    const supabase = createServerClient();

    const { data: keys, error } = await supabase
      .from('api_keys')
      .select('id, name, key_prefix, scopes, last_used_at, expires_at, is_active, created_at')
      .eq('user_id', user.id)
      .eq('is_active', true)
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

// POST /api/dashboard/keys - Create a new API key (NextAuth session)
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user?.id) {
      return AuthErrors.unauthorized('API keys');
    }

    const body = await request.json();
    const name = body.name || 'Default Key';

    const supabase = createServerClient();

    // Check user's plan limits
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();

    // Count existing keys
    const { count } = await supabase
      .from('api_keys')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
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
      return RateLimitErrors.quotaExceeded('monthly', plan);
    }

    // Generate new API key
    const { key, hash, prefix } = generateApiKey();

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
          metadata: {
            source: 'dashboard_keys',
          },
        })
      )
      .select('id, name, key_prefix, scopes, created_at')
      .single();

    if (insertError) {
      logServerError('Create key error', insertError);
      return ServerErrors.database('create_key');
    }

    // Send API key created notification email (non-blocking)
    if (user.email) {
      sendEmail({
        to: user.email,
        subject: `New API Key Created: ${name}`,
        html: apiKeyCreatedEmail(name, prefix),
      }).catch((error) => logServerError('Failed to send API key notification', error));
    }

    return NextResponse.json({
      success: true,
      key: key,
      keyRecord: keyRecord,
      message: 'Save this key securely. It will not be shown again.',
    });
  } catch (error) {
    logServerError('Create key error', error);
    return ServerErrors.internal('create_key');
  }
}

// DELETE /api/dashboard/keys - Revoke an API key (NextAuth session)
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user?.id) {
      return AuthErrors.unauthorized('API keys');
    }

    const { searchParams } = new URL(request.url);
    const keyId = searchParams.get('id');

    if (!keyId) {
      return ValidationErrors.missingField('id');
    }

    const supabase = createServerClient();

    const { error } = await supabase
      .from('api_keys')
      .update({ is_active: false })
      .eq('id', keyId)
      .eq('user_id', user.id);

    if (error) {
      logServerError('Revoke key error', error);
      return ServerErrors.database('revoke_key');
    }

    return NextResponse.json({
      success: true,
      message: 'API key revoked',
    });
  } catch (error) {
    logServerError('Revoke key error', error);
    return ServerErrors.internal('revoke_key');
  }
}
