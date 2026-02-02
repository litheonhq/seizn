import { getAuthOrReview } from "@/lib/auth-or-review";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { DynamicEvalsClient } from "./dynamic";

export default async function EvalsPage() {
  await getAuthOrReview();

  return (
    <DashboardShell>
      <DynamicEvalsClient />
    </DashboardShell>
  );
}
