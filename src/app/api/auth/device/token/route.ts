import { NextRequest, NextResponse } from 'next/server';
import { hashApiKey } from '@/lib/api-key';
import { createServerClient } from '@/lib/supabase';
import { logServerError } from '@/lib/server/logger';
import { checkCustomRateLimitAsync, getRateLimitHeaders } from '@/lib/rate-limit';

const POLL_IP_LIMIT = 60;
const POLL_IP_WINDOW_MS = 60 * 1000;
const POLL_CODE_LIMIT = 60;
const POLL_CODE_WINDOW_MS = 60 * 1000;

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

// POST /api/auth/device/token - Poll for device authorization result
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const ipLimit = await checkCustomRateLimitAsync(
      `device_token_ip:${ip}`,
      POLL_IP_LIMIT,
      POLL_IP_WINDOW_MS
    );
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: 'slow_down' },
        { status: 429, headers: getRateLimitHeaders(ipLimit) }
      );
    }

    const body = await request.json();
    const { device_code } = body as { device_code?: string };

    if (!device_code) {
      return NextResponse.json({ error: 'missing_device_code' }, { status: 400 });
    }

    const codeLimit = await checkCustomRateLimitAsync(
      `device_token_code:${device_code}`,
      POLL_CODE_LIMIT,
      POLL_CODE_WINDOW_MS
    );
    if (!codeLimit.allowed) {
      return NextResponse.json(
        { error: 'slow_down' },
        { status: 429, headers: getRateLimitHeaders(codeLimit) }
      );
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
      if (!authCode.access_token) {
        return NextResponse.json({ error: 'token_already_retrieved' }, { status: 410 });
      }

      const tokenHash = hashApiKey(authCode.access_token);
      if (authCode.access_token_hash && authCode.access_token_hash !== tokenHash) {
        logServerError('Device token hash mismatch', new Error('access_token_hash mismatch'), {
          deviceAuthCodeId: authCode.id,
        });
        return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
      }

      const { data: apiKey } = await supabase
        .from('api_keys')
        .select('id')
        .eq('id', authCode.api_key_id)
        .eq('key_hash', tokenHash)
        .eq('is_active', true)
        .single();

      if (!apiKey) {
        return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
      }

      const { data: claimed, error: claimError } = await supabase
        .from('device_auth_codes')
        .update({
          access_token: null,
          access_token_hash: tokenHash,
        })
        .eq('id', authCode.id)
        .eq('access_token', authCode.access_token)
        .select('id')
        .single();

      if (claimError || !claimed) {
        return NextResponse.json({ error: 'token_already_retrieved' }, { status: 410 });
      }

      return NextResponse.json({
        access_token: authCode.access_token,
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
