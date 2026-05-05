import { getAuthOrReview } from "@/lib/auth-or-review";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { BudgetDashboardClient } from "./budget-client";

export const metadata = {
  title: "Budget Settings | Seizn Dashboard",
  description: "Manage your API budget limits, alerts, and cost controls",
};

export default async function BudgetPage() {
  await getAuthOrReview();

  return (
    <DashboardShell>
      <BudgetDashboardClient />
    </DashboardShell>
  );
}
