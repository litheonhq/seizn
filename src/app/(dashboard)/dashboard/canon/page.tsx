import DashboardShell from "@/components/dashboard/DashboardShell";
import { getAuthOrReview } from "@/lib/auth-or-review";
import {
  listCanonLocks,
  listCanonViolations,
  type CanonViolationRecord,
} from "@/lib/canon/enforce";
import type { CanonLock } from "@/lib/canon/validator";
import { resolveMemoryBudgetOrganizationId } from "@/lib/memory/budget";
import { createServerClient } from "@/lib/supabase";
import { CanonClient } from "./canon-client";

export const metadata = {
  title: "Canon Lock | Seizn Dashboard",
  description: "Define inviolable NPC and world facts for memory writes.",
};

export default async function CanonPage() {
  const authState = await getAuthOrReview();
  let locks: CanonLock[] = [];
  let violations: CanonViolationRecord[] = [];
  let loadError: string | null = null;

  if (authState.isAuthenticated) {
    const supabase = createServerClient();
    const organizationId = await resolveMemoryBudgetOrganizationId(supabase, {
      userId: authState.user.id,
      keyId: null,
    });

    if (organizationId) {
      try {
        [locks, violations] = await Promise.all([
          listCanonLocks(organizationId, supabase),
          listCanonViolations(organizationId, supabase, { limit: 50 }),
        ]);
      } catch (error) {
        loadError = error instanceof Error ? error.message : "canon_unavailable";
      }
    } else {
      loadError = "organization_required";
    }
  }

  return (
    <DashboardShell>
      <CanonClient
        initialLocks={locks}
        initialViolations={violations}
        loadError={loadError}
        live={authState.isAuthenticated}
      />
    </DashboardShell>
  );
}
