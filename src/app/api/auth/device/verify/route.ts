import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { logServerError } from '@/lib/server/logger';

// POST /api/auth/device/verify - Look up a user_code (requires auth)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_code } = body as { user_code?: string };

    if (!user_code || user_code.length < 9) {
      return NextResponse.json({ error: 'Invalid code format' }, { status: 400 });
    }

    const supabase = createServerClient();

    const { data: authCode, error } = await supabase
      .from('device_auth_codes')
      .select('id, user_code, status, expires_at, device_code')
      .eq('user_code', user_code.toUpperCase())
      .eq('status', 'pending')
      .single();

    if (error || !authCode) {
      return NextResponse.json({ error: 'Code not found or already used' }, { status: 404 });
    }

    // Check expiry
    if (new Date(authCode.expires_at) < new Date()) {
      await supabase
        .from('device_auth_codes')
        .update({ status: 'expired' })
        .eq('id', authCode.id);

      return NextResponse.json({ error: 'expired' }, { status: 410 });
    }

    return NextResponse.json({
      id: authCode.id,
      user_code: authCode.user_code,
      device_code: authCode.device_code,
    });
  } catch (error) {
    logServerError('Device verify error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

