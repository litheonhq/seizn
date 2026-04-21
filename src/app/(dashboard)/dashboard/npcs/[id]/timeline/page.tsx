import Link from "next/link";
import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { Timeline } from "@/components/viz/timeline";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { resolveMemoryBudgetOrganizationId } from "@/lib/memory/budget";
import {
  createSampleTimelineData,
  loadNpcTimeline,
} from "@/lib/npc-graph/server";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "NPC Timeline | Seizn Dashboard",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NpcTimelinePage({ params }: PageProps) {
  const { id } = await params;
  const npcId = decodeURIComponent(id);
  const authState = await getAuthOrReview();
  const supabase = createServerClient();
  let loadError: string | null = null;
  let timeline = createSampleTimelineData(npcId, 0);

  if (authState.isAuthenticated) {
    try {
      const organizationId = await resolveMemoryBudgetOrganizationId(supabase, {
        userId: authState.user.id,
        keyId: null,
      });
      timeline = await loadNpcTimeline(
        { supabase, userId: authState.user.id, organizationId },
        npcId,
        { limit: 500 }
      );
    } catch (error) {
      loadError = error instanceof Error ? error.message : "npc_timeline_unavailable";
    }
  } else {
    timeline = createSampleTimelineData(npcId, 500);
  }

  return (
    <DashboardShell>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link href="/dashboard/memory-editor" className="text-xs uppercase text-szn-text-3 hover:text-szn-signal">
            Memory editor
          </Link>
          <span className="text-szn-text-3">/</span>
          <Link href={`/dashboard/npcs/${encodeURIComponent(npcId)}/graph`} className="text-xs uppercase text-szn-text-3 hover:text-szn-signal">
            Relationship graph
          </Link>
        </div>

        <header className="mb-7 border-b border-szn-border-subtle pb-7">
          <div className="szn-section-number mb-5">11 / NPC TIMELINE</div>
          <h1 className="break-all font-mono text-4xl font-semibold leading-tight text-szn-text-1 sm:text-5xl">
            {npcId}
          </h1>
          <p className="mt-4 max-w-3xl text-[15px] leading-7 text-szn-text-2">
            Memory, canon, gossip, and moderation events over time. Use zoom and pan for dense NPC histories.
          </p>
        </header>

        {loadError && (
          <div className="mb-5 border border-szn-border-subtle bg-szn-surface-1 px-4 py-3 text-sm text-szn-text-2">
            {loadError}
          </div>
        )}

        <Timeline data={timeline} />
      </main>
    </DashboardShell>
  );
}
