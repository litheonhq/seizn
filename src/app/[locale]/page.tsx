import { Metadata } from "next";
import { getDictionary } from "@/i18n/get-dictionary";
import { type Locale } from "@/i18n/config";
import { ExtremeHomepageClient } from "@/components/extreme-homepage";

type Props = {
  params: Promise<{ locale: Locale }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  // Dictionary fetch preserved for future i18n of metadata
  const _dict = await getDictionary(locale);

  return {
    title: "Seizn - Search you can debug",
    description: "Integrated retrieval stack with built-in tracing, evaluation, and governance. One request = results + trace + cost.",
    openGraph: {
      title: "Seizn - Search you can debug",
      description: "Integrated retrieval stack with built-in tracing, evaluation, and governance.",
      type: "website",
    },
  };
}

export default async function Home({ params }: Props) {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  return <ExtremeHomepageClient dict={dict} locale={locale} />;
}
