import { getAuthOrReview } from "@/lib/auth-or-review";
import DashboardShell from "@/components/dashboard/DashboardShell";
import IntegrationsClient from "./integrations-client";

export default async function IntegrationsPage() {
  await getAuthOrReview();

  return (
    <DashboardShell>
      <IntegrationsClient />
    </DashboardShell>
  );
}
