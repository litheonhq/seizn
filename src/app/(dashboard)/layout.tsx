import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "../globals.css";
import { Providers } from "@/components/providers";
import { locales, isRtl, type Locale } from "@/i18n/config";
import { DashboardLocaleProvider } from "@/contexts/DashboardLocaleContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FFF1F2",
};

export const metadata: Metadata = {
  title: "Dashboard - Seizn",
  description: "Manage your AI memories and API keys.",
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

  return (
    <html lang={locale} dir={dir}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 dark:bg-gray-900 min-h-screen`}
      >
        <Providers>
          <DashboardLocaleProvider initialLocale={locale}>
            {children}
          </DashboardLocaleProvider>
        </Providers>
      </body>
    </html>
  );
}
