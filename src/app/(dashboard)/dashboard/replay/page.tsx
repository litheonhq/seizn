import Link from "next/link";
import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/dashboard/redesign/workspace-shell";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { createServerClient } from "@/lib/supabase";
import { resolveReplayOrganizationId } from "@/lib/replay/snapshot";

export const metadata: Metadata = {
  title: "Replay - Seizn Dashboard",
  description: "Inspect deterministic replay snapshots for NPC memory requests.",
  robots: {
    index: false,
    follow: false,
  },
};

interface ReplayPageProps {
  searchParams?: Promise<{ traceIds?: string; source?: string; metric?: string }>;
}

function parseTraceIds(value?: string) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => {
      try {
        return decodeURIComponent(item).trim();
      } catch {
        return item.trim();
      }
    })
    .filter((item) => /^[0-9a-f-]{16,}$/i.test(item))
    .slice(0, 50);
}

export default async function ReplayPage({ searchParams }: ReplayPageProps) {
  const query = searchParams ? await searchParams : {};
  const traceIds = parseTraceIds(query.traceIds);
  const { user, isAuthenticated } = await getAuthOrReview();
  const organizationId = isAuthenticated
    ? await resolveReplayOrganizationId(user.id, null)
    : null;
  const snapshots = organizationId ? await loadReplayRows(organizationId, traceIds) : [];

  return (
    <WorkspaceShell
      userName={user.name ?? user.email ?? "Author"}
      userPlanLabel="Studio"
      currentLabel="Replay"
    >
      <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg-app)] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-8 pb-16">
          <header className="border-b border-szn-border-subtle pb-8">
            <div className="szn-section-number mb-4">05 / REPLAY LAYER</div>
            <h1 className="szn-serif text-[clamp(36px,5vw,72px)] leading-none text-szn-text-1">
              Deterministic Replay
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-szn-text-2">
              Reproduce memory reads, writes, tool calls, and provider metadata from past NPC turns.
            </p>
            {traceIds.length > 0 && (
              <p className="mt-3 font-mono text-xs text-szn-signal">
                FILTERED / {traceIds.length} story-health trace{traceIds.length === 1 ? "" : "s"}
              </p>
            )}
          </header>

          <section className="border-y border-szn-border-subtle">
            <div className="grid grid-cols-[minmax(220px,1.2fr)_1fr_120px_170px] gap-px bg-szn-border-subtle text-[13px]">
              <div className="bg-szn-bg px-4 py-3 font-mono text-szn-text-3">trace_id</div>
              <div className="bg-szn-bg px-4 py-3 font-mono text-szn-text-3">endpoint</div>
              <div className="bg-szn-bg px-4 py-3 font-mono text-szn-text-3">duration</div>
              <div className="bg-szn-bg px-4 py-3 font-mono text-szn-text-3">created</div>
              {snapshots.length === 0 ? (
                <div className="col-span-4 bg-szn-bg px-4 py-10 text-szn-text-2">
                  No replay snapshots captured yet.
                </div>
              ) : (
                snapshots.map((snapshot) => (
                  <ReplayRow key={snapshot.trace_id} snapshot={snapshot} />
                ))
              )}
            </div>
          </section>
        </div>
      </main>
    </WorkspaceShell>
  );
}

function ReplayRow({ snapshot }: { snapshot: ReplayRowData }) {
  return (
    <>
      <Link
        href={`/dashboard/replay/${snapshot.trace_id}`}
        className="bg-szn-bg px-4 py-4 font-mono text-szn-signal underline-offset-4 hover:underline"
      >
        {snapshot.trace_id}
      </Link>
      <div className="bg-szn-bg px-4 py-4 font-mono text-szn-text-1">{snapshot.endpoint}</div>
      <div className="bg-szn-bg px-4 py-4 font-mono text-szn-text-2">{snapshot.duration_ms}ms</div>
      <div className="bg-szn-bg px-4 py-4 font-mono text-szn-text-2">
        {new Date(snapshot.created_at).toISOString().slice(0, 16).replace("T", " ")}
      </div>
    </>
  );
}

interface ReplayRowData {
  trace_id: string;
  endpoint: string;
  duration_ms: number;
  created_at: string;
}

async function loadReplayRows(organizationId: string, traceIds: string[] = []): Promise<ReplayRowData[]> {
  const supabase = createServerClient();
  let query = supabase
    .from("replay_snapshots")
    .select("trace_id, endpoint, duration_ms, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (traceIds.length > 0) query = query.in("trace_id", traceIds);

  const { data, error } = await query;

  if (error || !data) return [];
  return data as ReplayRowData[];
}
