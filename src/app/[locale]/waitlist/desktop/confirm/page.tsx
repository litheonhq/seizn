import { redirect } from 'next/navigation';
import type { Locale } from '@/i18n/config';

type Props = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

function normalizeToken(token: string | string[] | undefined): string | null {
  if (Array.isArray(token)) return token[0] ?? null;
  return token?.trim() || null;
}

export default async function LegacyDesktopWaitlistConfirmPage({ params, searchParams }: Props) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const token = normalizeToken(query.token);
  const suffix = token ? `?token=${encodeURIComponent(token)}` : '';

  redirect(`/${locale}/waitlist/program/confirm${suffix}`);
}
