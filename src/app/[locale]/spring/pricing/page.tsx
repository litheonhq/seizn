import { auth } from "@/lib/auth";
import { type Locale, locales } from "@/i18n/config";
import { PricingPage } from "./pricing-page";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function SpringPricingPage({ params }: Props) {
  const session = await auth();
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : 'en') as Locale;

  return (
    <PricingPage
      locale={locale}
      user={session?.user || null}
    />
  );
}
