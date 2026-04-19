import { locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { ApiReferenceClient } from "./api-reference-client";

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dict = await getDictionary(locale) as Record<string, unknown>;

  // Safely access nested properties
  const docs = dict.docs as Record<string, unknown> | undefined;
  const apiReferencePage = docs?.apiReferencePage as Record<string, unknown> | undefined;
  const meta = apiReferencePage?.meta as Record<string, string> | undefined;
  const title = (meta?.title || "API Reference").replace(/\s+[|·-]\s+Seizn$/u, "");

  return {
    title,
    description:
      meta?.description || "Complete API documentation for Seizn graph entities, extraction, context retrieval, relationships, and integration endpoints.",
    alternates: {
      canonical: `/${locale}/docs/api-reference`,
    },
  };
}

export default async function LocaleApiReferencePage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dictionary = await getDictionary(locale);

  return <ApiReferenceClient locale={locale} dictionary={dictionary} />;
}
