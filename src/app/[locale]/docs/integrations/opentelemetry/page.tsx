import { locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { OpenTelemetryClient } from "./opentelemetry-client";

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
  const opentelemetryPage = docs?.opentelemetryPage as Record<string, unknown> | undefined;
  const meta = opentelemetryPage?.meta as Record<string, string> | undefined;
  const title = (meta?.title || "OpenTelemetry Integration").replace(/\s+[|·-]\s+Seizn$/u, "");

  return {
    title,
    description: meta?.description || "Export traces to Datadog, Grafana, Jaeger via OTLP",
    alternates: {
      canonical: `/${locale}/docs/integrations/opentelemetry`,
    },
  };
}

export default async function LocaleOpenTelemetryPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dictionary = await getDictionary(locale);

  return <OpenTelemetryClient locale={locale} dictionary={dictionary} />;
}
