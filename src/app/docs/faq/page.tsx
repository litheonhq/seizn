import { Metadata } from "next";
import { DashboardLocaleProvider } from "@/contexts/DashboardLocaleContext";
import { FAQClient } from "./faq-client";

export const metadata: Metadata = {
  title: "FAQ - Seizn Memory API",
  description: "Frequently asked questions about Seizn Memory API. Learn about memory storage, search, extraction, and best practices for AI memory management.",
  openGraph: {
    title: "FAQ - Seizn Memory API",
    description: "Frequently asked questions about Seizn Memory API for AI applications.",
    type: "website",
  },
};

export default function FAQPage() {
  return (
    <DashboardLocaleProvider>
      <FAQClient />
    </DashboardLocaleProvider>
  );
}
