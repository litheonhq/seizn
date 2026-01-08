import { Metadata } from "next";
import { getDictionary } from "@/i18n/get-dictionary";
import { type Locale } from "@/i18n/config";
import { SpringClient } from "./spring-client";

type Props = {
  params: Promise<{ locale: Locale }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  return {
    title: `Spring - ${dict.springPage.title} ${dict.springPage.titleHighlight} | Seizn`,
    description: dict.springPage.subtitle,
  };
}

export default async function SpringPage({ params }: Props) {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  return <SpringClient dict={dict} locale={locale} />;
}
