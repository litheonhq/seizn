"use client";

import Link from "next/link";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, ExternalLink } from "lucide-react";
import {
  STORY_HEALTH_METRICS,
  type StoryHealthMetricKey,
  type StoryHealthSnapshot,
} from "@/lib/story-health/types";

interface ActStoryHealthClientProps {
  act: string;
  snapshots: StoryHealthSnapshot[];
  selectedMetric?: StoryHealthMetricKey | null;
  loadError?: string | null;
}

const metricAccessors: Record<StoryHealthMetricKey, (snapshot: StoryHealthSnapshot) => number> = {
  trust_drift: (snapshot) => snapshot.trustDrift,
  dialogue_entropy: (snapshot) => snapshot.dialogueEntropy,
  canon_violation_density: (snapshot) => snapshot.canonViolationDensity,
  contradiction_rate: (snapshot) => snapshot.contradictionRate,
  engagement_proxy: (snapshot) => snapshot.engagementProxy,
  narrative_consistency_score: (snapshot) => snapshot.narrativeConsistencyScore,
};

function formatMetric(key: StoryHealthMetricKey, value: number) {
  if (key === "engagement_proxy") return `${value.toFixed(1)}s`;
  if (key === "trust_drift") return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
  if (key === "narrative_consistency_score" || key === "dialogue_entropy") return Math.round(value).toString();
  return value.toFixed(value >= 10 ? 1 : 2);
}

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function metricTone(key: StoryHealthMetricKey, value: number) {
  if (key === "narrative_consistency_score") {
    if (value >= 85) return "text-emerald-200";
    if (value >= 70) return "text-amber-200";
    return "text-red-300";
  }
  if ((key === "canon_violation_density" || key === "contradiction_rate") && value > 0) {
    return value < 2 ? "text-amber-200" : "text-red-300";
  }
  return "text-szn-text-1";
}

function replayFilterHref(snapshot: StoryHealthSnapshot, metric?: StoryHealthMetricKey | null) {
  const metricIds = metric ? (snapshot.drilldowns[metric] || []).map((item) => item.traceId) : [];
  const ids = [...new Set([...metricIds, ...snapshot.replayTraceIds])].slice(0, 30);
  if (ids.length === 0) return "/dashboard/replay";
  const metricParam = metric ? `&metric=${metric}` : "";
  return `/dashboard/replay?traceIds=${ids.map(encodeURIComponent).join(",")}&source=story-health${metricParam}`;
}

export function ActStoryHealthClient({
  act,
  snapshots,
  selectedMetric = null,
  loadError = null,
}: ActStoryHealthClientProps) {
  const latest = snapshots[0] || null;
  const activeMetric = selectedMetric || "narrative_consistency_score";
  const chartRows = [...snapshots]
    .reverse()
    .map((snapshot) => ({
      date: snapshot.snapshotDate,
      consistency: Math.round(snapshot.narrativeConsistencyScore),
      trust: Number(snapshot.trustDrift.toFixed(2)),
      entropy: Math.round(snapshot.dialogueEntropy),
      canon: Number(snapshot.canonViolationDensity.toFixed(2)),
      contradictions: Number(snapshot.contradictionRate.toFixed(2)),
      engagement: Number(snapshot.engagementProxy.toFixed(1)),
    }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Link href="/dashboard/story-health" className="mb-6 inline-flex items-center gap-2 text-xs text-szn-signal hover:text-szn-text-1">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        STORY HEALTH
      </Link>

      <header className="mb-8 border-b border-szn-border-subtle pb-8">
        <div className="szn-section-number mb-5">ACT / DRILLDOWN</div>
        <h1 className="break-words font-mono text-[clamp(30px,5vw,56px)] leading-tight text-szn-text-1">
          {act}
        </h1>
        {latest && (
          <p className="mt-4 text-sm text-szn-text-2">
            {formatWhen(latest.windowStart)} to {formatWhen(latest.windowEnd)}
          </p>
        )}
      </header>

      {loadError && (
        <div className="mb-6 border border-szn-border-subtle bg-szn-surface-1 px-4 py-3 text-sm text-szn-text-2">
          {loadError}
        </div>
      )}

      {!latest ? (
        <section className="border-y border-szn-border-subtle py-10 text-sm text-szn-text-2">
          No Story Health snapshots for this act.
        </section>
      ) : (
        <div className="space-y-8">
          <section className="grid grid-cols-2 gap-px border border-szn-border-subtle bg-szn-border-subtle lg:grid-cols-6">
            {STORY_HEALTH_METRICS.map((metric) => {
              const value = metricAccessors[metric.key](latest);
              const active = metric.key === activeMetric;
              return (
                <Link
                  key={metric.key}
                  href={`/dashboard/story-health/${encodeURIComponent(act)}?metric=${metric.key}`}
                  className={`bg-szn-bg p-4 transition hover:bg-szn-surface-1 ${active ? "outline outline-1 outline-szn-signal-line" : ""}`}
                >
                  <div className="text-[11px] uppercase text-szn-text-3">{metric.label}</div>
                  <div className={`mt-2 text-2xl font-semibold ${metricTone(metric.key, value)}`}>
                    {formatMetric(metric.key, value)}
                  </div>
                </Link>
              );
            })}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1fr_380px]">
            <div className="border border-szn-border-subtle bg-szn-surface-1 p-5">
              <div className="mb-5 flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-szn-text-1">History</h2>
                <Link href={replayFilterHref(latest, activeMetric)} className="szn-btn-ghost inline-flex items-center gap-2 px-3 py-2 text-xs">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  Open replays
                </Link>
              </div>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartRows} margin={{ top: 12, right: 16, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(181,181,210,0.12)" vertical={false} />
                    <XAxis dataKey="date" stroke="var(--szn-text-3)" tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--szn-text-3)" tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--szn-card)",
                        border: "1px solid var(--szn-border)",
                        color: "var(--szn-text-1)",
                      }}
                    />
                    <Line type="monotone" dataKey="consistency" stroke="#a78bfa" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="entropy" stroke="#22c55e" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="canon" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="contradictions" stroke="#ef4444" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <aside className="border border-szn-border-subtle bg-szn-surface-1 p-5">
              <h2 className="text-lg font-semibold text-szn-text-1">Replay drilldowns</h2>
              <div className="mt-5 space-y-3">
                {(latest.drilldowns[activeMetric] || []).length === 0 ? (
                  <p className="text-sm text-szn-text-2">No offending sessions attached to this metric.</p>
                ) : (
                  (latest.drilldowns[activeMetric] || []).map((item) => (
                    <Link
                      key={`${item.source}-${item.traceId}`}
                      href={`/dashboard/replay/${encodeURIComponent(item.traceId)}`}
                      className="block border border-szn-border-subtle bg-szn-bg p-3 hover:border-szn-signal-line"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-szn-text-1">{item.label}</span>
                        <span className="text-[11px] uppercase text-szn-text-3">{item.source}</span>
                      </div>
                      <div className="mt-2 break-all font-mono text-xs text-szn-text-3">{item.traceId}</div>
                    </Link>
                  ))
                )}
              </div>
            </aside>
          </section>

          <section className="border border-szn-border-subtle bg-szn-surface-1">
            <div className="border-b border-szn-border-subtle px-5 py-4">
              <h2 className="text-lg font-semibold text-szn-text-1">Snapshots</h2>
            </div>
            <div className="divide-y divide-szn-border-subtle">
              {snapshots.map((snapshot) => (
                <article key={snapshot.id} className="grid gap-4 p-5 lg:grid-cols-[180px_1fr_180px]">
                  <div>
                    <div className="font-mono text-sm text-szn-text-1">{snapshot.snapshotDate}</div>
                    <div className="mt-1 text-xs text-szn-text-3">{snapshot.sessionCount} sessions</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <MiniMetric label="Consistency" value={Math.round(snapshot.narrativeConsistencyScore).toString()} />
                    <MiniMetric label="Canon" value={snapshot.canonViolationCount.toString()} />
                    <MiniMetric label="Confusion" value={snapshot.confusionReportCount.toString()} />
                    <MiniMetric label="Contradictions" value={snapshot.contradictionCount.toString()} />
                    <MiniMetric label="Memories" value={snapshot.memoryCount.toString()} />
                    <MiniMetric label="Replays" value={snapshot.replayTraceIds.length.toString()} />
                  </div>
                  <div className="lg:text-right">
                    <Link href={replayFilterHref(snapshot, activeMetric)} className="text-xs text-szn-signal hover:text-szn-text-1">
                      Replay filter
                    </Link>
                    {snapshot.judgeNotes && (
                      <p className="mt-3 text-xs leading-5 text-szn-text-3">{snapshot.judgeNotes}</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-szn-border-subtle bg-szn-bg px-3 py-2">
      <div className="text-[11px] uppercase text-szn-text-3">{label}</div>
      <div className="mt-1 font-mono text-sm text-szn-text-1">{value}</div>
    </div>
  );
}
