import { locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { IntegrationsClient } from "./integrations-client";

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dict = await getDictionary(locale) as Record<string, unknown>;

  const docs = dict.docs as Record<string, unknown> | undefined;
  const integrationsPage = docs?.integrationsPage as Record<string, unknown> | undefined;
  const meta = integrationsPage?.meta as Record<string, string> | undefined;
  const title = (meta?.title || "Integrations").replace(/\s+[|·-]\s+Seizn$/u, "");

  return {
    title,
    description:
      meta?.description || "Integrate Seizn with Unity, Unreal, Godot, raw HTTP, Python, and JavaScript.",
    alternates: {
      canonical: `/${locale}/docs/integrations`,
    },
  };
}

export default async function LocaleIntegrationsPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dictionary = await getDictionary(locale);

  return <IntegrationsClient locale={locale} dictionary={dictionary} />;
}
