import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0A0A0A",
};

export const metadata: Metadata = {
  title: "Seizn - AI Memory Infrastructure",
  description: "Give your AI persistent memory. Seizn extracts, stores, and retrieves context automatically.",
  metadataBase: new URL("https://www.seizn.com"),
};

// This root layout is minimal - actual layout is in [locale]/layout.tsx
// This exists for pages that don't have a locale (API routes, etc.)
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
