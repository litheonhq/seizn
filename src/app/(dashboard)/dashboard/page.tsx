import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/dashboard/redesign/workspace-shell";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { getDashboardCapabilities } from "@/lib/dashboard-capabilities";
import DashboardOverviewClient from "./overview-client";

export const metadata: Metadata = {
  title: "Dashboard - Seizn",
  description: "Seizn workspace overview.",
  openGraph: {
    title: "Dashboard - Seizn",
    description: "Seizn workspace overview.",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DashboardPage() {
  const { user } = await getAuthOrReview();
  const capabilities = getDashboardCapabilities(user);

  return (
    <WorkspaceShell
      userName={user.name ?? user.email ?? "Author"}
      userPlanLabel="Author"
      currentLabel="Overview"
      capabilities={capabilities}
    >
      <DashboardOverviewClient user={user} track2Enabled={capabilities.track2 === true} />
    </WorkspaceShell>
  );
}
