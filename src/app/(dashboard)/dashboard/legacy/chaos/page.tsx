import DashboardShell from "@/components/dashboard/DashboardShell";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { listChaosRuns } from "@/lib/chaos/runner";
import type { ChaosRun } from "@/lib/chaos/types";
import { resolveMemoryBudgetOrganizationId } from "@/lib/memory/budget";
import { createServerClient } from "@/lib/supabase";
import { ChaosClient } from "./chaos-client";

export const metadata = {
  title: "NPC Chaos Monkey | Seizn Dashboard",
  description: "Run adversarial NPC simulations and group failures by canon, safety, contradiction, and dead-end category.",
};

export default async function ChaosPage() {
  const authState = await getAuthOrReview();
  let runs: ChaosRun[] = [];
  let loadError: string | null = null;

  if (authState.isAuthenticated) {
    const supabase = createServerClient();
    const organizationId = await resolveMemoryBudgetOrganizationId(supabase, {
      userId: authState.user.id,
      keyId: null,
    });

    if (organizationId) {
      try {
        runs = await listChaosRuns(organizationId, supabase, 25);
      } catch (error) {
        loadError = error instanceof Error ? error.message : "chaos_unavailable";
      }
    } else {
      loadError = "organization_required";
    }
  }

  return (
    <DashboardShell>
      <ChaosClient initialRuns={runs} loadError={loadError} live={authState.isAuthenticated} />
    </DashboardShell>
  );
}
