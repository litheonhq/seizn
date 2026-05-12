import type { Metadata } from 'next';
import Link from 'next/link';
import type { Locale } from '@/i18n/config';
import { createServerClient } from '@/lib/supabase';
import { logServerError } from '@/lib/server/logger';
import { hashProgramWaitlistToken } from '@/lib/waitlist/program';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Program waitlist confirmation - Seizn',
  robots: { index: false, follow: false },
};

type ConfirmState = 'success' | 'expired' | 'invalid' | 'error';

type Props = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

const COPY: Record<'en' | 'ko', Record<ConfirmState, { title: string; body: string }>> = {
  en: {
    success: {
      title: "You're on the Program waitlist",
      body: "Your email is confirmed. We'll send Program invites to this list first.",
    },
    expired: {
      title: 'Confirmation link expired',
      body: 'Join the Program waitlist again and we will send a fresh confirmation link.',
    },
    invalid: {
      title: 'Confirmation link is invalid',
      body: 'The link may already have been used, or the token may be missing.',
    },
    error: {
      title: 'Confirmation is temporarily unavailable',
      body: 'Please try the link again in a moment.',
    },
  },
  ko: {
    success: {
      title: 'Program 대기명단 등록이 완료되었습니다',
      body: '이메일 인증이 끝났습니다. Program 초대는 이 대기명단에 먼저 보냅니다.',
    },
    expired: {
      title: '인증 링크가 만료되었습니다',
      body: 'Program 대기명단에 다시 등록하면 새 인증 링크를 보내드립니다.',
    },
    invalid: {
      title: '인증 링크를 확인할 수 없습니다',
      body: '이미 사용된 링크이거나 토큰이 누락되었을 수 있습니다.',
    },
    error: {
      title: '잠시 인증을 완료할 수 없습니다',
      body: '잠시 뒤 같은 링크로 다시 시도해주세요.',
    },
  },
};

function normalizeToken(token: string | string[] | undefined): string | null {
  if (Array.isArray(token)) return token[0] ?? null;
  return token?.trim() || null;
}

type WaitlistTokenRow = {
  id: string;
  confirmation_token_expires_at: string | null;
};

async function findProgramWaitlistTokenRow(
  supabase: ReturnType<typeof createServerClient>,
  token: string
): Promise<{ row: WaitlistTokenRow | null; error: unknown }> {
  const tokenHash = hashProgramWaitlistToken(token);
  const hashedResult = await supabase
    .from('desktop_waitlist')
    .select('id, confirmation_token_expires_at')
    .eq('confirmation_token', tokenHash)
    .maybeSingle();

  if (hashedResult.error || hashedResult.data) {
    return { row: (hashedResult.data as WaitlistTokenRow | null) ?? null, error: hashedResult.error };
  }

  // Transition fallback for outstanding links sent before the hash migration.
  // A successful confirmation clears the token, so raw-token fallback is one-use.
  const legacyResult = await supabase
    .from('desktop_waitlist')
    .select('id, confirmation_token_expires_at')
    .eq('confirmation_token', token)
    .maybeSingle();

  return { row: (legacyResult.data as WaitlistTokenRow | null) ?? null, error: legacyResult.error };
}

export async function confirmProgramWaitlistToken(token: string | null): Promise<ConfirmState> {
  if (!token) return 'invalid';

  try {
    const supabase = createServerClient();
    const { row, error } = await findProgramWaitlistTokenRow(supabase, token);

    if (error) {
      logServerError('Program waitlist confirmation lookup failed', error);
      return 'error';
    }

    if (!row) return 'invalid';

    const expiresAt =
      typeof row.confirmation_token_expires_at === 'string'
        ? new Date(row.confirmation_token_expires_at).getTime()
        : Number.NaN;

    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
      await supabase
        .from('desktop_waitlist')
        .update({ confirmation_token: null, confirmation_token_expires_at: null })
        .eq('id', row.id);
      return 'expired';
    }

    const { error: updateError } = await supabase
      .from('desktop_waitlist')
      .update({
        confirmed_at: new Date().toISOString(),
        confirmation_token: null,
        confirmation_token_expires_at: null,
      })
      .eq('id', row.id);

    if (updateError) {
      logServerError('Program waitlist confirmation update failed', updateError);
      return 'error';
    }

    return 'success';
  } catch (error) {
    logServerError('Program waitlist confirmation failed', error);
    return 'error';
  }
}

export default async function ProgramWaitlistConfirmPage({ params, searchParams }: Props) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const state = await confirmProgramWaitlistToken(normalizeToken(query.token));
  const copy = locale === 'ko' ? COPY.ko[state] : COPY.en[state];
  const cta = locale === 'ko' ? '가격 페이지로 돌아가기' : 'Back to pricing';

  return (
    <main className="min-h-screen px-4 py-16" style={{ background: 'var(--bg)', color: 'var(--text-primary)' }}>
      <section className="mx-auto max-w-xl rounded-[var(--radius-lg)] border p-8 text-center" style={{ borderColor: 'var(--ink-200)', background: 'var(--bg-elevated)' }}>
        <p className="author-eyebrow">Seizn Program</p>
        <h1 className="author-serif mt-3 text-3xl" style={{ color: 'var(--ink-900)' }}>
          {copy.title}
        </h1>
        <p className="mt-4 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
          {copy.body}
        </p>
        <Link
          href={`/${locale}/pricing#track-3`}
          className="author-btn mt-8 inline-flex min-h-11 items-center px-5 py-2 text-sm"
          style={{ background: 'var(--ink-900)', color: 'var(--ink-0)' }}
        >
          {cta}
        </Link>
      </section>
    </main>
  );
}
