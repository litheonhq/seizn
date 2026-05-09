import { Suspense } from "react";
import { getAuthOrReview } from "@/lib/auth-or-review";
import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/dashboard/redesign/workspace-shell";
import MindMapCanvas from "./MindMapCanvas";

export const metadata: Metadata = {
  title: "Memory Mind Map - Seizn Dashboard",
  description:
    "Visualize NPC memory as an interactive knowledge graph. Navigate relationships between NPCs, factions, events, and facts.",
  openGraph: {
    title: "Memory Mind Map - Seizn Dashboard",
    description:
      "Visualize NPC memory as an interactive knowledge graph. Navigate relationships between NPCs, factions, events, and facts.",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
  },
};

// Loading skeleton component
function MindMapSkeleton() {
  return (
    <div className="h-[calc(100vh-8rem)] flex items-center justify-center bg-szn-bg rounded-lg">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-4 border-szn-accent border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-szn-text-2">Loading NPC memory graph...</p>
      </div>
    </div>
  );
}

export default async function MindMapPage() {
  const { user } = await getAuthOrReview();

  return (
    <WorkspaceShell
      userName={user.name ?? user.email ?? "Author"}
      userPlanLabel="Studio"
      currentLabel="Mind Map"
    >
      <main className="min-h-0 flex-1 overflow-hidden bg-[var(--bg-app)] p-4">
        <Suspense fallback={<MindMapSkeleton />}>
          <MindMapCanvas />
        </Suspense>
      </main>
    </WorkspaceShell>
  );
}
