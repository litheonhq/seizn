import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import { generateApiKey } from '@/lib/api-key';
import { sendEmail } from '@/lib/email';
import { apiKeyRotatedEmail } from '@/lib/email/templates';

// POST /api/dashboard/keys/rotate - Rotate an API key (NextAuth session)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
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
      .eq('user_id', session.user.id)
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
      .eq('user_id', session.user.id);

    if (updateError) {
      console.error('Rotate key error:', updateError);
      return NextResponse.json(
        { error: 'Failed to rotate key' },
        { status: 500 }
      );
    }

    // Send API key rotated notification email (non-blocking)
    if (session.user.email) {
      sendEmail({
        to: session.user.email,
        subject: `API Key Rotated: ${existingKey.name}`,
        html: apiKeyRotatedEmail(existingKey.name, prefix),
      }).catch((err) => console.error('Failed to send API key rotation notification:', err));
    }

    return NextResponse.json({
      success: true,
      key: key,
      keyPrefix: prefix,
      message: 'API key rotated successfully. Save this key securely.',
    });
  } catch (error) {
    console.error('Rotate key error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
