import { getAuthOrReview } from "@/lib/auth-or-review";
import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import DashboardOverviewClient from "./overview-client";

export const metadata: Metadata = {
  title: "Dashboard - Seizn",
  description: "Manage your AI memories, API keys, and usage. Monitor your Seizn account activity and access developer tools.",
  openGraph: {
    title: "Dashboard - Seizn",
    description: "Manage your AI memories, API keys, and usage. Monitor your Seizn account activity and access developer tools.",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DashboardPage() {
  const { user } = await getAuthOrReview();

  return (
    <DashboardShell>
      <DashboardOverviewClient user={user} />
    </DashboardShell>
  );
}
