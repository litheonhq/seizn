import { getAuthOrReview } from "@/lib/auth-or-review";
import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import DashboardOverviewClient from "./overview-client";

export const metadata: Metadata = {
  title: "Dashboard - Seizn",
  description: "Manage NPC memory entities, API keys, and usage across your game titles.",
  openGraph: {
    title: "Dashboard - Seizn",
    description: "Manage NPC memory entities, API keys, and usage across your game titles.",
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
