import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { locales, type Locale } from '@/i18n/config';
import { PersonaSeedingClient, type PersonaDashboardCopy } from './personas-client';

export const metadata: Metadata = {
  title: 'Persona Seeding | Seizn',
  description: 'Seed Korean NPC personas into Seizn graph entities.',
};

type PageProps = {
  params: Promise<{ locale: string }>;
};

function getPersonaCopy(dictionary: Awaited<ReturnType<typeof getDictionary>>): PersonaDashboardCopy {
  return dictionary.dashboard.personas as PersonaDashboardCopy;
}

export default async function PersonasDashboardPage({ params }: PageProps) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : 'en') as Locale;
  const dictionary = await getDictionary(locale);

  return <PersonaSeedingClient copy={getPersonaCopy(dictionary)} />;
}
