import type { Metadata, Viewport } from "next";
import { WebVitalsReporter } from "@/components/rum/WebVitalsReporter";
import "./globals.css";

const title = "Seizn · Memory for AI NPCs";
const description =
  "Plug into Inworld, Convai, or your own LLM. Seizn gives your NPCs persistent memory, relationships, and cross-generation recall — graph-priced, not per-seat.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a12",
};

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL("https://www.seizn.com"),
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
  openGraph: {
    title,
    description,
    url: "https://www.seizn.com",
    siteName: "Seizn",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Seizn",
      },
    ],
    type: "website",
  },
};

// This root layout is minimal - actual layout is in [locale]/layout.tsx
// This exists for pages that don't have a locale (API routes, etc.)
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {children}
      <WebVitalsReporter />
    </>
  );
}
