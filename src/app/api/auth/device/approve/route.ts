import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { auth } from '@/lib/auth';
import crypto from 'crypto';

// POST /api/auth/device/approve - Approve or deny a device auth request
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
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
        .update({ status: 'denied', user_id: session.user.id })
        .eq('id', authCode.id);

      return NextResponse.json({ status: 'denied' });
    }

    // Approve: create an API key for this device
    const rawKey = `szn_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 12) + '...';

    const { data: apiKey, error: keyError } = await supabase
      .from('api_keys')
      .insert({
        user_id: session.user.id,
        name: `MCP Device (${user_code})`,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        permissions: ['memory:read', 'memory:write', 'memory:delete'],
      })
      .select('id')
      .single();

    if (keyError || !apiKey) {
      console.error('API key creation error:', keyError);
      return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
    }

    // Update device auth record
    await supabase
      .from('device_auth_codes')
      .update({
        status: 'approved',
        user_id: session.user.id,
        api_key_id: apiKey.id,
        access_token: rawKey,
        approved_at: new Date().toISOString(),
      })
      .eq('id', authCode.id);

    return NextResponse.json({ status: 'approved' });
  } catch (error) {
    console.error('Device approve error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
