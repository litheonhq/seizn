import { Metadata } from "next";
import { getDictionary } from "@/i18n/get-dictionary";
import { type Locale } from "@/i18n/config";
import { ComparisonClient } from "./comparison-client";

type Props = {
  params: Promise<{ locale: Locale }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  await getDictionary(locale);

  return {
    title:
      locale === "ko"
        ? "Inworld, Convai, ACE 통합 매트릭스 | Seizn"
        : "Inworld, Convai, and ACE Integration Matrix | Seizn",
    description:
      locale === "ko"
        ? "Seizn은 대화 엔진을 대체하지 않고 AI NPC 메모리 그래프를 맡습니다. Inworld, Convai, ACE와 함께 쓰는 통합 매트릭스를 확인하세요."
        : "See how Seizn fits beside Inworld, Convai, and NVIDIA ACE as the memory graph layer for AI NPCs.",
  };
}

export default async function ComparisonPage({ params }: Props) {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  return <ComparisonClient dict={dict} locale={locale} />;
}
