import Link from "next/link";
import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { resolveReplayOrganizationId, loadSnapshot } from "@/lib/replay/snapshot";
import { ReplayActions } from "./ReplayActions";
import { ExportPanel } from "./export-panel";

export const metadata: Metadata = {
  title: "Replay Detail - Seizn Dashboard",
  robots: {
    index: false,
    follow: false,
  },
};

interface ReplayDetailParams {
  params: Promise<{ traceId: string }>;
}

export default async function ReplayDetailPage({ params }: ReplayDetailParams) {
  const { traceId } = await params;
  const { user, isAuthenticated } = await getAuthOrReview();
  const organizationId = isAuthenticated
    ? await resolveReplayOrganizationId(user.id, null)
    : null;
  const snapshot = organizationId ? await loadSnapshot(traceId, organizationId) : null;

  return (
    <DashboardShell>
      <main className="space-y-8">
        <header className="border-b border-szn-border-subtle pb-8">
          <Link href="/dashboard/replay" className="font-mono text-[12px] text-szn-signal">
            BACK TO REPLAY
          </Link>
          <div className="szn-section-number mt-6 mb-4">TRACE / DETAIL</div>
          <h1 className="break-all font-mono text-[clamp(22px,3vw,36px)] leading-tight text-szn-text-1">
            {traceId}
          </h1>
        </header>

        {!snapshot ? (
          <div className="border-y border-szn-border-subtle py-10 text-szn-text-2">
            Replay snapshot not found.
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid gap-px bg-szn-border-subtle md:grid-cols-4">
              <Metric label="Endpoint" value={snapshot.endpoint} />
              <Metric label="Duration" value={`${snapshot.duration_ms}ms`} />
              <Metric label="Reads" value={String(snapshot.memory_reads.length)} />
              <Metric label="Writes" value={String(snapshot.memory_writes.length)} />
            </div>

            <ReplayActions traceId={traceId} />
            <ExportPanel traceId={traceId} />

            <div className="grid gap-6 lg:grid-cols-2">
              <JsonPanel title="Request" value={snapshot.request_body} />
              <JsonPanel title="Response" value={snapshot.response_body} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <JsonPanel title="Memory reads" value={snapshot.memory_reads} />
              <JsonPanel title="Memory writes" value={snapshot.memory_writes} />
            </div>
          </div>
        )}
      </main>
    </DashboardShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-szn-bg p-4">
      <div className="szn-eyebrow mb-3">{label}</div>
      <div className="break-words font-mono text-[14px] text-szn-text-1">{value}</div>
    </div>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="border-y border-szn-border-subtle py-4">
      <h2 className="szn-eyebrow mb-4">{title}</h2>
      <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-szn-text-2">
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}
