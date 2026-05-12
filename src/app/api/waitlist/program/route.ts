import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, type EmailLocale, waitlistConfirmEmail } from '@/lib/email';
import { checkIpRateLimitAsync, getRateLimitHeaders } from '@/lib/rate-limit';
import { logServerError } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';
import {
  hashProgramWaitlistToken,
  PROGRAM_WAITLIST_TOKEN_BYTES,
  PROGRAM_WAITLIST_TOKEN_TTL_MS,
} from '@/lib/waitlist/program';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

interface WaitlistPayload {
  email?: unknown;
  locale?: unknown;
  source_utm?: unknown;
}

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

function getProgramConfirmBaseUrl(): string {
  return process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://www.seizn.com';
}

export async function POST(request: NextRequest) {
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
  const confirmationToken = randomBytes(PROGRAM_WAITLIST_TOKEN_BYTES).toString('hex');
  const confirmationTokenHash = hashProgramWaitlistToken(confirmationToken);
  const confirmationExpiresAt = new Date(Date.now() + PROGRAM_WAITLIST_TOKEN_TTL_MS).toISOString();

  const { data: existing } = await supabase
    .from('desktop_waitlist')
    .select('id, confirmed_at')
    .eq('email', email)
    .maybeSingle();

  if (existing?.confirmed_at) {
    return NextResponse.json(
      { ok: true, emailSent: true },
      { status: 200, headers: getRateLimitHeaders(rl) }
    );
  }

  const { error: upsertError } = await supabase.from('desktop_waitlist').upsert(
    {
      email,
      locale,
      source_utm: sourceUtm,
      confirmation_token: confirmationTokenHash,
      confirmation_token_expires_at: confirmationExpiresAt,
    },
    { onConflict: 'email' }
  );

  if (upsertError) {
    logServerError('Program waitlist upsert failed', upsertError);
    return NextResponse.json({ error: 'db error' }, { status: 500 });
  }

  const confirmLink = `${getProgramConfirmBaseUrl()}/${locale}/waitlist/program/confirm?token=${confirmationToken}`;
  const html = waitlistConfirmEmail(email, confirmLink, locale);
  const subject = locale === 'ko' ? 'Seizn Program 대기명단 이메일 인증' : 'Confirm your Seizn Program waitlist signup';
  const result = await sendEmail({
    to: email,
    subject,
    html,
    template: 'waitlist_confirm',
  });

  if (!result.success) {
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
