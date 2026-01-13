import { locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { QuickstartClient } from "./quickstart-client";

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
    title: dict.docs?.quickstartPage?.meta?.title || "5-Minute Quickstart | Seizn",
    description: dict.docs?.quickstartPage?.meta?.description || "Add AI memory in 5 minutes with just 10 lines of code",
    alternates: {
      canonical: `/${locale}/docs/quickstart`,
    },
  };
}

export default async function LocaleQuickstartPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dictionary = await getDictionary(locale);

  return <QuickstartClient locale={locale} dictionary={dictionary} />;
}
