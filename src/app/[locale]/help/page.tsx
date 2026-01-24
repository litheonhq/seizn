import { Metadata } from "next";
import { locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { HelpClient } from "./help-client";

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

  const helpDict = (dict as Record<string, unknown>).help as Record<string, unknown> | undefined;
  const title = (helpDict?.title as string) || "Help Hub";
  const subtitle = (helpDict?.subtitle as string) || "Find answers, get support, and access resources.";

  return {
    title: `${title} - Seizn`,
    description: subtitle,
    alternates: {
      canonical: `/${locale}/help`,
    },
    openGraph: {
      title: `${title} - Seizn`,
      description: subtitle,
      type: "website",
    },
  };
}

export default async function HelpPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dictionary = await getDictionary(locale);

  return <HelpClient locale={locale} dictionary={dictionary} />;
}
