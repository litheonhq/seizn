import { getAuthOrReview } from "@/lib/auth-or-review";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { BillingDashboardClient } from "./billing-client";

export const metadata = {
  title: "Billing | Seizn Dashboard",
  description: "Manage Author billing, subscription state, and token usage",
};

export default async function BillingPage() {
  await getAuthOrReview();

  return (
    <DashboardShell>
      <BillingDashboardClient />
    </DashboardShell>
  );
}
