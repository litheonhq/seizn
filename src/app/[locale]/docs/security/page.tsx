import { locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { SecurityClient } from "./security-client";

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;

  return {
    title: "Security & Governance",
    description: "Seizn security practices, data protection, API key management, compliance, and governance features.",
    alternates: {
      canonical: `/${locale}/docs/security`,
    },
  };
}

export default async function LocaleSecurityPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dictionary = await getDictionary(locale);

  return <SecurityClient locale={locale} dictionary={dictionary} />;
}
