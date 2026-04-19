import { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { Locale } from '@/i18n/config';
import { PricingClient } from './pricing-client';

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const dict = await getDictionary(locale);
  
  return {
    title: dict.pricingPage.title,
    description: dict.pricingPage.subtitle,
  };
}

export default async function PricingPage({ params }: PageProps) {
  const { locale } = await params;
  const dict = await getDictionary(locale);
  
  return <PricingClient dict={dict} locale={locale} />;
}
