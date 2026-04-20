import type { Metadata, Viewport } from "next";
import { WebVitalsReporter } from "@/components/rum/WebVitalsReporter";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a12",
};

export const metadata: Metadata = {
  title: "Seizn · Memory for AI NPCs",
  description:
    "Plug into Inworld, Convai, or your own LLM. Seizn gives your NPCs persistent memory, relationships, and cross-generation recall — graph-priced, not per-seat.",
  metadataBase: new URL("https://www.seizn.com"),
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
