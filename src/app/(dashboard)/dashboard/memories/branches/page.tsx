import Link from "next/link";
import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { createServerClient } from "@/lib/supabase";
import {
  listBranchEntries,
  listMemoryBranches,
  type BranchOperation,
  type MemoryBranch,
  type MemoryBranchEntry,
} from "@/lib/memory/versioning";

export const metadata: Metadata = {
  title: "Memory Branches - Seizn Dashboard",
  description: "Inspect memory branch, diff, and rollback history for NPC memory operations.",
  robots: {
    index: false,
    follow: false,
  },
};

interface BranchRow {
  branch: MemoryBranch;
  entries: MemoryBranchEntry[];
}

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function shortId(value: string | null): string {
  if (!value) return "-";
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function countOperations(entries: MemoryBranchEntry[]): Record<BranchOperation, number> {
  return entries.reduce<Record<BranchOperation, number>>(
    (acc, entry) => {
      acc[entry.operation] += 1;
      return acc;
    },
    { added: 0, updated: 0, deleted: 0 }
  );
}

function operationTone(operation: BranchOperation): string {
  if (operation === "added") return "text-emerald-300 bg-emerald-500/10";
  if (operation === "deleted") return "text-rose-300 bg-rose-500/10";
  return "text-szn-signal bg-szn-signal-soft";
}

async function loadBranchRows(userId: string): Promise<BranchRow[]> {
  const supabase = createServerClient();
  const branches = await listMemoryBranches(supabase, { userId, namespace: "default" });
  const entriesByBranch = await Promise.all(
    branches.slice(0, 50).map((branch) => listBranchEntries(supabase, branch.id))
  );

  return branches.slice(0, 50).map((branch, index) => ({
    branch,
    entries: entriesByBranch[index] || [],
  }));
}

function BranchSummary({ rows }: { rows: BranchRow[] }) {
  const activeCount = rows.filter((row) => row.branch.is_active).length;
  const entryCount = rows.reduce((sum, row) => sum + row.entries.length, 0);
  const rollbackCount = rows.reduce(
    (sum, row) => sum + row.entries.filter((entry) => entry.operation === "deleted").length,
    0
  );

  const stats = [
    ["Branches", rows.length],
    ["Active", activeCount],
    ["Entries", entryCount],
    ["Rollback marks", rollbackCount],
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-px border-y border-szn-border-subtle bg-szn-border-subtle lg:grid-cols-4">
      {stats.map(([label, value]) => (
        <div key={label} className="bg-szn-bg p-5">
          <div className="szn-eyebrow mb-3">{label}</div>
          <div className="font-mono text-[32px] leading-none text-szn-text-1 tabular-nums">{value}</div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border-y border-dashed border-szn-border-subtle py-12">
      <p className="text-sm font-medium text-szn-text-1">No memory branches yet</p>
      <p className="mt-2 max-w-xl text-sm leading-6 text-szn-text-2">
        Create a branch through `/api/v1/memory-branches` when you need a save-state, A/B memory
        path, or rollback checkpoint for an NPC test run.
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="border-y border-amber-300/30 bg-amber-500/10 p-6">
      <div className="szn-eyebrow mb-2 text-amber-200">Migration pending</div>
      <p className="text-sm text-amber-100">
        Memory branch tables are not readable from this environment yet. Apply the `20260421009`
        migration, then reload this page.
      </p>
      <p className="mt-3 font-mono text-xs text-amber-200/80">{message}</p>
    </div>
  );
}

function BranchTable({ rows }: { rows: BranchRow[] }) {
  if (rows.length === 0) return <EmptyState />;

  return (
    <div className="overflow-x-auto border-y border-szn-border-subtle">
      <table className="min-w-full divide-y divide-szn-border-subtle">
        <thead>
          <tr className="bg-szn-surface-1">
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Branch</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">State</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Entries</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Operations</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Base</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-szn-border-subtle">
          {rows.map(({ branch, entries }) => {
            const counts = countOperations(entries);
            const latest = entries[entries.length - 1] || null;

            return (
              <tr key={branch.id} className="align-top">
                <td className="px-5 py-4">
                  <div className="font-medium text-szn-text-1">{branch.name}</div>
                  <div className="mt-1 font-mono text-xs text-szn-text-3">{shortId(branch.id)}</div>
                  <div className="mt-2 text-xs text-szn-text-2">namespace: {branch.namespace}</div>
                </td>
                <td className="px-5 py-4">
                  {branch.is_active ? (
                    <span className="inline-flex rounded bg-szn-signal-soft px-2 py-1 text-[11px] text-szn-signal">
                      active
                    </span>
                  ) : (
                    <span className="inline-flex rounded bg-szn-surface-1 px-2 py-1 text-[11px] text-szn-text-2">
                      parked
                    </span>
                  )}
                </td>
                <td className="px-5 py-4">
                  <div className="font-mono text-sm text-szn-text-1">{entries.length}</div>
                  {latest ? (
                    <div className="mt-2 max-w-xs truncate text-xs text-szn-text-2">
                      latest: <span className={operationTone(latest.operation)}>{latest.operation}</span>{" "}
                      {shortId(latest.memory_id)}
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-szn-text-3">no entries</div>
                  )}
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(counts) as BranchOperation[]).map((operation) => (
                      <span
                        key={operation}
                        className={`rounded px-2 py-1 font-mono text-[11px] ${operationTone(operation)}`}
                      >
                        {operation}:{counts[operation]}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-4 font-mono text-xs text-szn-text-2">
                  <div>parent {shortId(branch.parent_branch_id)}</div>
                  <div className="mt-1">snapshot {shortId(branch.base_snapshot_id)}</div>
                </td>
                <td className="px-5 py-4 text-sm text-szn-text-2">{formatWhen(branch.updated_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function MemoryBranchesPage() {
  const authState = await getAuthOrReview();
  let rows: BranchRow[] = [];
  let loadError: string | null = null;

  if (authState.isAuthenticated) {
    try {
      rows = await loadBranchRows(authState.user.id);
    } catch (error) {
      loadError = error instanceof Error ? error.message : "memory_branch_dashboard_load_failed";
    }
  }

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <div className="mb-4 flex w-fit items-center overflow-hidden rounded-lg border border-szn-border bg-szn-card">
            <Link
              href="/dashboard/memories"
              className="px-3 py-2 text-xs font-medium text-szn-text-2 transition-colors hover:bg-szn-surface-1 hover:text-szn-signal"
            >
              Memories
            </Link>
            <span className="bg-szn-signal-soft px-3 py-2 text-xs font-medium text-szn-signal">
              Branches
            </span>
          </div>
          <p className="szn-section-number">11 / ROLLBACK LAYER</p>
          <h1 className="szn-serif mt-3 text-[clamp(34px,4vw,58px)] leading-[1.02] text-szn-text-1">
            Memory Branches
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-szn-text-2">
            Inspect save-state branches, staged memory edits, and rollback markers before they affect NPC recall.
          </p>
        </div>

        <BranchSummary rows={rows} />
        {loadError ? <ErrorState message={loadError} /> : <BranchTable rows={rows} />}
      </div>
    </DashboardShell>
  );
}
