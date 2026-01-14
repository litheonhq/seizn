"use client";

import dynamic from "next/dynamic";
import type { CandidateListProps } from "./CandidateList";

// Loading skeleton for CandidateList
const CandidateListSkeleton = () => (
  <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
    <div className="animate-pulse">
      <div className="h-6 w-32 bg-gray-700 rounded mb-4" />
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 bg-gray-800 rounded" />
        ))}
      </div>
    </div>
  </div>
);

/**
 * Dynamically loaded CandidateList
 * - Lazy loads Recharts library for chart view
 * - Shows skeleton while loading
 */
export const DynamicCandidateList = dynamic<CandidateListProps>(
  () => import("./CandidateList").then((mod) => mod.CandidateList),
  {
    loading: () => <CandidateListSkeleton />,
    ssr: false,
  }
);
