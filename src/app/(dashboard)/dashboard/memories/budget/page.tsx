import Link from "next/link";
import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { createServerClient } from "@/lib/supabase";
import { listBudgetSnapshots, type BudgetSnapshot } from "@/lib/memory/budget-telemetry";
import { resolveMemoryBudgetOrganizationId } from "@/lib/memory/budget";

export const metadata: Metadata = {
  title: "Memory Budget - Seizn Dashboard",
  description: "Monitor hot, warm, and cold memory tier budgets by runtime entity.",
  robots: {
    index: false,
    follow: false,
  },
};

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)}MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)}KB`;
  return `${value}B`;
}

function percentage(used: number, budget: number): number {
  if (!budget) return 0;
  return Math.min(100, Math.round((used / budget) * 100));
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 84;
      const y = 26 - (value / max) * 22;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 84 28" className="h-7 w-24" aria-hidden="true">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} className="text-szn-signal" />
    </svg>
  );
}

function BudgetBar({ used, budget }: { used: number; budget: number }) {
  const pct = percentage(used, budget);
  return (
    <div className="min-w-32">
      <div className="mb-1 flex items-center justify-between text-[11px] text-szn-text-3">
        <span>{pct}%</span>
        <span>{formatBytes(used)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-szn-surface-1">
        <div className="h-full bg-szn-signal transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-szn-border bg-szn-card p-8">
      <p className="text-sm font-medium text-szn-text-1">No entity budgets yet</p>
      <p className="mt-2 max-w-xl text-sm text-szn-text-2">
        New memory writes create budget counters automatically after the memory budget migration is applied.
      </p>
    </div>
  );
}

function BudgetTable({ snapshots }: { snapshots: BudgetSnapshot[] }) {
  if (snapshots.length === 0) return <EmptyState />;

  return (
    <div className="overflow-hidden rounded-lg border border-szn-border bg-szn-card">
      <table className="min-w-full divide-y divide-szn-border">
        <thead className="bg-szn-bg">
          <tr>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Entity</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Hot</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Warm</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Cold</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">24h Recalls</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Demotions</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">7d</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-szn-border">
          {snapshots.map((snapshot) => (
            <tr key={snapshot.entityId}>
              <td className="px-5 py-4 font-mono text-xs text-szn-text-1">{snapshot.entityId}</td>
              <td className="px-5 py-4"><BudgetBar used={snapshot.hotUsedBytes} budget={snapshot.hotBudgetBytes} /></td>
              <td className="px-5 py-4"><BudgetBar used={snapshot.warmUsedBytes} budget={snapshot.warmBudgetBytes} /></td>
              <td className="px-5 py-4 text-sm text-szn-text-2">{formatBytes(snapshot.coldUsedBytes)}</td>
              <td className="px-5 py-4 font-mono text-sm text-szn-text-1">{snapshot.totalRecallsLast24h}</td>
              <td className="px-5 py-4 font-mono text-sm text-szn-text-1">{snapshot.demotionsLast24h}</td>
              <td className="px-5 py-4"><Sparkline values={snapshot.demotionsLast7d} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DemotionTargets({ snapshots }: { snapshots: BudgetSnapshot[] }) {
  const targets = snapshots
    .flatMap((snapshot) =>
      snapshot.topDemotionTargets.map((target) => ({
        ...target,
        entityId: snapshot.entityId,
      }))
    )
    .slice(0, 10);

  if (targets.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-szn-text-1">Top demotion targets</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {targets.map((target) => (
          <div key={`${target.entityId}-${target.memoryId}`} className="rounded-lg border border-szn-border bg-szn-card p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="font-mono text-xs text-szn-text-1">{target.memoryId}</p>
              <span className="rounded bg-szn-signal-soft px-2 py-1 text-[11px] text-szn-signal">
                {formatBytes(target.sizeBytes)}
              </span>
            </div>
            <p className="mt-2 text-xs text-szn-text-2">
              {target.entityId} · {target.recallCount} recalls
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function MemoryBudgetPage() {
  const authState = await getAuthOrReview();
  const supabase = createServerClient();
  const organizationId = authState.isAuthenticated
    ? await resolveMemoryBudgetOrganizationId(supabase, {
        userId: authState.user.id,
        keyId: null,
      })
    : null;
  const snapshots = organizationId
    ? await listBudgetSnapshots(organizationId, { limit: 50 }, supabase)
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
              Budget
            </span>
          </div>
          <p className="font-mono text-[11px] uppercase text-szn-signal">05 / Tier Controls</p>
          <h1 className="mt-2 text-3xl font-semibold text-szn-text-1">Memory Budget</h1>
          <p className="mt-2 max-w-2xl text-sm text-szn-text-2">
            Keep plot-critical context hot, page low-activation memories down, and monitor token pressure by entity.
          </p>
        </div>

        <BudgetTable snapshots={snapshots} />
        <DemotionTargets snapshots={snapshots} />
      </div>
    </DashboardShell>
  );
}
