import { Metadata } from "next";
import { locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { LimitsClient } from "./limits-client";

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

  const limitsDict = (dict as Record<string, unknown>).limits as Record<string, unknown> | undefined;
  const title = (limitsDict?.title as string) || "Limits & Billing";
  const subtitle = (limitsDict?.subtitle as string) || "Understand your plan limits, quotas, and billing information.";

  return {
    title,
    description: subtitle,
    alternates: {
      canonical: `/${locale}/docs/limits`,
    },
    openGraph: {
      title,
      description: subtitle,
      type: "website",
    },
  };
}

export default async function LimitsPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dictionary = await getDictionary(locale);

  return <LimitsClient locale={locale} dictionary={dictionary} />;
}
