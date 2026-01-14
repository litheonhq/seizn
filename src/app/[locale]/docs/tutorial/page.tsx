import { locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { TutorialClient } from "./tutorial-client";

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
    title: dict.docs?.tutorialPage?.meta?.title || "5-Minute Tutorial | Seizn",
    description: dict.docs?.tutorialPage?.meta?.description || "Add AI memory in 5 minutes with step-by-step guide",
    alternates: {
      canonical: `/${locale}/docs/tutorial`,
    },
  };
}

export default async function LocaleTutorialPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dictionary = await getDictionary(locale);

  return <TutorialClient locale={locale} dictionary={dictionary} />;
}
