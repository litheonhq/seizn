import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { generateApiKey } from '@/lib/api-key';
import { sendEmail } from '@/lib/email';
import { welcomeEmail } from '@/lib/email/templates';

const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ALLOW_E2E_AUTO_PROVISION = process.env.E2E_ALLOW_AUTO_PROVISION === '1' && !IS_PRODUCTION;
const DISABLE_WELCOME_EMAIL =
  process.env.SEIZN_DISABLE_WELCOME_EMAIL === '1' || ALLOW_E2E_AUTO_PROVISION;

type ProfileUpsertResult = { ok: true } | { ok: false; error: unknown };

function buildProfileUpsertPayloads(userId: string, email: string, name?: string) {
  const localPart = email.split('@')[0] || 'user';
  const normalized = localPart.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 20) || 'user';
  const shortId = userId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  const fallbackHandle = `${normalized}_${shortId}`;
  const fallbackName = name?.trim() || localPart || 'User';

  const minimalPayload = {
    id: userId,
    email,
  };

  const profilePayload = {
    ...minimalPayload,
    full_name: fallbackName,
    name: fallbackName,
    plan: 'free',
    language: 'en',
  };

  return [
    minimalPayload,
    {
      ...minimalPayload,
      plan: 'free',
    },
    profilePayload,
    {
      ...profilePayload,
      handle: fallbackHandle,
      username: fallbackHandle,
    },
    {
      ...profilePayload,
      handle: fallbackHandle,
      display_name: fallbackName,
      role: 'buyer',
    },
  ];
}

async function upsertProfileWithFallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  email: string,
  name?: string
): Promise<ProfileUpsertResult> {
  let lastError: unknown = null;
  const payloads = buildProfileUpsertPayloads(userId, email, name);

  for (const payload of payloads) {
    const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
    if (!error) {
      return { ok: true };
    }
    lastError = error;
  }

  return { ok: false, error: lastError };
}

async function rollbackFailedSignup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string
) {
  try {
    await supabase.from('profiles').delete().eq('id', userId);
  } catch {
    // Best-effort rollback only.
  }

  try {
    await supabase.auth.admin.deleteUser(userId);
  } catch {
    // Best-effort rollback only.
  }
}

/**
 * Verify Cloudflare Turnstile token
 */
async function verifyTurnstileToken(token: string, ip?: string): Promise<boolean> {
  if (!TURNSTILE_SECRET_KEY) {
    // Skip verification if not configured (development)
    console.warn('TURNSTILE_SECRET_KEY not configured, skipping CAPTCHA verification');
    return true;
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', TURNSTILE_SECRET_KEY);
    formData.append('response', token);
    if (ip) formData.append('remoteip', ip);

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body: formData,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error('Turnstile verification error:', error);
    return false;
  }
}

// POST /api/auth/signup - Create a new user account
export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }
    const { email, password, name, turnstileToken } = body as {
      email?: string;
      password?: string;
      name?: string;
      turnstileToken?: string;
    };

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    // Verify Turnstile CAPTCHA (if configured)
    if (TURNSTILE_SECRET_KEY && !ALLOW_E2E_AUTO_PROVISION) {
      if (!turnstileToken) {
        return NextResponse.json(
          { error: 'CAPTCHA verification required. Please try again.' },
          { status: 400 }
        );
      }

      const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0] ||
        request.headers.get('x-real-ip') ||
        undefined;
      const isValidCaptcha = await verifyTurnstileToken(turnstileToken, ip);
      if (!isValidCaptcha) {
        return NextResponse.json(
          { error: 'CAPTCHA verification failed. Please try again.' },
          { status: 400 }
        );
      }
    } else if (ALLOW_E2E_AUTO_PROVISION) {
      console.warn('[auth/signup] CAPTCHA bypassed for local E2E auto-provision');
    }

    const supabase = createServerClient();

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: name,
      },
    });

    if (authError) {
      console.error('Signup error:', authError);

      if (authError.message.includes('already registered')) {
        return NextResponse.json(
          { error: 'An account with this email already exists' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to create account' },
        { status: 500 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Failed to create account' },
        { status: 500 }
      );
    }

    const profileResult = await upsertProfileWithFallback(
      supabase,
      authData.user.id,
      authData.user.email || email,
      name
    );
    if (!profileResult.ok) {
      console.error('Profile upsert error during signup:', profileResult.error);
      await rollbackFailedSignup(supabase, authData.user.id);
      return NextResponse.json(
        { error: 'Failed to create account profile' },
        { status: 500 }
      );
    }

    // Generate instant API key (mem0-style UX)
    const { key, hash, prefix } = generateApiKey();

    const { error: apiKeyInsertError } = await supabase.from('api_keys').insert({
      user_id: authData.user.id,
      name: 'Default Key',
      key_hash: hash,
      key_prefix: prefix,
      scopes: ['memory:read', 'memory:write'],
      is_active: true,
    });
    if (apiKeyInsertError) {
      console.error('Default API key seed error during signup:', apiKeyInsertError);
      await rollbackFailedSignup(supabase, authData.user.id);
      return NextResponse.json(
        { error: 'Failed to provision default API key' },
        { status: 500 }
      );
    }

    // Send welcome email (non-blocking)
    if (!DISABLE_WELCOME_EMAIL) {
      sendEmail({
        to: email,
        subject: 'Welcome to Seizn!',
        html: welcomeEmail(name || ''),
      }).catch((err) => console.error('Failed to send welcome email:', err));
    }

    return NextResponse.json({
      success: true,
      message: 'Account created successfully',
      user: {
        id: authData.user.id,
        email: authData.user.email,
      },
      apiKey: key,
      apiKeyMessage: 'Save this API key securely. It will not be shown again.',
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
