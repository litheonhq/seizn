import { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { Locale } from '@/i18n/config';
import { PricingClient } from './pricing-client';

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await params;
  
  return {
    title: 'Author memory plans for launch teams | Seizn',
    description:
      'Choose a managed token cap, connect Stripe Checkout, and reduce managed usage costs by adding your own model key.',
  };
}

export default async function PricingPage({ params }: PageProps) {
  const { locale } = await params;
  const dict = await getDictionary(locale);
  
  return <PricingClient dict={dict} locale={locale} />;
}
