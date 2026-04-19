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
    title: isKorean ? "경쟁 포지셔닝 비교" : "Competitive Positioning",
    description: isKorean
      ? "Seizn과 주요 대안을 범주별로 비교하는 포지셔닝 페이지입니다."
      : "Category-based positioning comparison between Seizn and common alternatives for AI memory infrastructure.",
  };
}

export default async function ComparisonPage({ params }: Props) {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  return <ComparisonClient dict={dict} locale={locale} />;
}
