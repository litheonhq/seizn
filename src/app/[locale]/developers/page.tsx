import type { Metadata } from "next";
import { locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { DevelopersClient } from "./developers-client";

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dict = await getDictionary(locale);
  const copy = (dict as unknown as { developersPage?: { metadata?: { title: string; description: string } } }).developersPage;
  const title = copy?.metadata?.title ?? "Seizn Developers — Memory API & MCP";
  const description = copy?.metadata?.description ?? "REST API and MCP server for memory-aware writing tools.";

  return {
    title,
    description,
    alternates: { canonical: `/${locale}/developers` },
    openGraph: { title, description, type: "website" },
  };
}

export default async function DevelopersPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dict = await getDictionary(locale);

  return <DevelopersClient locale={locale} dict={dict} />;
}
