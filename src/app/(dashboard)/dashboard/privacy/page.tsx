import { getAuthOrReview } from "@/lib/auth-or-review";
import DashboardShell from "@/components/dashboard/DashboardShell";
import PrivacyClient from "./privacy-client";

export default async function PrivacyPage() {
  await getAuthOrReview();

  return (
    <DashboardShell>
      <PrivacyClient />
    </DashboardShell>
  );
}
