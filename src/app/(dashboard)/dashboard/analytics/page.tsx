import { getAuthOrReview } from "@/lib/auth-or-review";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { AnalyticsClient } from "./client";

export const metadata = {
  title: "Analytics | Seizn Dashboard",
  description: "Detailed usage analytics and insights for your Seizn account",
};

export default async function AnalyticsPage() {
  await getAuthOrReview();

  return (
    <DashboardShell>
      <AnalyticsClient />
    </DashboardShell>
  );
}
