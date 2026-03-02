"use client";

import dynamic from "next/dynamic";

// Loading skeleton for Evals page
const EvalsSkeleton = () => (
  <div className="space-y-6">
    {/* Header skeleton */}
    <div className="szn-card rounded-2xl p-6">
      <div className="animate-pulse flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-szn-surface-1" />
        <div>
          <div className="h-6 w-32 bg-szn-surface-1 rounded mb-2" />
          <div className="h-4 w-48 bg-szn-surface rounded" />
        </div>
      </div>
    </div>

    {/* Content skeleton */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="szn-card rounded-2xl p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-32 bg-szn-surface-1 rounded" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-szn-surface rounded" />
          ))}
        </div>
      </div>
      <div className="lg:col-span-2 szn-card rounded-2xl p-6">
        <div className="animate-pulse">
          <div className="h-6 w-48 bg-szn-surface-1 rounded mb-4" />
          <div className="h-64 bg-szn-surface rounded" />
        </div>
      </div>
    </div>
  </div>
);

/**
 * Dynamically loaded EvalsClient
 * - Lazy loads Recharts library (~200KB)
 * - Shows skeleton while loading
 * - SSR disabled since it's client-only
 */
export const DynamicEvalsClient = dynamic(
  () => import("./evals-client"),
  {
    loading: () => <EvalsSkeleton />,
    ssr: false,
  }
);
