import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { ImportWizardClient } from "./import-wizard-client";

export const metadata: Metadata = {
  title: "Competitor Import | Seizn Dashboard",
  description: "Preview, commit, and roll back Inworld, Convai, and Rivet exports into Seizn.",
};

export default async function CompetitorImportPage() {
  const authState = await getAuthOrReview();

  return (
    <DashboardShell>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-7 border-b border-szn-border-subtle pb-7">
          <div className="szn-section-number mb-5">15 / COMPETITOR IMPORT</div>
          <h1 className="szn-serif text-5xl leading-none text-szn-text-1 sm:text-6xl">
            Import NPC memory from other stacks.
          </h1>
          <p className="mt-4 max-w-3xl text-[15px] leading-7 text-szn-text-2">
            Upload Inworld, Convai, or Rivet exports, inspect the normalized Seizn entities, commit them
            into memory/canon/belief tables, and roll the job back cleanly if the mapping is wrong.
          </p>
        </header>

        <ImportWizardClient live={authState.isAuthenticated} />
      </main>
    </DashboardShell>
  );
}
