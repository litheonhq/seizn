import { locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { LangChainClient } from "./langchain-client";

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
  const langchainPage = docs?.langchainPage as Record<string, unknown> | undefined;
  const meta = langchainPage?.meta as Record<string, string> | undefined;

  return {
    title: meta?.title || "LangChain Integration | Seizn",
    description: meta?.description || "Drop-in retriever for LangChain RAG pipelines",
    alternates: {
      canonical: `/${locale}/docs/integrations/langchain`,
    },
  };
}

export default async function LocaleLangChainPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dictionary = await getDictionary(locale);

  return <LangChainClient locale={locale} dictionary={dictionary} />;
}
