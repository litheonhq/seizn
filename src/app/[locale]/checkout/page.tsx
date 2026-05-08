import { notFound } from 'next/navigation';
import {
  AUTHOR_BILLING_TIERS,
  type AuthorBillingTier,
  type BillingCadence,
  type BillingColumn,
} from '@/lib/stripe-config';
import { type Locale, locales } from '@/i18n/config';
import { CheckoutClient } from './checkout-client';

export const dynamic = 'force-dynamic';

const VALID_TIERS: readonly AuthorBillingTier[] = ['indie', 'pro', 'studio', 'enterprise'];
const VALID_CADENCES: readonly BillingCadence[] = ['monthly', 'yearly'];
const VALID_COLUMNS: readonly BillingColumn[] = ['managed', 'byok'];

function pickQuery<T extends string>(
  raw: string | string[] | undefined,
  whitelist: readonly T[],
  fallback: T
): T {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return whitelist.includes(value as T) ? (value as T) : fallback;
}

interface CheckoutPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    tier?: string;
    cadence?: string;
    column?: string;
    track?: string;
  }>;
}

export default async function CheckoutPage({ params, searchParams }: CheckoutPageProps) {
  const { locale: localeParam } = await params;
  if (!locales.includes(localeParam as Locale)) {
    notFound();
  }
  const locale = localeParam as Locale;

  const sp = await searchParams;
  const tier = pickQuery<AuthorBillingTier>(sp.tier, VALID_TIERS, 'indie');
  const cadence = pickQuery<BillingCadence>(sp.cadence, VALID_CADENCES, 'monthly');
  const column = pickQuery<BillingColumn>(sp.column, VALID_COLUMNS, 'managed');

  const planConfig = AUTHOR_BILLING_TIERS[tier];

  return (
    <main className="author-landing min-h-screen">
      <div className="author-shell author-section">
        <CheckoutClient
          locale={locale}
          tier={tier}
          cadence={cadence}
          column={column}
          planConfig={planConfig}
        />
      </div>
    </main>
  );
}
