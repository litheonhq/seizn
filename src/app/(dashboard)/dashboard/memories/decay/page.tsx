import Link from "next/link";
import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { createServerClient } from "@/lib/supabase";
import {
  listDecayPolicies,
  resolveDecayOrganizationId,
  type DecayPolicy,
} from "@/lib/memory/decay";

export const metadata: Metadata = {
  title: "Memory Decay - Seizn Dashboard",
  description: "Manage forgetting curves and reinforcement policies by memory class.",
  robots: {
    index: false,
    follow: false,
  },
};

function formatHalfLife(value: number | null): string {
  if (value == null) return "Never";
  if (value < 24) return `${value}h`;
  return `${(value / 24).toFixed(1)}d`;
}

function PolicyTable({ policies }: { policies: DecayPolicy[] }) {
  if (policies.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-szn-border bg-szn-card p-8">
        <p className="text-sm font-medium text-szn-text-1">No decay policies yet</p>
        <p className="mt-2 max-w-xl text-sm text-szn-text-2">
          Create a policy through `/api/v1/decay-policies/default`; memories use the built-in 72h half-life until then.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-szn-border bg-szn-card">
      <table className="min-w-full divide-y divide-szn-border">
        <thead className="bg-szn-bg">
          <tr>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Class</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Half-life</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Min</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Boost</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Rerank</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-szn-border">
          {policies.map((policy) => (
            <tr key={policy.memoryClass}>
              <td className="px-5 py-4 font-mono text-xs text-szn-text-1">{policy.memoryClass}</td>
              <td className="px-5 py-4 text-sm text-szn-text-2">{formatHalfLife(policy.halfLifeHours)}</td>
              <td className="px-5 py-4 font-mono text-sm text-szn-text-1">{policy.minStrength.toFixed(2)}</td>
              <td className="px-5 py-4 font-mono text-sm text-szn-text-1">{policy.reinforceBoost.toFixed(2)}</td>
              <td className="px-5 py-4 font-mono text-sm text-szn-signal">{policy.rerankWeight.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function MemoryDecayPage() {
  const authState = await getAuthOrReview();
  const supabase = createServerClient();
  const organizationId = authState.isAuthenticated
    ? await resolveDecayOrganizationId(supabase, {
        userId: authState.user.id,
        keyId: null,
      })
    : null;
  const policies = organizationId ? await listDecayPolicies(organizationId, supabase) : [];

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
              Decay
            </span>
          </div>
          <p className="font-mono text-[11px] uppercase text-szn-signal">08 / Forgetting Curves</p>
          <h1 className="mt-2 text-3xl font-semibold text-szn-text-1">Memory Decay</h1>
          <p className="mt-2 max-w-2xl text-sm text-szn-text-2">
            Tune how fast small talk fades, keep plot facts stable, and reinforce memories when recall proves they still matter.
          </p>
        </div>

        <PolicyTable policies={policies} />
      </div>
    </DashboardShell>
  );
}
