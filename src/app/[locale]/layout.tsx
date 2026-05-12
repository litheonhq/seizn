import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { locales, type Locale, isRtl } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { CookieBanner } from "@/components/legal/CookieBanner";
import "../globals.css";

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

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a12",
};

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

type Props = {
  params: Promise<{ locale: string }>;
};

// OpenGraph locale mapping
const localeMap: Record<Locale, string> = {
  en: 'en_US',
  ko: 'ko_KR',
  ja: 'ja_JP',
  'zh-hans': 'zh_Hans_CN',
  'zh-hant': 'zh_Hant_TW',
  es: 'es_ES',
  ru: 'ru_RU',
  uk: 'uk_UA',
  he: 'he_IL',
  ar: 'ar_SA',
  fr: 'fr_FR',
  de: 'de_DE',
  it: 'it_IT',
  sv: 'sv_SE',
  nl: 'nl_NL',
  vi: 'vi_VN',
  pl: 'pl_PL',
  hi: 'hi_IN',
  th: 'th_TH',
  id: 'id_ID',
  'pt-BR': 'pt_BR',
  'pt-PT': 'pt_PT',
};

// hreflang strategy (W4.4): we ship ko + en at 100% translation quality.
// All other locales fall back to English in the get-dictionary chain. To avoid
// Google interpreting the 22 non-en/ko locales as translated content (which
// would hurt rankings due to duplicate content + bad UX), we map every fallback
// locale's hreflang to `/en` and add x-default. ko keeps its own URL.
//
// Reference: plan W4.4 + Google guidance (https://developers.google.com/search/docs/specialized/international/localized-versions).
const FULLY_TRANSLATED_LOCALES = new Set<string>(['en', 'ko']);
const alternateLanguages = Object.fromEntries(
  locales.map((l) => [l, FULLY_TRANSLATED_LOCALES.has(l) ? `/${l}` : `/en`])
) as Record<string, string>;
alternateLanguages['x-default'] = '/en';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : 'en') as Locale;
  const dict = await getDictionary(locale);

  return {
    title: {
      default: dict.metadata.title,
      template: "%s - Seizn",
    },
    description: dict.metadata.description,
    keywords: [
      "AI writing memory",
      "fiction writing software",
      "canon management",
      "novel continuity checker",
      "author workspace",
      "Seizn Program",
      "manuscript review",
      "story conflict detection",
    ],
    authors: [{ name: "Seizn" }],
    creator: "Seizn",
    publisher: "Seizn",
    metadataBase: new URL("https://www.seizn.com"),
    alternates: {
      canonical: `/${locale}`,
      languages: alternateLanguages,
    },
    openGraph: {
      type: "website",
      locale: localeMap[locale],
      url: `https://www.seizn.com/${locale}`,
      siteName: "Seizn",
      title: dict.metadata.title,
      description: dict.metadata.description,
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: dict.metadata.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: dict.metadata.title,
      description: dict.metadata.description,
      images: ["/og-image.png"],
      creator: "@seizn",
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    icons: {
      icon: [
        { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
        { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/favicon-512.png", sizes: "512x512", type: "image/png" },
      ],
      shortcut: "/favicon.ico",
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : 'en') as Locale;
  const dir = isRtl(locale) ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir} data-scroll-behavior="smooth">
      <head>
        {/* DNS prefetch for API endpoints */}
        <link rel="dns-prefetch" href="https://api.seizn.com" />
        <link rel="dns-prefetch" href="https://analytics.seizn.com" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} antialiased`}
      >
        {/*
         * Plausible — cookieless, IP-anonymized, GDPR/PIPA exempt from consent gate.
         * Uses afterInteractive (default for body-rendered Script). beforeInteractive
         * is invalid here because [locale]/layout.tsx is a NESTED layout, not the
         * root layout — Next.js throws in production. The single-pageview-drop
         * concern that motivated beforeInteractive is mitigated by Plausible's
         * History API patch attaching once and persisting across SPA nav.
         */}
        <Script
          src="https://analytics.seizn.com/js/script.js"
          data-domain="seizn.com"
          strategy="afterInteractive"
        />
        <GoogleAnalytics />
        {children}
        <CookieBanner locale={locale} />
      </body>
    </html>
  );
}
