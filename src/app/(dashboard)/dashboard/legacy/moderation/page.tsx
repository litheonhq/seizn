import { getAuthOrReview } from "@/lib/auth-or-review";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { createServerClient } from "@/lib/supabase";
import {
  listModerationDecisions,
  resolveModerationOrganizationId,
  type ModerationDecision,
} from "@/lib/moderation/guard";
import { ModerationClient } from "./moderation-client";

export const metadata = {
  title: "Moderation | Seizn Dashboard",
  description: "Manage memory write and recall moderation policies",
};

export default async function ModerationPage() {
  const authState = await getAuthOrReview();
  let decisions: ModerationDecision[] = [];
  let decisionLoadError: string | null = null;

  if (authState.isAuthenticated) {
    const supabase = createServerClient();
    const organizationId = await resolveModerationOrganizationId(supabase, {
      userId: authState.user.id,
      keyId: null,
    });

    if (organizationId) {
      try {
        decisions = await listModerationDecisions(organizationId, supabase, { limit: 50 });
      } catch (error) {
        decisionLoadError = error instanceof Error ? error.message : "moderation_decisions_unavailable";
      }
    }
  }

  return (
    <DashboardShell>
      <ModerationClient initialDecisions={decisions} decisionLoadError={decisionLoadError} />
    </DashboardShell>
  );
}
