import type { Metadata } from "next";
import { locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { DesktopClient } from "./desktop-client";

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
  const copy = (dict as unknown as { desktopPage?: { metadata?: { title: string; description: string } } }).desktopPage;
  const title = copy?.metadata?.title ?? "Seizn Desktop — native authoring, offline-first";
  const description = copy?.metadata?.description ?? "Native desktop authoring app, coming Q3 2026.";

  return {
    title,
    description,
    alternates: { canonical: `/${locale}/desktop` },
    openGraph: { title, description, type: "website" },
  };
}

export default async function DesktopPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
  const dict = await getDictionary(locale);

  return <DesktopClient locale={locale} dict={dict} />;
}
