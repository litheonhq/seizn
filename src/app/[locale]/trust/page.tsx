import { getDictionary } from "@/i18n/get-dictionary";
import { type Locale } from "@/i18n/config";
import { TrustClient } from "./trust-client";

type Props = {
  params: Promise<{ locale: Locale }>;
};

export default async function TrustPage({ params }: Props) {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  return <TrustClient dict={dict} locale={locale} />;
}
