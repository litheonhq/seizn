import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { PaddleInit } from "@/components/paddle-init";
import { locales, type Locale, isRtl } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B1220",
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
  sv: 'sv_SE',
  nl: 'nl_NL',
  vi: 'vi_VN',
  pl: 'pl_PL',
  'pt-BR': 'pt_BR',
  'pt-PT': 'pt_PT',
};

// Auto-generate alternates.languages from locales array
const alternateLanguages = Object.fromEntries(
  locales.map((l) => [l, `/${l}`])
) as Record<string, string>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : 'en') as Locale;
  const dict = await getDictionary(locale);

  return {
    title: {
      default: dict.metadata.title,
      template: "%s | Seizn",
    },
    description: dict.metadata.description,
    keywords: ["AI memory", "memory infrastructure", "AI context", "semantic search", "vector database", "AI applications", "persistent memory"],
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
        { url: "/seizn-icon.svg", type: "image/svg+xml" },
        { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      ],
      apple: "/apple-touch-icon.png",
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
    <html lang={locale} dir={dir}>
      <head>
        {/* Preconnect to critical domains for faster resource loading */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://cdn.paddle.com" />
        {/* DNS prefetch for API endpoints */}
        <link rel="dns-prefetch" href="https://api.seizn.com" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
        {/* Paddle.js Checkout */}
        <PaddleInit />
      </body>
    </html>
  );
}
