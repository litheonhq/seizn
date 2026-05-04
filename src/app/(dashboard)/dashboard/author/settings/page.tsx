import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { AuthorSettingsClient } from "@/components/settings/author-settings-client";
import { getAuthOrReview } from "@/lib/auth-or-review";

export const metadata: Metadata = {
  title: "Author Settings - Seizn Dashboard",
  description: "Manage Author API keys, billing, usage, and sync settings.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AuthorSettingsPage() {
  await getAuthOrReview();

  return (
    <DashboardShell>
      <AuthorSettingsClient />
    </DashboardShell>
  );
}
