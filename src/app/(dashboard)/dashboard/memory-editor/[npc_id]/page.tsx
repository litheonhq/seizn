import Link from "next/link";
import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { MemoryEditorGrid } from "@/components/memory-editor/grid";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { resolveMemoryBudgetOrganizationId } from "@/lib/memory/budget";
import { loadMemoryEditorRows } from "@/lib/memory-editor/server";
import type { MemoryEditorRow } from "@/lib/memory-editor/diff";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "NPC Memory Editor | Seizn Dashboard",
};

interface NpcMemoryEditorPageProps {
  params: Promise<{ npc_id: string }>;
}

export default async function NpcMemoryEditorPage({ params }: NpcMemoryEditorPageProps) {
  const { npc_id: npcId } = await params;
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
        { npcId, limit: 1000 }
      );
    } catch (error) {
      loadError = error instanceof Error ? error.message : "memory_editor_unavailable";
    }
  } else {
    loadError = "login_required";
  }

  return (
    <DashboardShell>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Link href="/dashboard/memory-editor" className="mb-6 inline-flex text-xs text-szn-signal hover:text-szn-text-1">
          MEMORY EDITOR
        </Link>
        <header className="mb-7 border-b border-szn-border-subtle pb-7">
          <div className="szn-section-number mb-5">NPC FOCUS</div>
          <h1 className="break-all font-mono text-4xl font-semibold leading-tight text-szn-text-1 sm:text-5xl">
            {npcId}
          </h1>
          <p className="mt-4 text-[15px] leading-7 text-szn-text-2">
            {memories.length.toLocaleString()} editable memories
          </p>
        </header>

        {loadError && (
          <div className="mb-5 border border-szn-border-subtle bg-szn-surface-1 px-4 py-3 text-sm text-szn-text-2">
            {loadError}
          </div>
        )}

        <MemoryEditorGrid initialRows={memories} focusedNpcId={npcId} />
      </main>
    </DashboardShell>
  );
}
