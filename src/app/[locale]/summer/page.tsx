import { Metadata } from "next";
import { getDictionary } from "@/i18n/get-dictionary";
import { type Locale } from "@/i18n/config";
import { SummerClient } from "./summer-client";
import { getPricingPageCopy } from "../pricing/pricing-copy";

type Props = {
  params: Promise<{ locale: Locale }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  return {
    title: `Summer - ${dict.hero.title} | Seizn`,
    description: dict.hero.subtitle,
  };
}

export default async function SummerPage({ params }: Props) {
  const { locale } = await params;
  const dict = await getDictionary(locale);
  const checkoutLegalCopy = getPricingPageCopy(locale).checkout;

  return <SummerClient dict={dict} locale={locale} checkoutLegalCopy={checkoutLegalCopy} />;
}
