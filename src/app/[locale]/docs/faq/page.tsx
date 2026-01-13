import { Metadata } from "next";
import { locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { LocaleFAQClient } from "./faq-client";

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dict = await getDictionary(locale);

  const title = dict.docs?.faqPage?.title || "FAQ";
  const subtitle = dict.docs?.faqPage?.subtitle || "Frequently asked questions about Seizn Memory API.";

  return {
    title: `${title} - Seizn Memory API`,
    description: subtitle,
    alternates: {
      canonical: `/${locale}/docs/faq`,
    },
    openGraph: {
      title: `${title} - Seizn Memory API`,
      description: subtitle,
      type: "website",
    },
  };
}

export default async function LocaleFAQPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dictionary = await getDictionary(locale);

  return <LocaleFAQClient locale={locale} dictionary={dictionary} />;
}
