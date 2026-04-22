import type { Metadata } from "next";
import { locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { DEMO_NPC } from "@/lib/playground/demo-npc";
import { PlaygroundClient } from "./playground-client";

type Props = {
  params: Promise<{ locale: string }>;
};

function getLocale(localeParam: string): Locale {
  return (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
}

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = getLocale(localeParam);
  const title = `${DEMO_NPC.name} live playground`;
  const description = "Chat with a Seizn-backed demo NPC and watch visitor memory form during the scene.";

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/playground`,
    },
    openGraph: {
      title,
      description,
      type: "website",
    },
  };
}

export default async function PlaygroundPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = getLocale(localeParam);
  const dict = await getDictionary(locale);

  return <PlaygroundClient dict={dict} locale={locale} />;
}
