import { Suspense } from "react";
import { getAuthOrReview } from "@/lib/auth-or-review";
import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import CandidatesClient from "./CandidatesClient";

export const metadata: Metadata = {
  title: "Memory Candidates - Seizn Dashboard",
  description:
    "Review and approve AI-extracted memory candidates. Manage pending memories before they become active in your knowledge base.",
  openGraph: {
    title: "Memory Candidates - Seizn Dashboard",
    description:
      "Review and approve AI-extracted memory candidates. Manage pending memories before they become active.",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
  },
};

function CandidatesSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/3" />
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-32 bg-gray-100 dark:bg-[var(--ink-800)] rounded-xl animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

export default async function CandidatesPage() {
  await getAuthOrReview();

  return (
    <DashboardShell>
      <Suspense fallback={<CandidatesSkeleton />}>
        <CandidatesClient />
      </Suspense>
    </DashboardShell>
  );
}
