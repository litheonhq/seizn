import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import crypto from 'crypto';
import { logServerError } from '@/lib/server/logger';
import { checkCustomRateLimitAsync, getRateLimitHeaders } from '@/lib/rate-limit';

const INIT_IP_LIMIT = 20;
const INIT_IP_WINDOW_MS = 60 * 1000;

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

// POST /api/auth/device - Start device authorization flow
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const ipLimit = await checkCustomRateLimitAsync(
      `device_init_ip:${ip}`,
      INIT_IP_LIMIT,
      INIT_IP_WINDOW_MS
    );
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many device authorization attempts. Try again later.' },
        { status: 429, headers: getRateLimitHeaders(ipLimit) }
      );
    }

    const supabase = createServerClient();

    const deviceCode = crypto.randomBytes(16).toString('hex');
    const userCode = generateUserCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const { error } = await supabase.from('device_auth_codes').insert({
      device_code: deviceCode,
      user_code: userCode,
      status: 'pending',
      expires_at: expiresAt.toISOString(),
    });

    if (error) {
      logServerError('Device auth insert error', error);
      return NextResponse.json({ error: 'Failed to create device code' }, { status: 500 });
    }

    return NextResponse.json({
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.seizn.com'}/device`,
      expires_in: 900, // 15 minutes
      interval: 5,
    });
  } catch (error) {
    logServerError('Device auth error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Generate human-readable 8-char code like "ABCD-1234"
function generateUserCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // No I, O
  const digits = '23456789'; // No 0, 1

  let code = '';
  for (let i = 0; i < 4; i++) {
    code += letters[crypto.randomInt(letters.length)];
  }
  code += '-';
  for (let i = 0; i < 4; i++) {
    code += digits[crypto.randomInt(digits.length)];
  }
  return code;
}
