import { locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { LocaleDocsClient } from "./docs-client";

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dict = await getDictionary(locale);

  return {
    title: dict.docs?.hero?.title || "Documentation",
    description: dict.docs?.hero?.subtitle || "Docs for Seizn NPC memory APIs, engine integrations, and graph retrieval workflows.",
    alternates: {
      canonical: `/${locale}/docs`,
    },
  };
}

export default async function LocaleDocsPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dictionary = await getDictionary(locale);

  return <LocaleDocsClient locale={locale} dictionary={dictionary} />;
}
