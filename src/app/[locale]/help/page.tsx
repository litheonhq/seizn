import { Metadata } from "next";
import { locales, type Locale } from "@/i18n/config";
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
  const title =
    locale === "ko"
      ? "게임 팀용 NPC 메모리 도움말 | Seizn"
      : "Help for Teams Shipping NPC Memory | Seizn";
  const description =
    locale === "ko"
      ? "persistent character, faction continuity, context budget, rollout cost 같은 게임 스튜디오 질문에 답하는 Seizn 도움말 허브입니다."
      : "Seizn help hub for game-studio questions about persistent characters, faction continuity, context budgets, and rollout cost.";

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/help`,
    },
    openGraph: {
      title,
      description,
      type: "website",
    },
  };
}

export default async function HelpPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;

  return <HelpClient locale={locale} />;
}
