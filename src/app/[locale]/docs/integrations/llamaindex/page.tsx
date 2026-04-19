import { locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { LlamaIndexClient } from "./llamaindex-client";

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
  const llamaindexPage = docs?.llamaindexPage as Record<string, unknown> | undefined;
  const meta = llamaindexPage?.meta as Record<string, string> | undefined;
  const title = (meta?.title || "LlamaIndex Integration").replace(/\s+[|·-]\s+Seizn$/u, "");

  return {
    title,
    description: meta?.description || "Native retriever for LlamaIndex RAG pipelines",
    alternates: {
      canonical: `/${locale}/docs/integrations/llamaindex`,
    },
  };
}

export default async function LocaleLlamaIndexPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dictionary = await getDictionary(locale);

  return <LlamaIndexClient locale={locale} dictionary={dictionary} />;
}
