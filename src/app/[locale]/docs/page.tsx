import { locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { LocaleDocsClient } from "./docs-client";

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  await getDictionary(locale);

  return {
    title:
      locale === "ko"
        ? "AI NPC 메모리 문서 허브"
        : "AI NPC Memory Docs Hub",
    description:
      locale === "ko"
        ? "NPC 엔티티, 이벤트, witness, retrieval budget, 엔진 플러그인까지 Seizn 문서를 NPC 중심 흐름으로 정리한 허브입니다."
        : "A docs hub for AI NPC memory: entities, events, witness chains, retrieval budgets, and engine plugin flows.",
    alternates: {
      canonical: `/${locale}/docs`,
    },
  };
}

export default async function LocaleDocsPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dictionary = await getDictionary(locale);

  return <LocaleDocsClient locale={locale} dictionary={dictionary} />;
}
