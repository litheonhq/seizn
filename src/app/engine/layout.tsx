import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";

import "./_styles/tokens.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--engine-font-mono-loaded",
});

export const metadata: Metadata = {
  title: "Seizn Engine — NPCs that remember across generations",
  description:
    "Memory infrastructure for game NPCs. A drop-in SDK on top of Inworld, Convai, NVIDIA ACE, or your own runtime — replay every memory, audit every decision, cap every budget.",
  openGraph: {
    title: "Seizn Engine — NPCs that remember across generations",
    description:
      "Memory infrastructure for game NPCs. Persistent memory · replay · audit · budget.",
    type: "website",
    url: "https://engine.seizn.com",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: "/brand/engine-icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/engine-icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/engine-icons/favicon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/engine-icons/favicon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/engine-icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function EngineLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-engine-surface className={jetbrainsMono.variable}>
      {children}
    </div>
  );
}
