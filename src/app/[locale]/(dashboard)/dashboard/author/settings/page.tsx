import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { DashboardClientWrapper } from "@/components/dashboard/DashboardClientWrapper";
import { Providers } from "@/components/providers";
import { AuthorSettingsClient } from "@/components/settings/author-settings-client";
import { DashboardLocaleProvider } from "@/contexts/DashboardLocaleContext";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { locales, type Locale } from "@/i18n/config";

export const metadata: Metadata = {
  title: "Author Settings - Seizn Dashboard",
  description: "Manage Author API keys, billing, usage, and sync settings.",
  robots: {
    index: false,
    follow: false,
  },
};

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocalizedAuthorSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await getAuthOrReview();
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;

  return (
    <Providers>
      <DashboardLocaleProvider initialLocale={locale}>
        <DashboardClientWrapper>
          <DashboardShell>
            <AuthorSettingsClient />
          </DashboardShell>
        </DashboardClientWrapper>
      </DashboardLocaleProvider>
    </Providers>
  );
}
