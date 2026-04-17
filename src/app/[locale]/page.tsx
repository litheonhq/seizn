import { Metadata } from "next";
import { getDictionary } from "@/i18n/get-dictionary";
import { type Locale } from "@/i18n/config";
import { ExtremeHomepage } from "@/components/extreme-homepage/server";

type Props = {
  params: Promise<{ locale: Locale }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  const title = dict.metadata?.title || "Seizn — Memory for AI NPCs";
  const description = dict.metadata?.description || "Plug into Inworld, Convai, or your own LLM. Seizn gives your NPCs persistent memory, relationships, and cross-generation recall — graph-priced, not per-seat.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
  };
}

export default async function Home({ params }: Props) {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  return <ExtremeHomepage dict={dict} locale={locale} />;
}
