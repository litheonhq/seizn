import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { buildBasicApiKeyInsertPayload, generateApiKey } from '@/lib/api-key';
import { sendEmail } from '@/lib/email';
import { welcomeEmail } from '@/lib/email/templates';
import { upsertProfileWithFallback } from '@/lib/profile/upsert';
import { logServerError, logServerWarn } from '@/lib/server/logger';
import { recordFunnelEvent } from '@/lib/analytics/funnel';

const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERCEL_ENV = process.env.VERCEL_ENV;
const IS_PRODUCTION = VERCEL_ENV
  ? VERCEL_ENV === 'production'
  : process.env.NODE_ENV === 'production';
const SHOULD_VERIFY_TURNSTILE = IS_PRODUCTION || Boolean(TURNSTILE_SECRET_KEY);
const ALLOW_E2E_AUTO_PROVISION = process.env.E2E_ALLOW_AUTO_PROVISION === '1' && !IS_PRODUCTION;
const DISABLE_WELCOME_EMAIL =
  process.env.SEIZN_DISABLE_WELCOME_EMAIL === '1' || ALLOW_E2E_AUTO_PROVISION;

async function rollbackFailedSignup(
  supabase: ReturnType<typeof createServerClient>,
  userId: string
) {
  try {
    await supabase.from('profiles').delete().eq('id', userId);
  } catch (e) {
    logServerError('Signup rollback: failed to delete profile', e);
  }

  try {
    await supabase.auth.admin.deleteUser(userId);
  } catch (e) {
    logServerError('Signup rollback: failed to delete auth user', e);
  }
}

/**
 * Verify Cloudflare Turnstile token
 */
async function verifyTurnstileToken(token: string, ip?: string): Promise<boolean> {
  if (!TURNSTILE_SECRET_KEY) {
    if (IS_PRODUCTION) {
      logServerError(
        'TURNSTILE_SECRET_KEY not configured in production; CAPTCHA verification unavailable',
        new Error('Missing TURNSTILE_SECRET_KEY')
      );
      return false;
    } else {
      logServerWarn('TURNSTILE_SECRET_KEY not configured, skipping CAPTCHA verification');
    }
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
    logServerError('Turnstile verification error', error);
    return false;
  }
}

// POST /api/auth/signup - Create a new user account
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { checkIpRateLimitAsync, getRateLimitHeaders } = await import('@/lib/rate-limit');
    const rateLimitResult = await checkIpRateLimitAsync(ip);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }
    const {
      email,
      password,
      name,
      turnstileToken,
      signupTemplate,
      signupSource,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      utm_content: utmContent,
      utm_term: utmTerm,
      referrer,
      landing_path: landingPath,
    } = body as {
      email?: string;
      password?: string;
      name?: string;
      turnstileToken?: string;
      signupTemplate?: string | null;
      signupSource?: string | null;
      utm_source?: string | null;
      utm_medium?: string | null;
      utm_campaign?: string | null;
      utm_content?: string | null;
      utm_term?: string | null;
      referrer?: string | null;
      landing_path?: string | null;
    };
    const normalizedSignupTemplate = signupTemplate === 'archivist-vale' ? signupTemplate : null;
    const normalizedSignupSource =
      typeof signupSource === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(signupSource)
        ? signupSource
        : 'signup';

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

    // Verify Turnstile CAPTCHA when configured, and always in production.
    if (SHOULD_VERIFY_TURNSTILE && !ALLOW_E2E_AUTO_PROVISION) {
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
      logServerWarn('[auth/signup] CAPTCHA bypassed for local E2E auto-provision');
    }

    const supabase = createServerClient();

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: name,
        ...(normalizedSignupTemplate
          ? {
              signup_template: normalizedSignupTemplate,
              npc_id: 'archivist_vale',
            }
          : {}),
      },
    });

    if (authError) {
      logServerError('Signup error', authError);

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
      logServerError('Profile upsert error during signup', profileResult.error);
      await rollbackFailedSignup(supabase, authData.user.id);
      return NextResponse.json(
        { error: 'Failed to create account profile' },
        { status: 500 }
      );
    }

    // Generate instant API key (mem0-style UX)
    const { key, hash, prefix } = generateApiKey();

    const apiKeyMetadata: Record<string, unknown> = {
      source: normalizedSignupSource,
    };
    if (normalizedSignupTemplate) {
      apiKeyMetadata.signup_template = normalizedSignupTemplate;
      apiKeyMetadata.npc_id = 'archivist_vale';
      apiKeyMetadata.namespace = 'playground-archivist-vale';
    }

    const { error: apiKeyInsertError } = await supabase.from('api_keys').insert(
      buildBasicApiKeyInsertPayload({
        userId: authData.user.id,
        name: 'Default Key',
        hash,
        prefix,
        scopes: ['memory:read', 'memory:write'],
        metadata: apiKeyMetadata,
      })
    );
    if (apiKeyInsertError) {
      logServerError('Default API key seed error during signup', apiKeyInsertError);
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
      }).catch((error) => logServerError('Failed to send welcome email', error));
    }

    // v9 funnel: signup event for cohort/conversion analytics. Non-blocking.
    void recordFunnelEvent({
      userId: authData.user.id,
      eventType: 'signup',
      metadata: { email },
    });

    // v9 marketing attribution: capture UTM + referrer + landing path so
    // the admin metrics dashboard can compute CAC per channel. Without
    // this insert the CAC denominator is 0 and the dashboard divides
    // ad_spend_log by 0. Insert-once via service-role client; ON
    // CONFLICT DO NOTHING covers the duplicate-PK case (rerun signup
    // path) although in practice signup creates exactly one row per user.
    const sanitizeUtm = (value: unknown): string | null => {
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      // Cap at 500 chars to bound row size; UTM params are short.
      if (!trimmed || trimmed.length > 500) return null;
      return trimmed;
    };
    void supabase
      .from('marketing_attributions')
      .upsert(
        {
          user_id: authData.user.id,
          utm_source: sanitizeUtm(utmSource),
          utm_medium: sanitizeUtm(utmMedium),
          utm_campaign: sanitizeUtm(utmCampaign),
          utm_content: sanitizeUtm(utmContent),
          utm_term: sanitizeUtm(utmTerm),
          referrer: sanitizeUtm(referrer),
          landing_path: sanitizeUtm(landingPath),
        },
        { onConflict: 'user_id', ignoreDuplicates: true },
      )
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) {
          logServerWarn('marketing_attributions insert failed', undefined, {
            userId: authData.user.id,
            error: error.message,
          });
        }
      });

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
    logServerError('Signup error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
