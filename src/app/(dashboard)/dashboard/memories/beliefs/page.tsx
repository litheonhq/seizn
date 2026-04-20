import Link from "next/link";
import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { createServerClient } from "@/lib/supabase";
import {
  listBeliefsForDashboard,
  resolveBeliefOrganizationId,
  type BeliefShard,
} from "@/lib/memory/belief";

export const metadata: Metadata = {
  title: "Belief Graph - Seizn Dashboard",
  description: "Inspect perspective-aware belief shards for NPC memory recall.",
  robots: {
    index: false,
    follow: false,
  },
};

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function confidenceLabel(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function BeliefTable({ beliefs }: { beliefs: BeliefShard[] }) {
  if (beliefs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-szn-border bg-szn-card p-8">
        <p className="text-sm font-medium text-szn-text-1">No belief shards yet</p>
        <p className="mt-2 max-w-xl text-sm text-szn-text-2">
          Use the beliefs API to record which NPC witnessed each fact before enabling perspective-aware recall.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-szn-border bg-szn-card">
      <table className="min-w-full divide-y divide-szn-border">
        <thead className="bg-szn-bg">
          <tr>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Holder</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Fact</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Source</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Confidence</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Observed</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">State</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-szn-border">
          {beliefs.map((belief) => (
            <tr key={belief.id}>
              <td className="px-5 py-4 font-mono text-xs text-szn-text-1">{belief.holderEntityId}</td>
              <td className="px-5 py-4 font-mono text-xs text-szn-text-2">{belief.aboutFactId}</td>
              <td className="px-5 py-4">
                <span className="rounded bg-szn-signal-soft px-2 py-1 text-[11px] text-szn-signal">
                  {belief.sourceType}
                </span>
              </td>
              <td className="px-5 py-4 font-mono text-sm text-szn-text-1">{confidenceLabel(belief.confidence)}</td>
              <td className="px-5 py-4 text-sm text-szn-text-2">{formatWhen(belief.observedAt)}</td>
              <td className="px-5 py-4 text-sm">
                {belief.revokedAt ? (
                  <span className="text-red-300">revoked</span>
                ) : (
                  <span className="text-szn-text-1">active</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function BeliefGraphPage() {
  const authState = await getAuthOrReview();
  const supabase = createServerClient();
  const organizationId = authState.isAuthenticated
    ? await resolveBeliefOrganizationId(supabase, {
        userId: authState.user.id,
        keyId: null,
      })
    : null;
  const beliefs = organizationId
    ? await listBeliefsForDashboard(organizationId, { limit: 50 }, supabase)
    : [];

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <div className="mb-4 flex items-center rounded-lg border border-szn-border bg-szn-card w-fit overflow-hidden">
            <Link
              href="/dashboard/memories"
              className="px-3 py-2 text-xs font-medium text-szn-text-2 hover:text-szn-signal hover:bg-szn-surface-1 transition-colors"
            >
              Memories
            </Link>
            <span className="px-3 py-2 text-xs font-medium bg-szn-signal-soft text-szn-signal">
              Belief graph
            </span>
          </div>
          <p className="font-mono text-[11px] uppercase text-szn-signal">07 / Perspective Layer</p>
          <h1 className="mt-2 text-3xl font-semibold text-szn-text-1">Belief Graph</h1>
          <p className="mt-2 max-w-2xl text-sm text-szn-text-2">
            Recall only the facts a character observed, heard, inferred, or still believes at the current scene time.
          </p>
        </div>

        <BeliefTable beliefs={beliefs} />
      </div>
    </DashboardShell>
  );
}
