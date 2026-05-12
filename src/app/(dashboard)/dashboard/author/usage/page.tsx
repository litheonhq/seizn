import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/dashboard/redesign/workspace-shell";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { getDashboardCapabilities } from "@/lib/dashboard-capabilities";
import { OveragePanel } from "../../billing/overage-panel";
import { UsageClient } from "../../usage/client";

export const metadata: Metadata = {
  title: "Author Usage - Seizn Dashboard",
  description: "Monitor Author API usage and account activity.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AuthorUsagePage() {
  const { user } = await getAuthOrReview();

  return (
    <WorkspaceShell
      userName={user.name ?? user.email ?? "Author"}
      userPlanLabel="Studio"
      currentLabel="Usage"
      capabilities={getDashboardCapabilities(user)}
    >
      <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg-app)] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-7xl gap-5 pb-16">
          <OveragePanel />
          <UsageClient />
        </div>
      </main>
    </WorkspaceShell>
  );
}
