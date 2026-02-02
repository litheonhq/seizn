import { getAuthOrReview } from "@/lib/auth-or-review";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { PlaygroundClient } from "./client";

export default async function PlaygroundPage() {
  await getAuthOrReview();

  return (
    <DashboardShell>
      <PlaygroundClient />
    </DashboardShell>
  );
}
