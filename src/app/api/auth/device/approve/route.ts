import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/api/request-user';
import { buildBasicApiKeyInsertPayload, generateApiKey, hashApiKey } from '@/lib/api-key';
import { verifyCsrfToken } from '@/lib/csrf';
import { createServerClient } from '@/lib/supabase';
import { logServerError } from '@/lib/server/logger';

// POST /api/auth/device/approve - Approve or deny a device auth request
export async function POST(request: NextRequest) {
  try {
    const csrfError = verifyCsrfToken(request);
    if (csrfError) return csrfError;

    const user = await getSessionUser();
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { user_code, action } = body as { user_code?: string; action?: 'approve' | 'deny' };

    if (!user_code || !action || !['approve', 'deny'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Look up the pending code
    const { data: authCode, error: lookupError } = await supabase
      .from('device_auth_codes')
      .select('id, status, expires_at')
      .eq('user_code', user_code.toUpperCase())
      .eq('status', 'pending')
      .single();

    if (lookupError || !authCode) {
      return NextResponse.json({ error: 'Code not found or already used' }, { status: 404 });
    }

    // Check expiry
    if (new Date(authCode.expires_at) < new Date()) {
      await supabase
        .from('device_auth_codes')
        .update({ status: 'expired' })
        .eq('id', authCode.id);
      return NextResponse.json({ error: 'Code expired' }, { status: 410 });
    }

    if (action === 'deny') {
      await supabase
        .from('device_auth_codes')
        .update({ status: 'denied', user_id: user.id })
        .eq('id', authCode.id);

      return NextResponse.json({ status: 'denied' });
    }

    // Approve: create an API key for this device
    const { key, hash, prefix } = generateApiKey();

    const { data: apiKey, error: keyError } = await supabase
      .from('api_keys')
      .insert(buildBasicApiKeyInsertPayload({
        userId: user.id,
        name: `MCP Device (${user_code})`,
        hash,
        prefix,
        scopes: ['memory:read', 'memory:write', 'memory:delete'],
        metadata: {
          source: 'device_auth',
          device_user_code: user_code.toUpperCase(),
        },
      }))
      .select('id')
      .single();

    if (keyError || !apiKey) {
      logServerError('API key creation error', keyError);
      return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
    }

    // Update device auth record
    await supabase
      .from('device_auth_codes')
      .update({
        status: 'approved',
        user_id: user.id,
        api_key_id: apiKey.id,
        access_token: key,
        access_token_hash: hashApiKey(key),
        approved_at: new Date().toISOString(),
      })
      .eq('id', authCode.id);

    return NextResponse.json({ status: 'approved' });
  } catch (error) {
    logServerError('Device approve error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
