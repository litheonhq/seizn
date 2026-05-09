import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "../globals.css";
import { Providers } from "@/components/providers";
import { locales, isRtl, type Locale } from "@/i18n/config";
import { DashboardLocaleProvider } from "@/contexts/DashboardLocaleContext";
import { BetaDisclosureBanner } from "@/components/legal/beta-disclosure-banner";
import { getBetaDisclosureUntil } from "@/lib/legal-docs";

import { DashboardClientWrapper } from "@/components/dashboard/DashboardClientWrapper";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#070a12",
};

export const metadata: Metadata = {
  title: "Dashboard - Seizn",
  description: "Manage author workspaces, canon memory, usage, and API keys.",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read locale from cookie, fallback to 'en'
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("NEXT_LOCALE")?.value;
  const locale = (localeCookie && locales.includes(localeCookie as Locale) ? localeCookie : "en") as Locale;
  const dir = isRtl(locale) ? "rtl" : "ltr";
  const betaUntil = await getBetaDisclosureUntil(locale);

  return (
    <html lang={locale} dir={dir}>
      <body
        className="antialiased szn-app-bg min-h-screen"
      >
        <Providers>
          <DashboardLocaleProvider initialLocale={locale}>
            <DashboardClientWrapper>
              <BetaDisclosureBanner betaUntil={betaUntil} />
              {children}
            </DashboardClientWrapper>
          </DashboardLocaleProvider>
        </Providers>
      </body>
    </html>
  );
}
