import { getAuthOrReview } from "@/lib/auth-or-review";
import DashboardShell from "@/components/dashboard/DashboardShell";
import WebhooksClient from "./webhooks-client";

export default async function WebhooksPage() {
  await getAuthOrReview();

  return (
    <DashboardShell>
      <WebhooksClient />
    </DashboardShell>
  );
}
