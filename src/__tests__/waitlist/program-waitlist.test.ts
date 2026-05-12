import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/email';
import { checkIpRateLimitAsync } from '@/lib/rate-limit';
import { hashProgramWaitlistToken } from '@/lib/waitlist/program';
import { POST } from '@/app/api/waitlist/program/route';
import { confirmProgramWaitlistToken } from '@/app/[locale]/waitlist/program/confirm/page';

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(),
  waitlistConfirmEmail: (email: string, confirmLink: string) =>
    `<p>${email}</p><a href="${confirmLink}">confirm</a>`,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkIpRateLimitAsync: vi.fn(),
  getRateLimitHeaders: () => new Headers({ 'x-ratelimit-limit': '30' }),
}));

vi.mock('@/lib/server/logger', () => ({
  logServerError: vi.fn(),
}));

function waitlistRequest(body: Record<string, unknown>) {
  return new NextRequest('https://www.seizn.com/api/waitlist/program', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
  });
}

function createPostSupabase(options?: {
  existing?: { id: string; confirmed_at: string | null } | null;
  upsertError?: unknown;
}) {
  const upsert = vi.fn(async () => ({ error: options?.upsertError ?? null }));
  const maybeSingle = vi.fn(async () => ({ data: options?.existing ?? null, error: null }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select, upsert }));

  return { client: { from }, from, select, eq, maybeSingle, upsert };
}

function createConfirmSupabase(rowsByToken: Record<string, { id: string; confirmation_token_expires_at: string | null }>) {
  const update = vi.fn((payload: Record<string, unknown>) => ({
    eq: vi.fn(async () => ({ error: null, payload })),
  }));
  const maybeSingle = vi.fn(async function maybeSingle(this: { token?: string }) {
    return { data: this.token ? rowsByToken[this.token] ?? null : null, error: null };
  });
  const eq = vi.fn((_column: string, token: string) => ({ token, maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select, update }));

  return { client: { from }, update };
}

describe('Program waitlist', () => {
  beforeEach(() => {
    vi.mocked(checkIpRateLimitAsync).mockResolvedValue({
      allowed: true,
      limit: 30,
      remaining: 29,
      reset: Date.now() + 60_000,
    });
    vi.mocked(sendEmail).mockResolvedValue({ success: true });
    vi.mocked(createServerClient).mockReset();
  });

  it('stores a hash while emailing the raw confirmation token', async () => {
    const supabase = createPostSupabase();
    vi.mocked(createServerClient).mockReturnValue(supabase.client);

    const response = await POST(waitlistRequest({ email: 'Writer@Example.com', locale: 'ko' }));
    const payload = await response.json();

    expect(payload).toEqual({ ok: true, emailSent: true });
    const row = supabase.upsert.mock.calls[0]?.[0] as { confirmation_token: string; email: string };
    const emailCall = vi.mocked(sendEmail).mock.calls[0]?.[0] as { html: string; subject: string };
    const token = new URL(emailCall.html.match(/href="([^"]+)"/)?.[1] ?? '').searchParams.get('token');

    expect(row.email).toBe('writer@example.com');
    expect(token).toBeTruthy();
    expect(row.confirmation_token).toBe(hashProgramWaitlistToken(token ?? ''));
    expect(row.confirmation_token).not.toBe(token);
    expect(emailCall.subject).toBe('Seizn Program 대기명단 이메일 인증');
  });

  it('rejects invalid email before writing or sending email', async () => {
    const response = await POST(waitlistRequest({ email: 'not-an-email' }));

    expect(response.status).toBe(400);
    expect(createServerClient).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('returns fail-soft success when confirmation email delivery fails', async () => {
    const supabase = createPostSupabase();
    vi.mocked(createServerClient).mockReturnValue(supabase.client);
    vi.mocked(sendEmail).mockResolvedValue({ success: false, error: new Error('smtp down') });

    const response = await POST(waitlistRequest({ email: 'writer@example.com' }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, emailSent: false });
  });

  it('does not reveal whether an address is already confirmed', async () => {
    const supabase = createPostSupabase({
      existing: { id: 'waitlist-row', confirmed_at: new Date().toISOString() },
    });
    vi.mocked(createServerClient).mockReturnValue(supabase.client);

    const response = await POST(waitlistRequest({ email: 'writer@example.com' }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, emailSent: true });
    expect(payload).not.toHaveProperty('alreadyConfirmed');
    expect(supabase.upsert).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('confirms hashed tokens and still accepts one-use legacy raw tokens', async () => {
    const token = 'legacy-or-email-token';
    const hashedToken = hashProgramWaitlistToken(token);
    const expires = new Date(Date.now() + 60_000).toISOString();

    vi.mocked(createServerClient).mockReturnValue(
      createConfirmSupabase({
        [hashedToken]: { id: 'hashed-row', confirmation_token_expires_at: expires },
      }).client
    );
    await expect(confirmProgramWaitlistToken(token)).resolves.toBe('success');

    vi.mocked(createServerClient).mockReturnValue(
      createConfirmSupabase({
        [token]: { id: 'legacy-row', confirmation_token_expires_at: expires },
      }).client
    );
    await expect(confirmProgramWaitlistToken(token)).resolves.toBe('success');
  });
});
