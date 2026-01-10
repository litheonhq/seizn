import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { type Locale, locales } from "@/i18n/config";
import { UsageDashboard } from "./usage-dashboard";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function UsagePage({ params }: Props) {
  const session = await auth();
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : 'en') as Locale;

  if (!session?.user) {
    redirect(`/${locale}/login?callbackUrl=/${locale}/spring/usage`);
  }

  return <UsageDashboard locale={locale} user={session.user} />;
}
