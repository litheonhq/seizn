import { locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { AuthClient } from "./auth-client";

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
    title: "Authentication",
    description: "Learn how to authenticate with the Seizn API using Bearer tokens. Includes migration guide from x-api-key header.",
    alternates: {
      canonical: `/${locale}/docs/auth`,
    },
  };
}

export default async function LocaleAuthPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dictionary = await getDictionary(locale);

  return <AuthClient locale={locale} dictionary={dictionary} />;
}
