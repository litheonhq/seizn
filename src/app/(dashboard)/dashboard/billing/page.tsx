import { getAuthOrReview } from "@/lib/auth-or-review";
import { WorkspaceShell } from "@/components/dashboard/redesign/workspace-shell";
import { getDashboardCapabilities } from "@/lib/dashboard-capabilities";
import { BillingDashboardClient } from "./billing-client";

export const metadata = {
  title: "Billing | Seizn Dashboard",
  description: "Manage Author billing, subscription state, and token usage",
};

export default async function BillingPage() {
  const { user } = await getAuthOrReview();

  return (
    <WorkspaceShell
      userName={user.name ?? user.email ?? "Author"}
      userPlanLabel="Studio"
      currentLabel="Billing"
      capabilities={getDashboardCapabilities(user)}
    >
      <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg-app)] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl pb-16">
          <BillingDashboardClient />
        </div>
      </main>
    </WorkspaceShell>
  );
}
