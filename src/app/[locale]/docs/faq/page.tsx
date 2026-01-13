import { Metadata } from "next";
import { locales, type Locale } from "@/i18n/config";
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

  return {
    title: "FAQ - Seizn Memory API",
    description: "Frequently asked questions about Seizn Memory API. Learn about memory storage, search, extraction, and best practices for AI memory management.",
    alternates: {
      canonical: `/${locale}/docs/faq`,
    },
    openGraph: {
      title: "FAQ - Seizn Memory API",
      description: "Frequently asked questions about Seizn Memory API for AI applications.",
      type: "website",
    },
  };
}

export default async function LocaleFAQPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;

  return <LocaleFAQClient locale={locale} />;
}
