import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/api/request-user';
import { ensureCsrfCookie } from '@/lib/csrf';
import {
  checkCustomRateLimitAsync,
  getRateLimitHeaders,
  peekCustomRateLimitAsync,
} from '@/lib/rate-limit';
import { createServerClient } from '@/lib/supabase';
import { logServerError } from '@/lib/server/logger';

const VERIFY_IP_LIMIT = 10;
const VERIFY_IP_WINDOW_MS = 60 * 1000;
const USER_CODE_INVALID_LIMIT = 5;
const USER_CODE_INVALID_WINDOW_MS = 15 * 60 * 1000;
const REQUESTED_SCOPES = ['memory:read', 'memory:write', 'memory:delete'] as const;

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function normalizeUserCode(value: string): string {
  return value.trim().toUpperCase();
}

// POST /api/auth/device/verify - Look up a user_code (requires auth)
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ip = getClientIp(request);
    const ipLimit = await checkCustomRateLimitAsync(
      `device_verify_ip:${ip}`,
      VERIFY_IP_LIMIT,
      VERIFY_IP_WINDOW_MS
    );
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Try again later.' },
        { status: 429, headers: getRateLimitHeaders(ipLimit) }
      );
    }

    const body = await request.json();
    const { user_code } = body as { user_code?: string };
    const normalizedUserCode = typeof user_code === 'string' ? normalizeUserCode(user_code) : '';

    if (!normalizedUserCode || normalizedUserCode.length < 9) {
      return NextResponse.json({ error: 'Invalid code format' }, { status: 400 });
    }

    const userCodeRateKey = `device_verify_code:${normalizedUserCode}`;
    const codeLockout = await peekCustomRateLimitAsync(
      userCodeRateKey,
      USER_CODE_INVALID_LIMIT,
      USER_CODE_INVALID_WINDOW_MS
    );
    if (!codeLockout.allowed) {
      return NextResponse.json(
        { error: 'Too many invalid lookups for this code. Try again later.' },
        { status: 429, headers: getRateLimitHeaders(codeLockout) }
      );
    }

    const supabase = createServerClient();

    const { data: authCode, error } = await supabase
      .from('device_auth_codes')
      .select('id, user_code, status, expires_at')
      .eq('user_code', normalizedUserCode)
      .eq('status', 'pending')
      .single();

    if (error || !authCode) {
      const invalidLookup = await checkCustomRateLimitAsync(
        userCodeRateKey,
        USER_CODE_INVALID_LIMIT,
        USER_CODE_INVALID_WINDOW_MS
      );
      const status = invalidLookup.allowed ? 404 : 429;
      return NextResponse.json(
        {
          error: invalidLookup.allowed
            ? 'Code not found or already used'
            : 'Too many invalid lookups for this code. Try again later.',
        },
        {
          status,
          headers: status === 429 ? getRateLimitHeaders(invalidLookup) : undefined,
        }
      );
    }

    // Check expiry
    if (new Date(authCode.expires_at) < new Date()) {
      await supabase
        .from('device_auth_codes')
        .update({ status: 'expired' })
        .eq('id', authCode.id);

      return NextResponse.json({ error: 'expired' }, { status: 410 });
    }

    return ensureCsrfCookie(
      request,
      NextResponse.json({
        id: authCode.id,
        user_code: authCode.user_code,
        requested_scopes: REQUESTED_SCOPES,
      })
    );
  } catch (error) {
    logServerError('Device verify error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
