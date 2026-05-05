import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { resolveMemoryBudgetOrganizationId } from "@/lib/memory/budget";
import { listPostMortemReports } from "@/lib/post-mortem/report";
import type { PostMortemReportRecord } from "@/lib/post-mortem/types";
import { createServerClient } from "@/lib/supabase";
import { PostMortemClient } from "./post-mortem-client";

export const metadata: Metadata = {
  title: "Post-Mortem Reports | Seizn Dashboard",
  description: "Generate shipped-title post-mortem reports from replay, canon, chaos, Story Health, and billing signals.",
};

export default async function PostMortemPage() {
  const authState = await getAuthOrReview();
  let reports: PostMortemReportRecord[] = [];
  let loadError: string | null = null;

  if (authState.isAuthenticated) {
    const supabase = createServerClient();
    const organizationId = await resolveMemoryBudgetOrganizationId(supabase, {
      userId: authState.user.id,
      keyId: null,
    });

    if (organizationId) {
      try {
        reports = await listPostMortemReports(organizationId, supabase, 40);
      } catch (error) {
        loadError = error instanceof Error ? error.message : "post_mortem_unavailable";
      }
    } else {
      loadError = "organization_required";
    }
  }

  return (
    <DashboardShell>
      <PostMortemClient reports={reports} loadError={loadError} live={authState.isAuthenticated} />
    </DashboardShell>
  );
}
