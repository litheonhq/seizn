import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import { generateApiKey } from '@/lib/api-key';
import { sendEmail } from '@/lib/email';
import { apiKeyRotatedEmail } from '@/lib/email/templates';
import { logServerError } from '@/lib/server/logger';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DISABLE_KEY_EMAILS =
  process.env.SEIZN_DISABLE_WELCOME_EMAIL === '1' ||
  (process.env.E2E_ALLOW_AUTO_PROVISION === '1' && !IS_PRODUCTION);

// POST /api/dashboard/keys/rotate - Rotate an API key (NextAuth session)
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const keyId = body.keyId;

    if (!keyId) {
      return NextResponse.json(
        { error: 'Key ID required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Verify the key belongs to the user and is active
    const { data: existingKey, error: findError } = await supabase
      .from('api_keys')
      .select('id, name, key_prefix')
      .eq('id', keyId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (findError || !existingKey) {
      return NextResponse.json(
        { error: 'Key not found or not authorized' },
        { status: 404 }
      );
    }

    // Generate new API key
    const { key, hash, prefix } = generateApiKey();

    // Update key record with new hash and prefix
    const { error: updateError } = await supabase
      .from('api_keys')
      .update({
        key_hash: hash,
        key_prefix: prefix,
        rotated_at: new Date().toISOString(),
      })
      .eq('id', keyId)
      .eq('user_id', user.id);

    if (updateError) {
      logServerError('Rotate key error', updateError);
      return NextResponse.json(
        { error: 'Failed to rotate key' },
        { status: 500 }
      );
    }

    // Send API key rotated notification email (non-blocking).
    // Locale from Accept-Language; profiles.locale migration is the durable fix.
    if (user.email && !DISABLE_KEY_EMAILS) {
      const acceptLang = (request.headers.get('accept-language') ?? '').toLowerCase();
      const emailLocale: 'ko' | 'en' = acceptLang.startsWith('ko') ? 'ko' : 'en';
      sendEmail({
        to: user.email,
        subject: emailLocale === 'ko' ? `API 키 회전: ${existingKey.name}` : `API Key Rotated: ${existingKey.name}`,
        html: apiKeyRotatedEmail(existingKey.name, prefix, emailLocale),
      }).catch((error) => logServerError('Failed to send API key rotation notification', error));
    }

    return NextResponse.json({
      success: true,
      key: key,
      keyPrefix: prefix,
      message: 'API key rotated successfully. Save this key securely.',
    });
  } catch (error) {
    logServerError('Rotate key error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
