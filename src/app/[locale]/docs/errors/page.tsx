import { locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { ErrorDocsClient } from "./errors-client";

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
    title: dict.docs?.errors?.title || "Error Reference",
    description: dict.docs?.errors?.description || "Complete reference for Seizn API error codes, causes, and resolution guides",
    alternates: {
      canonical: `/${locale}/docs/errors`,
    },
  };
}

export default async function LocaleErrorDocsPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dictionary = await getDictionary(locale);

  return <ErrorDocsClient locale={locale} dictionary={dictionary} />;
}
