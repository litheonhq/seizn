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

  const title = dict.metadata?.title || "Seizn - AI Memory Infrastructure";
  const description = dict.metadata?.description || "Integrated retrieval stack with built-in tracing, evaluation, and governance. One request = results + trace + cost.";

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
