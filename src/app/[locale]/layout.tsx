import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Providers } from "@/components/providers";
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : 'en') as Locale;
  const dict = await getDictionary(locale);

  const localeMap: Record<Locale, string> = {
    en: 'en_US',
    ko: 'ko_KR',
    ja: 'ja_JP',
    'zh-CN': 'zh_CN',
    'zh-TW': 'zh_TW',
    'zh-HK': 'zh_HK',
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
      languages: {
        'en': '/en',
        'ko': '/ko',
        'ja': '/ja',
        'zh-CN': '/zh-CN',
        'zh-TW': '/zh-TW',
        'zh-HK': '/zh-HK',
        'es': '/es',
        'ru': '/ru',
        'uk': '/uk',
        'he': '/he',
        'ar': '/ar',
        'fr': '/fr',
        'de': '/de',
        'sv': '/sv',
        'nl': '/nl',
        'vi': '/vi',
        'pl': '/pl',
        'pt-BR': '/pt-BR',
        'pt-PT': '/pt-PT',
      },
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

  return (
    <html lang={locale} dir={isRtl(locale) ? 'rtl' : 'ltr'}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
        {/* Lemon Squeezy Checkout Overlay */}
        <Script
          src="https://app.lemonsqueezy.com/js/lemon.js"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
