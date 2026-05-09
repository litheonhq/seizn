import { getAuthOrReview } from "@/lib/auth-or-review";
import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/dashboard/redesign/workspace-shell";
import MemoriesClient from "./memories-client";

export const metadata: Metadata = {
  title: "Memories - Seizn Dashboard",
  description: "Browse and manage stored NPC memories, entities, and retrieved context across your titles.",
  openGraph: {
    title: "Memories - Seizn Dashboard",
    description: "Browse and manage stored NPC memories, entities, and retrieved context across your titles.",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function MemoriesPage() {
  const { user } = await getAuthOrReview();

  return (
    <WorkspaceShell
      userName={user.name ?? user.email ?? "Author"}
      userPlanLabel="Studio"
      currentLabel="Memories"
    >
      <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg-app)] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl pb-16">
          <MemoriesClient />
        </div>
      </main>
    </WorkspaceShell>
  );
}
