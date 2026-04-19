import { Metadata } from "next";
import { locales, type Locale } from "@/i18n/config";
import { QuickstartClient } from "./quickstart-client";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const title = locale === "ko" ? "퀵스타트" : "Quickstart";
  const description =
    locale === "ko"
      ? "SDK 설치부터 graph 생성, NPC 엔티티 생성, 이벤트 기록, 다음 턴 컨텍스트 회수까지 Seizn NPC 메모리 루프를 5단계로 시작합니다."
      : "Install the SDK, create a graph, create an NPC entity, log an event, and retrieve next-turn context in five steps.";

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/docs/quickstart`,
    },
    openGraph: {
      title,
      description,
      type: "website",
    },
  };
}

export default async function DocsQuickstartPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;

  return <QuickstartClient locale={locale} />;
}
