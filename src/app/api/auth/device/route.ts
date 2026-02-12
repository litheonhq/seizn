import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import crypto from 'crypto';

// POST /api/auth/device - Start device authorization flow
export async function POST() {
  try {
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
      console.error('Device auth insert error:', error);
      return NextResponse.json({ error: 'Failed to create device code' }, { status: 500 });
    }

    return NextResponse.json({
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.seizn.com'}/auth/device`,
      expires_in: 900, // 15 minutes
      interval: 5,
    });
  } catch (error) {
    console.error('Device auth error:', error);
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
