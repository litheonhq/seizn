import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/dashboard/redesign/workspace-shell";
import { getAuthOrReview } from "@/lib/auth-or-review";
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
    >
      <div className="min-h-0 flex-1 overflow-auto bg-[var(--bg-primary)] p-6">
        <OveragePanel />
        <UsageClient />
      </div>
    </WorkspaceShell>
  );
}
