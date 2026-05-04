import { Metadata } from "next";
import { type Locale } from "@/i18n/config";
import {
  AuthorFlagshipLanding,
  getAuthorLandingCopy,
} from "@/components/landing/author-flagship-landing";
import { loadSaebyeokDemoData } from "@/lib/sample-ip-demo";

type Props = {
  params: Promise<{ locale: Locale }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const copy = getAuthorLandingCopy(locale);
  const title = "Seizn Author - AI Memory for Authors";
  const description = copy.hero.subtitle;

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
  const data = await loadSaebyeokDemoData();

  return <AuthorFlagshipLanding data={data} locale={locale} />;
}
