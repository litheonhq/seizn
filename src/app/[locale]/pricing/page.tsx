import { Metadata } from 'next';
import { Locale } from '@/i18n/config';
import { PricingClient } from './pricing-client';
import { getPricingPageCopy } from './pricing-copy';

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  
  return {
    title: 'Author memory plans for launch teams | Seizn',
    description:
      'Choose a managed token cap, connect Stripe Checkout, and reduce managed usage costs by adding your own Anthropic key.',
    alternates: {
      canonical: `/${locale}/pricing`,
    },
  };
}

export default async function PricingPage({ params }: PageProps) {
  const { locale } = await params;
  const copy = getPricingPageCopy(locale);
  
  return <PricingClient locale={locale} copy={copy} />;
}
