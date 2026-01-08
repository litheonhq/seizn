import { getDictionary } from "@/i18n/get-dictionary";
import { type Locale } from "@/i18n/config";
import { HomeClient } from "./home-client";

type Props = {
  params: Promise<{ locale: Locale }>;
};

export default async function Home({ params }: Props) {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  return <HomeClient dict={dict} locale={locale} />;
}
