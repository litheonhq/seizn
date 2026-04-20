import { getAuthOrReview } from "@/lib/auth-or-review";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { ModerationClient } from "./moderation-client";

export const metadata = {
  title: "Moderation | Seizn Dashboard",
  description: "Manage memory write and recall moderation policies",
};

export default async function ModerationPage() {
  await getAuthOrReview();

  return (
    <DashboardShell>
      <ModerationClient />
    </DashboardShell>
  );
}
