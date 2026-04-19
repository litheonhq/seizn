import { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { Locale } from '@/i18n/config';
import { PricingClient } from './pricing-client';

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  await getDictionary(locale);

  const title =
    locale === 'ko'
      ? 'NPC 엔티티 기준 가격 | Seizn'
      : 'Per-Entity NPC Pricing | Seizn';
  const description =
    locale === 'ko'
      ? 'Seizn은 NPC 메모리를 좌석 수가 아니라 엔티티 그래프와 이벤트 처리량 기준으로 과금합니다. Inworld, Convai, ACE와 함께 쓰고 Studio는 월 $499부터 시작합니다.'
      : 'Seizn prices AI NPC memory by entity graph size and event throughput, not by seat count. Keep Inworld, Convai, or ACE. Studio starts at $499 per month.';

  return {
    title,
    description,
  };
}

export default async function PricingPage({ params }: PageProps) {
  const { locale } = await params;
  const dict = await getDictionary(locale);
  
  return <PricingClient dict={dict} locale={locale} />;
}
