import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { logServerError } from '@/lib/server/logger';

// POST /api/auth/device/token - Poll for device authorization result
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { device_code } = body as { device_code?: string };

    if (!device_code) {
      return NextResponse.json({ error: 'missing_device_code' }, { status: 400 });
    }

    const supabase = createServerClient();

    const { data: authCode, error } = await supabase
      .from('device_auth_codes')
      .select('*')
      .eq('device_code', device_code)
      .single();

    if (error || !authCode) {
      return NextResponse.json({ error: 'invalid_device_code' }, { status: 400 });
    }

    // Check expiry
    if (new Date(authCode.expires_at) < new Date()) {
      await supabase
        .from('device_auth_codes')
        .update({ status: 'expired' })
        .eq('id', authCode.id);

      return NextResponse.json({ error: 'expired_token' }, { status: 400 });
    }

    // Check status
    if (authCode.status === 'denied') {
      return NextResponse.json({ error: 'access_denied' }, { status: 403 });
    }

    if (authCode.status === 'pending') {
      return NextResponse.json({ error: 'authorization_pending' }, { status: 428 });
    }

    if (authCode.status === 'approved' && authCode.api_key_id) {
      // Fetch the API key to return the token
      const { data: apiKey } = await supabase
        .from('api_keys')
        .select('key_prefix')
        .eq('id', authCode.api_key_id)
        .single();

      // The actual key was stored temporarily in the device auth record
      // when the user approved it on the verification page
      return NextResponse.json({
        access_token: authCode.access_token || apiKey?.key_prefix,
        token_type: 'bearer',
        expires_in: 31536000, // 1 year
      });
    }

    return NextResponse.json({ error: 'authorization_pending' }, { status: 428 });
  } catch (error) {
    logServerError('Device token poll error', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

