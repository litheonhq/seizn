import { getDictionary } from "@/i18n/get-dictionary";
import { type Locale } from "@/i18n/config";
import { EnterpriseClient } from "./enterprise-client";

type Props = {
  params: Promise<{ locale: Locale }>;
};

export default async function EnterprisePage({ params }: Props) {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  return <EnterpriseClient dict={dict} locale={locale} />;
}
