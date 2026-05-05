import { getAuthOrReview } from "@/lib/auth-or-review";
import DashboardShell from "@/components/dashboard/DashboardShell";
import OrganizationDetailClient from "./client";

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await getAuthOrReview();
  const { id } = await params;

  return (
    <DashboardShell>
      <OrganizationDetailClient organizationId={id} />
    </DashboardShell>
  );
}
