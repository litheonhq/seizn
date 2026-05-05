"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, AlertTriangle, GitBranch, Search } from "lucide-react";
import {
  STORY_HEALTH_METRICS,
  type StoryHealthMetricKey,
  type StoryHealthSnapshot,
} from "@/lib/story-health/types";

interface StoryHealthClientProps {
  snapshots: StoryHealthSnapshot[];
  loadError?: string | null;
  live: boolean;
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
  if (key === "narrative_consistency_score" || key === "dialogue_entropy") return `${Math.round(value)}`;
  if (key === "engagement_proxy") return `${value.toFixed(1)}s`;
  if (key === "trust_drift") return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
  return value.toFixed(value >= 10 ? 1 : 2);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

function metricTone(key: StoryHealthMetricKey, value: number) {
  if (key === "narrative_consistency_score") {
    if (value >= 85) return "text-emerald-200";
    if (value >= 70) return "text-amber-200";
    return "text-red-300";
  }
  if (key === "canon_violation_density" || key === "contradiction_rate") {
    if (value === 0) return "text-emerald-200";
    if (value < 2) return "text-amber-200";
    return "text-red-300";
  }
  return "text-szn-text-1";
}

function replayFilterHref(snapshot: StoryHealthSnapshot, key: StoryHealthMetricKey) {
  const drillIds = (snapshot.drilldowns[key] || []).map((item) => item.traceId).filter(Boolean);
  const ids = [...new Set([...drillIds, ...snapshot.replayTraceIds])].slice(0, 30);
  if (ids.length === 0) return `/dashboard/legacy/story-health/${encodeURIComponent(snapshot.act)}?metric=${key}`;
  return `/dashboard/replay?traceIds=${ids.map(encodeURIComponent).join(",")}&source=story-health&metric=${key}`;
}

function latestByAct(snapshots: StoryHealthSnapshot[]) {
  const map = new Map<string, StoryHealthSnapshot>();
  for (const snapshot of snapshots) {
    const current = map.get(snapshot.act);
    if (!current || snapshot.snapshotDate > current.snapshotDate) map.set(snapshot.act, snapshot);
  }
  return [...map.values()].sort((a, b) => a.act.localeCompare(b.act));
}

export function StoryHealthClient({ snapshots, loadError = null, live }: StoryHealthClientProps) {
  const latest = useMemo(() => latestByAct(snapshots), [snapshots]);
  const [selectedAct, setSelectedAct] = useState(latest[0]?.act || "all");

  const selected = latest.find((snapshot) => snapshot.act === selectedAct) || latest[0] || null;
  const chartRows = latest.map((snapshot) => ({
    act: snapshot.act,
    consistency: Math.round(snapshot.narrativeConsistencyScore),
    canon: Number(snapshot.canonViolationDensity.toFixed(2)),
    contradictions: Number(snapshot.contradictionRate.toFixed(2)),
    entropy: Math.round(snapshot.dialogueEntropy),
  }));

  const trendRows = useMemo(() => {
    const byDate = new Map<string, { date: string; total: number; count: number; canon: number }>();
    for (const snapshot of snapshots) {
      const row = byDate.get(snapshot.snapshotDate) || {
        date: snapshot.snapshotDate,
        total: 0,
        count: 0,
        canon: 0,
      };
      row.total += snapshot.narrativeConsistencyScore;
      row.canon += snapshot.canonViolationDensity;
      row.count += 1;
      byDate.set(snapshot.snapshotDate, row);
    }
    return [...byDate.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14)
      .map((row) => ({
        date: formatDate(row.date),
        consistency: Math.round(row.total / Math.max(row.count, 1)),
        canon: Number((row.canon / Math.max(row.count, 1)).toFixed(2)),
      }));
  }, [snapshots]);

  const totals = useMemo(() => {
    const sessions = latest.reduce((sum, snapshot) => sum + snapshot.sessionCount, 0);
    const memories = latest.reduce((sum, snapshot) => sum + snapshot.memoryCount, 0);
    const canon = latest.reduce((sum, snapshot) => sum + snapshot.canonViolationCount, 0);
    const consistency =
      latest.length > 0
        ? latest.reduce((sum, snapshot) => sum + snapshot.narrativeConsistencyScore, 0) / latest.length
        : 0;
    return { sessions, memories, canon, consistency };
  }, [latest]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 grid gap-6 xl:grid-cols-[1fr_520px] xl:items-end">
        <div>
          <div className="szn-section-number mb-5">08 / STORY HEALTH</div>
          <h1 className="szn-serif text-5xl leading-none text-szn-text-1 sm:text-6xl">
            Story Health
          </h1>
          <p className="mt-4 max-w-3xl text-[15px] leading-[1.7] text-szn-text-2">
            Per-act narrative signals from replay, canon, chaos, and bug-report traces.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-px border border-szn-border-subtle bg-szn-border-subtle sm:grid-cols-4">
          <Metric label="Acts" value={latest.length.toLocaleString()} />
          <Metric label="Sessions" value={totals.sessions.toLocaleString()} />
          <Metric label="Memories" value={totals.memories.toLocaleString()} />
          <Metric label="Score" value={Math.round(totals.consistency).toString()} />
        </div>
      </div>

      {(loadError || !live) && (
        <div className="mb-6 flex items-center gap-2 border border-szn-border-subtle bg-szn-surface-1 px-4 py-3 text-sm text-szn-text-2">
          <AlertTriangle className="h-4 w-4 text-szn-signal" aria-hidden="true" />
          {loadError || "Login required to view Story Health."}
        </div>
      )}

      {latest.length === 0 ? (
        <section className="border-y border-szn-border-subtle py-12">
          <div className="flex max-w-2xl items-start gap-4">
            <Activity className="mt-1 h-5 w-5 text-szn-signal" aria-hidden="true" />
            <div>
              <h2 className="text-xl font-semibold text-szn-text-1">No snapshots yet</h2>
              <p className="mt-2 text-sm leading-6 text-szn-text-2">
                The daily evaluator writes snapshots after replay activity is available.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <div className="space-y-8">
          <section className="grid gap-6 xl:grid-cols-[1fr_380px]">
            <div className="border border-szn-border-subtle bg-szn-surface-1 p-5">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-szn-text-1">Act scoreline</h2>
                  <p className="mt-1 text-sm text-szn-text-2">Consistency, canon density, contradiction rate.</p>
                </div>
                <Link href="/dashboard/replay?source=story-health" className="szn-btn-ghost px-3 py-2 text-xs">
                  Replay
                </Link>
              </div>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartRows} margin={{ top: 12, right: 16, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(181,181,210,0.12)" vertical={false} />
                    <XAxis dataKey="act" stroke="var(--szn-text-3)" tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--szn-text-3)" tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(167,139,250,0.08)" }}
                      contentStyle={{
                        background: "var(--szn-card)",
                        border: "1px solid var(--szn-border)",
                        color: "var(--szn-text-1)",
                      }}
                    />
                    <Bar dataKey="consistency" fill="#a78bfa" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="entropy" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="canon" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="contradictions" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <aside className="border border-szn-border-subtle bg-szn-surface-1 p-5">
              <h2 className="text-lg font-semibold text-szn-text-1">Latest window</h2>
              {selected && (
                <div className="mt-5 space-y-4">
                  <select
                    value={selected.act}
                    onChange={(event) => setSelectedAct(event.target.value)}
                    className="w-full border border-szn-border-subtle bg-szn-bg px-3 py-2 text-sm text-szn-text-1 outline-none focus:border-szn-signal"
                    aria-label="Select act"
                  >
                    {latest.map((snapshot) => (
                      <option key={snapshot.act} value={snapshot.act}>
                        {snapshot.act}
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-px border border-szn-border-subtle bg-szn-border-subtle">
                    {STORY_HEALTH_METRICS.map((metric) => (
                      <div key={metric.key} className="bg-szn-bg p-4">
                        <div className="text-[11px] uppercase text-szn-text-3">{metric.label}</div>
                        <div className={`mt-2 text-2xl font-semibold ${metricTone(metric.key, metricAccessors[metric.key](selected))}`}>
                          {formatMetric(metric.key, metricAccessors[metric.key](selected))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <Link
                    href={`/dashboard/legacy/story-health/${encodeURIComponent(selected.act)}`}
                    className="szn-btn-signal inline-flex w-full items-center justify-center gap-2 px-4 py-2 text-sm"
                  >
                    <Search className="h-4 w-4" aria-hidden="true" />
                    Drill down
                  </Link>
                </div>
              )}
            </aside>
          </section>

          <section className="border border-szn-border-subtle bg-szn-surface-1 p-5">
            <div className="mb-5 flex items-center gap-3">
              <GitBranch className="h-4 w-4 text-szn-signal" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-szn-text-1">Metric matrix</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-szn-border-subtle text-left text-xs uppercase text-szn-text-3">
                    <th className="min-w-[210px] px-3 py-3 font-medium">Metric</th>
                    {latest.map((snapshot) => (
                      <th key={snapshot.act} className="min-w-[160px] px-3 py-3 font-medium">
                        <Link href={`/dashboard/legacy/story-health/${encodeURIComponent(snapshot.act)}`} className="hover:text-szn-text-1">
                          {snapshot.act}
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {STORY_HEALTH_METRICS.map((metric) => (
                    <tr key={metric.key} className="border-b border-szn-border-subtle last:border-b-0">
                      <td className="px-3 py-4 text-szn-text-2">{metric.label}</td>
                      {latest.map((snapshot) => {
                        const value = metricAccessors[metric.key](snapshot);
                        return (
                          <td key={`${snapshot.act}-${metric.key}`} className="px-3 py-4">
                            <div className={`text-lg font-semibold ${metricTone(metric.key, value)}`}>
                              {formatMetric(metric.key, value)}
                            </div>
                            <Link
                              href={replayFilterHref(snapshot, metric.key)}
                              className="mt-1 inline-flex text-xs text-szn-signal hover:text-szn-text-1"
                            >
                              Open replays
                            </Link>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="border border-szn-border-subtle bg-szn-surface-1 p-5">
            <h2 className="mb-5 text-lg font-semibold text-szn-text-1">Daily trend</h2>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendRows} margin={{ top: 12, right: 16, left: -18, bottom: 0 }}>
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
                  <Line type="monotone" dataKey="canon" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-szn-surface-1 px-4 py-3">
      <div className="text-2xl font-semibold text-szn-text-1">{value}</div>
      <div className="mt-1 text-xs uppercase text-szn-text-3">{label}</div>
    </div>
  );
}
