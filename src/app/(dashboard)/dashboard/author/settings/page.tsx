import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/dashboard/redesign/workspace-shell";
import { AuthorSettingsClient } from "@/components/settings/author-settings-client";
import { getAuthOrReview } from "@/lib/auth-or-review";

export const metadata: Metadata = {
  title: "Author Settings - Seizn Dashboard",
  description: "Manage Author API keys, billing, usage, and sync settings.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AuthorSettingsPage() {
  const { user } = await getAuthOrReview();

  return (
    <WorkspaceShell
      userName={user.name ?? user.email ?? "Author"}
      userPlanLabel="Studio"
      currentLabel="Settings"
    >
      <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg-app)] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl pb-16">
          <AuthorSettingsClient />
        </div>
      </main>
    </WorkspaceShell>
  );
}
