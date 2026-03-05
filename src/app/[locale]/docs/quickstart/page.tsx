import { redirect } from "next/navigation";
import { locales, type Locale } from "@/i18n/config";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function DocsQuickstartPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;

  redirect(`/${locale}/docs#quickstart`);
}
