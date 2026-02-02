import { getAuthOrReview } from "@/lib/auth-or-review";
import DashboardShell from "@/components/dashboard/DashboardShell";
import GovernanceClient from "./governance-client";

export default async function GovernancePage() {
  await getAuthOrReview();

  return (
    <DashboardShell>
      <GovernanceClient />
    </DashboardShell>
  );
}
