import type { Metadata } from "next";
import { SaebyeokDemo } from "@/components/demo/saebyeok-demo";
import { loadSaebyeokDemoData } from "@/lib/sample-ip-demo";
import type { Locale } from "@/i18n/config";

type Props = {
  params: Promise<{ locale: Locale }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === "ko" ? "새벽 아카데미 데모 | Seizn" : "Saebyeok Academy Demo | Seizn";

  return {
    title,
    description: "Read-only synthetic Sample IP demo data for Seizn Author.",
    alternates: {
      canonical: `/${locale}/demo`,
    },
  };
}

export default async function DemoPage({ params }: Props) {
  const { locale } = await params;
  const data = await loadSaebyeokDemoData();

  return <SaebyeokDemo data={data} locale={locale} />;
}
