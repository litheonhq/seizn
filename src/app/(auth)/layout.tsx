import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { isRtl, locales, type Locale } from "@/i18n/config";
import "../globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0A0A0A",
};

export const metadata: Metadata = {
  title: "Sign In · Seizn",
  description: "Sign in to your Seizn account to manage NPC memory graphs.",
};

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("NEXT_LOCALE")?.value;
  const locale = (localeCookie && locales.includes(localeCookie as Locale) ? localeCookie : "en") as Locale;
  const dir = isRtl(locale) ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir}>
      <body
        className="auth-root antialiased"
      >
        {children}
      </body>
    </html>
  );
}
