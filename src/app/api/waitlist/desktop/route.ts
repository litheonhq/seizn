import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createServerClient } from '@/lib/supabase';
import { sendEmail, waitlistConfirmEmail, type EmailLocale } from '@/lib/email';
import { checkIpRateLimitAsync, getRateLimitHeaders } from '@/lib/rate-limit';
import { logServerError } from '@/lib/server/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const WAITLIST_TOKEN_BYTES = 32;
const WAITLIST_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '0.0.0.0'
  );
}

function normalizeLocale(input: unknown): EmailLocale {
  return input === 'ko' ? 'ko' : 'en';
}

interface WaitlistPayload {
  email?: unknown;
  locale?: unknown;
  source_utm?: unknown;
}

export async function POST(request: NextRequest) {
  // IP rate limit — 30/min per IP per existing checkIpRateLimitAsync helper.
  const ip = getClientIp(request);
  const rl = await checkIpRateLimitAsync(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: getRateLimitHeaders(rl) }
    );
  }

  let body: WaitlistPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 });
  }

  const locale = normalizeLocale(body.locale);
  const sourceUtm =
    body.source_utm && typeof body.source_utm === 'object' ? (body.source_utm as Record<string, unknown>) : null;

  const supabase = createServerClient();

  // Generate confirmation token (128-bit, hex-encoded). Used in confirm link.
  const confirmationToken = randomBytes(WAITLIST_TOKEN_BYTES).toString('hex');
  const confirmationExpiresAt = new Date(Date.now() + WAITLIST_TOKEN_TTL_MS).toISOString();

  // Upsert by email — repeated submissions refresh the token without
  // duplicating rows. Already-confirmed entries don't get re-tokenized.
  const { data: existing } = await supabase
    .from('desktop_waitlist')
    .select('id, confirmed_at')
    .eq('email', email)
    .maybeSingle();

  if (existing?.confirmed_at) {
    return NextResponse.json(
      { ok: true, alreadyConfirmed: true },
      { status: 200, headers: getRateLimitHeaders(rl) }
    );
  }

  const { error: upsertError } = await supabase.from('desktop_waitlist').upsert(
    {
      email,
      locale,
      source_utm: sourceUtm,
      confirmation_token: confirmationToken,
      confirmation_token_expires_at: confirmationExpiresAt,
    },
    { onConflict: 'email' }
  );

  if (upsertError) {
    logServerError('Desktop waitlist upsert failed', upsertError);
    return NextResponse.json({ error: 'db error' }, { status: 500 });
  }

  // Send confirmation email — fail-soft. We logged the row, the user can
  // request a resend later if delivery silently fails.
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://www.seizn.com';
  const confirmLink = `${baseUrl}/${locale}/waitlist/desktop/confirm?token=${confirmationToken}`;

  const html = waitlistConfirmEmail(email, confirmLink, locale);
  const subject = locale === 'ko' ? 'Seizn Desktop 대기 명단 이메일 인증' : 'Confirm your Seizn Desktop waitlist signup';
  const result = await sendEmail({
    to: email,
    subject,
    html,
    template: 'waitlist_confirm',
  });

  if (!result.success) {
    // Don't return 500 — DB row was written, user can re-trigger send. We
    // surface a hint so the form can show a "check spam / try again" message.
    logServerError('Waitlist confirmation email failed', result.error);
    return NextResponse.json(
      { ok: true, emailSent: false },
      { status: 200, headers: getRateLimitHeaders(rl) }
    );
  }

  return NextResponse.json(
    { ok: true, emailSent: true },
    { status: 200, headers: getRateLimitHeaders(rl) }
  );
}
