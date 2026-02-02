import { getAuthOrReview } from "@/lib/auth-or-review";
import DashboardShell from "@/components/dashboard/DashboardShell";
import AutopilotClient from "./autopilot-client";

export default async function AutopilotPage() {
  await getAuthOrReview();

  return (
    <DashboardShell>
      <AutopilotClient />
    </DashboardShell>
  );
}
