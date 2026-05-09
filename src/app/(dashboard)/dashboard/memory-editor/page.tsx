import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/dashboard/redesign/workspace-shell";
import { MemoryEditorGrid } from "@/components/memory-editor/grid";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { resolveMemoryBudgetOrganizationId } from "@/lib/memory/budget";
import { loadMemoryEditorRows } from "@/lib/memory-editor/server";
import type { MemoryEditorRow } from "@/lib/memory-editor/diff";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Memory Editor | Seizn Dashboard",
};

export default async function MemoryEditorPage() {
  const authState = await getAuthOrReview();
  let memories: MemoryEditorRow[] = [];
  let loadError: string | null = null;

  if (authState.isAuthenticated) {
    const supabase = createServerClient();
    const organizationId = await resolveMemoryBudgetOrganizationId(supabase, {
      userId: authState.user.id,
      keyId: null,
    });

    try {
      memories = await loadMemoryEditorRows(
        { supabase, userId: authState.user.id, organizationId },
        { limit: 1000 }
      );
    } catch (error) {
      loadError = error instanceof Error ? error.message : "memory_editor_unavailable";
    }
  } else {
    loadError = "login_required";
  }

  return (
    <WorkspaceShell
      userName={authState.user.name ?? authState.user.email ?? "Author"}
      userPlanLabel="Studio"
      currentLabel="Memory Editor"
    >
      <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg-app)]">
        <div className="mx-auto max-w-7xl px-4 py-8 pb-16">
          <header className="mb-7 border-b border-szn-border-subtle pb-7">
            <div className="szn-section-number mb-5">10 / DESIGNER MEMORY UI</div>
            <h1 className="szn-serif text-5xl leading-none text-szn-text-1 sm:text-6xl">
              Memory Editor
            </h1>
            <p className="mt-4 max-w-3xl text-[15px] leading-7 text-szn-text-2">
              Spreadsheet editing for NPC memories with CSV round-trip and Canon Lock checks.
            </p>
          </header>

          {loadError && (
            <div className="mb-5 border border-szn-border-subtle bg-szn-surface-1 px-4 py-3 text-sm text-szn-text-2">
              {loadError}
            </div>
          )}

          <MemoryEditorGrid initialRows={memories} />
        </div>
      </main>
    </WorkspaceShell>
  );
}
