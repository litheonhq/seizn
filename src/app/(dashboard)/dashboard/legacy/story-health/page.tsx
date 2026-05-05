import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { resolveMemoryBudgetOrganizationId } from "@/lib/memory/budget";
import { listStoryHealthSnapshots } from "@/lib/story-health/metrics";
import type { StoryHealthSnapshot } from "@/lib/story-health/types";
import { createServerClient } from "@/lib/supabase";
import { StoryHealthClient } from "./story-health-client";

export const metadata: Metadata = {
  title: "Story Health | Seizn Dashboard",
  description: "Narrative observability for NPC replay, canon, chaos, and bug-report signals.",
};

export default async function StoryHealthPage() {
  const authState = await getAuthOrReview();
  let snapshots: StoryHealthSnapshot[] = [];
  let loadError: string | null = null;

  if (authState.isAuthenticated) {
    const supabase = createServerClient();
    const organizationId = await resolveMemoryBudgetOrganizationId(supabase, {
      userId: authState.user.id,
      keyId: null,
    });

    if (organizationId) {
      try {
        snapshots = await listStoryHealthSnapshots(organizationId, supabase, { limit: 180 });
      } catch (error) {
        loadError = error instanceof Error ? error.message : "story_health_unavailable";
      }
    } else {
      loadError = "organization_required";
    }
  }

  return (
    <DashboardShell>
      <StoryHealthClient snapshots={snapshots} loadError={loadError} live={authState.isAuthenticated} />
    </DashboardShell>
  );
}
