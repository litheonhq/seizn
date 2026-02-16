import { Metadata } from "next";
import { getDictionary } from "@/i18n/get-dictionary";
import { type Locale } from "@/i18n/config";
import { ComparisonClient } from "./comparison-client";

type Props = {
  params: Promise<{ locale: Locale }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isKorean = locale === "ko";

  return {
    title: isKorean
      ? "경쟁 포지셔닝 비교 | Seizn"
      : "Competitive Positioning | Seizn",
    description: isKorean
      ? "Seizn과 주요 대안들을 범주형 기준으로 비교한 포지셔닝 페이지"
      : "Category-based positioning comparison between Seizn and common alternatives for AI memory infrastructure.",
  };
}

export default async function ComparisonPage({ params }: Props) {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  return <ComparisonClient dict={dict} locale={locale} />;
}
