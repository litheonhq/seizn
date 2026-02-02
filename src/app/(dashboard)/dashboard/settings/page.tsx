import { getAuthOrReview } from "@/lib/auth-or-review";
import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { SettingsClient } from "./settings-client";

export const metadata: Metadata = {
  title: "Settings - Seizn Dashboard",
  description: "Configure your Seizn account settings, preferences, and integrations.",
  openGraph: {
    title: "Settings - Seizn Dashboard",
    description: "Configure your Seizn account settings, preferences, and integrations.",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SettingsPage() {
  await getAuthOrReview();

  return (
    <DashboardShell>
      <SettingsClient />
    </DashboardShell>
  );
}
