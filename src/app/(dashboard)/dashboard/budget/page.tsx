import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { BudgetDashboardClient } from "./budget-client";

export const metadata = {
  title: "Budget Settings | Seizn Dashboard",
  description: "Manage your API budget limits, alerts, and cost controls",
};

export default async function BudgetPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <DashboardShell>
      <BudgetDashboardClient />
    </DashboardShell>
  );
}
