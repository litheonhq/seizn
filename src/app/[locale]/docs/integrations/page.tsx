import { locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { IntegrationsClient } from "./integrations-client";

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
        ? "Unity, Unreal, Godot 연동 예제 | Seizn"
        : "Unity, Unreal, Godot, HTTP, Python, and JS Examples | Seizn",
    description:
      locale === "ko"
        ? "하나의 NPC 메모리 시나리오를 Unity, Unreal, Godot, raw HTTP, Python, JavaScript 경로로 보여주는 Seizn 통합 허브입니다."
        : "Seizn integration examples for one NPC memory workflow across Unity, Unreal, Godot, raw HTTP, Python, and JavaScript.",
    alternates: {
      canonical: `/${locale}/docs/integrations`,
    },
  };
}

export default async function LocaleIntegrationsPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dictionary = await getDictionary(locale);

  return <IntegrationsClient locale={locale} dictionary={dictionary} />;
}
