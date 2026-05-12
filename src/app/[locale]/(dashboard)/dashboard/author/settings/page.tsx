import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { locales } from "@/i18n/config";

export const metadata: Metadata = {
  title: "Author Settings - Seizn Dashboard",
  description: "Manage Author API keys, billing, usage, and sync settings.",
  robots: {
    index: false,
    follow: false,
  },
};

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocalizedAuthorSettingsPage({
  params: _params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await _params;
  redirect("/dashboard/author/settings");
}
