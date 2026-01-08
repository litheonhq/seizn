import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Providers } from "@/components/providers";
import "./globals.css";

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
  themeColor: "#0A0A0A",
};

export const metadata: Metadata = {
  title: {
    default: "Seizn - AI Memory Infrastructure",
    template: "%s | Seizn",
  },
  description: "Give your AI persistent memory. Seizn extracts, stores, and retrieves context automatically — so your AI remembers everything.",
  keywords: ["AI memory", "memory infrastructure", "AI context", "semantic search", "vector database", "AI applications", "persistent memory"],
  authors: [{ name: "Seizn" }],
  creator: "Seizn",
  publisher: "Seizn",
  metadataBase: new URL("https://www.seizn.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://www.seizn.com",
    siteName: "Seizn",
    title: "Seizn - AI Memory Infrastructure",
    description: "Give your AI persistent memory. Seizn extracts, stores, and retrieves context automatically — so your AI remembers everything.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Seizn - AI Memory Infrastructure",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Seizn - AI Memory Infrastructure",
    description: "Give your AI persistent memory. Seizn extracts, stores, and retrieves context automatically.",
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
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
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
