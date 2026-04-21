import type { Metadata } from "next";
import Link from "next/link";
import { Download, ExternalLink, Table2, Trophy } from "lucide-react";
import { locales, type Locale } from "@/i18n/config";
import { createServerClient, hasServerSupabaseServiceRoleConfig } from "@/lib/supabase";
import {
  BENCH_SYSTEMS,
  BENCH_TASKS,
  FALLBACK_BENCH_RESULTS,
  FALLBACK_BENCH_RUN,
  buildBenchCsv,
  formatBenchMetric,
  summarizeBench,
  type BenchResult,
  type BenchRun,
  type BenchVerdict,
} from "@/lib/bench/leaderboard";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
};

type BenchRunRow = {
  id: string;
  run_key: string;
  suite_version: string;
  completed_at: string | null;
  source: string;
  summary: Record<string, unknown> | null;
  raw_csv: string | null;
};

type BenchResultRow = {
  system: string;
  task: string;
  metric_value: number | string;
  unit: string;
  score: number | string;
  rank: number;
  verdict: string;
};

function getLocale(localeParam: string): Locale {
  return (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
}

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = getLocale(localeParam);

  return {
    title: "Memory benchmark leaderboard",
    description: "Weekly Seizn benchmark results across memory retrieval, temporal reasoning, latency, tokens, and compliance.",
    alternates: {
      canonical: `/${locale}/bench`,
    },
    openGraph: {
      title: "Memory benchmark leaderboard",
      description: "Seizn, Mem0, Zep, and LangChain Memory compared on six standard NPC memory tasks.",
      type: "website",
    },
  };
}

async function loadBenchData(): Promise<{ run: BenchRun; rows: BenchResult[]; source: "database" | "static" }> {
  if (!hasServerSupabaseServiceRoleConfig()) {
    return { run: FALLBACK_BENCH_RUN, rows: FALLBACK_BENCH_RESULTS, source: "static" };
  }

  try {
    const supabase = createServerClient();
    const { data: runRow, error: runError } = await supabase
      .from("bench_runs")
      .select("id, run_key, suite_version, completed_at, source, summary, raw_csv")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (runError || !runRow) {
      return { run: FALLBACK_BENCH_RUN, rows: FALLBACK_BENCH_RESULTS, source: "static" };
    }

    const run = runRow as BenchRunRow;
    const { data: resultRows, error: resultError } = await supabase
      .from("bench_results")
      .select("system, task, metric_value, unit, score, rank, verdict")
      .eq("run_id", run.id)
      .order("task", { ascending: true })
      .order("rank", { ascending: true });

    if (resultError || !resultRows || resultRows.length === 0) {
      return { run: FALLBACK_BENCH_RUN, rows: FALLBACK_BENCH_RESULTS, source: "static" };
    }

    const rows = (resultRows as BenchResultRow[]).map((row) => {
      const task = BENCH_TASKS.find((candidate) => candidate.id === row.task);
      return {
        system: row.system,
        task: row.task,
        taskLabel: task?.label || row.task,
        metricValue: Number(row.metric_value),
        unit: row.unit,
        score: Number(row.score),
        rank: row.rank,
        verdict: (["win", "competitive", "loss", "neutral"].includes(row.verdict)
          ? row.verdict
          : "neutral") as BenchVerdict,
      };
    });

    return {
      run: {
        runKey: run.run_key,
        suiteVersion: run.suite_version,
        completedAt: run.completed_at || "",
        source: run.source,
        summary: run.summary || summarizeBench(rows),
      },
      rows,
      source: "database",
    };
  } catch {
    return { run: FALLBACK_BENCH_RUN, rows: FALLBACK_BENCH_RESULTS, source: "static" };
  }
}

function getRowsForTask(rows: BenchResult[], taskId: string): BenchResult[] {
  return rows
    .filter((row) => row.task === taskId)
    .sort((a, b) => a.rank - b.rank);
}

function getResult(rows: BenchResult[], system: string, taskId: string): BenchResult | null {
  return rows.find((row) => row.system === system && row.task === taskId) || null;
}

function getSummaryList(summary: Record<string, unknown>, key: string, fallbackKey?: string): string[] {
  const value = summary[key] ?? (fallbackKey ? summary[fallbackKey] : undefined);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getWins(summary: Record<string, unknown>): Record<string, number> {
  const value = summary.wins;
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([system, wins]) => [system, Number(wins) || 0])
  );
}

function csvHref(csv: string): string {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
}

function ScoreBar({ row }: { row: BenchResult }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-szn-text-1">{row.system}</span>
        <span className="font-mono text-szn-text-2">{row.score.toFixed(1)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-szn-surface-2">
        <div
          className={`h-2 rounded-full ${row.rank === 1 ? "bg-szn-signal" : "bg-szn-text-3"}`}
          style={{ width: `${Math.max(8, Math.min(100, row.score))}%` }}
        />
      </div>
    </div>
  );
}

export default async function BenchPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = getLocale(localeParam);
  const { run, rows, source } = await loadBenchData();
  const summary = Object.keys(run.summary).length > 0 ? run.summary : summarizeBench(rows);
  const wins = getWins(summary);
  const whereSeiznWins = getSummaryList(summary, "whereSeiznWins", "where_seizn_wins");
  const whereSeiznLoses = getSummaryList(summary, "whereSeiznLoses", "where_seizn_loses");
  const csv = buildBenchCsv(rows);
  const completedAt = run.completedAt
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(run.completedAt))
    : "Not published yet";

  return (
    <main className="dark min-h-screen bg-szn-bg text-szn-text-1">
      <section className="border-b border-szn-border-subtle bg-szn-surface-1 px-6 py-16 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <Link href={`/${locale}`} className="text-sm font-medium text-szn-text-2 hover:text-szn-text-1">
            Seizn
          </Link>
          <div className="mt-10 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div>
              <p className="szn-section-number">14 / BENCHMARK LEADERBOARD</p>
              <h1 className="szn-serif mt-4 max-w-4xl text-5xl font-semibold tracking-normal sm:text-6xl">
                Memory infrastructure, measured on NPC workloads.
              </h1>
              <p className="mt-6 max-w-3xl text-base leading-7 text-szn-text-2">
                Weekly results compare Seizn, Mem0, Zep, and LangChain Memory across retrieval accuracy,
                temporal reasoning, contradiction handling, token use, latency, and DSR delete speed.
              </p>
            </div>
            <div className="rounded-lg border border-szn-border-subtle bg-szn-card p-5">
              <div className="flex items-center gap-3">
                <Trophy className="h-5 w-5 text-szn-signal" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">Latest run</p>
                  <p className="mt-1 text-sm text-szn-text-2">{completedAt} UTC</p>
                </div>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-szn-text-3">Suite</dt>
                  <dd className="mt-1 font-mono text-szn-text-1">{run.suiteVersion}</dd>
                </div>
                <div>
                  <dt className="text-szn-text-3">Source</dt>
                  <dd className="mt-1 font-mono text-szn-text-1">{source === "database" ? run.source : "static fallback"}</dd>
                </div>
              </dl>
              <div className="mt-5 flex flex-wrap gap-2">
                <a
                  href={csvHref(csv)}
                  download={`${run.runKey}.csv`}
                  className="szn-btn-signal inline-flex items-center gap-2 px-3 py-2 text-sm"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download CSV
                </a>
                <Link
                  href={`/${locale}/bench/methodology`}
                  className="szn-btn-ghost inline-flex items-center gap-2 px-3 py-2 text-sm"
                >
                  Methodology
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-6 py-8 sm:px-8 lg:grid-cols-4 lg:px-10">
        {BENCH_SYSTEMS.map((system) => (
          <article key={system} className="rounded-lg border border-szn-border-subtle bg-szn-surface-1 p-5">
            <p className="text-sm font-medium text-szn-text-2">{system}</p>
            <p className="mt-3 text-4xl font-semibold tracking-normal">{wins[system] || 0}</p>
            <p className="mt-1 text-sm text-szn-text-3">category wins</p>
          </article>
        ))}
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-6 pb-8 sm:px-8 lg:grid-cols-2 lg:px-10">
        <article className="rounded-lg border border-szn-signal-line bg-szn-signal-soft p-5">
          <h2 className="text-lg font-semibold tracking-normal">Where Seizn wins</h2>
          <ul className="mt-4 space-y-2 text-sm text-szn-text-1">
            {whereSeiznWins.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </article>
        <article className="rounded-lg border border-szn-border-subtle bg-szn-surface-1 p-5">
          <h2 className="text-lg font-semibold tracking-normal">Where Seizn is still chasing</h2>
          <ul className="mt-4 space-y-2 text-sm text-szn-text-2">
            {whereSeiznLoses.length > 0 ? whereSeiznLoses.map((item) => (
              <li key={item}>- {item}</li>
            )) : <li>- No current loss category in this run.</li>}
          </ul>
        </article>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-10 sm:px-8 lg:px-10">
        <div className="rounded-lg border border-szn-border-subtle bg-szn-card">
          <div className="flex items-center gap-3 border-b border-szn-border-subtle px-5 py-4">
            <Table2 className="h-5 w-5 text-szn-signal" aria-hidden="true" />
            <h2 className="text-lg font-semibold tracking-normal">All systems x all tasks</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-szn-border-subtle bg-szn-surface-1 text-xs uppercase tracking-[0.12em] text-szn-text-3">
                  <th className="px-4 py-3">System</th>
                  {BENCH_TASKS.map((task) => (
                    <th key={task.id} className="px-4 py-3">{task.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {BENCH_SYSTEMS.map((system) => (
                  <tr key={system} className="border-b border-szn-border-subtle last:border-0">
                    <th className="px-4 py-4 font-semibold">{system}</th>
                    {BENCH_TASKS.map((task) => {
                      const row = getResult(rows, system, task.id);
                      return (
                        <td key={task.id} className="px-4 py-4 align-top">
                          {row ? (
                            <div>
                              <p className="font-mono text-sm">{formatBenchMetric(row)}</p>
                              <p className={`mt-1 text-xs ${row.rank === 1 ? "text-szn-signal" : "text-szn-text-3"}`}>
                                rank {row.rank} / score {row.score.toFixed(1)}
                              </p>
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-6 pb-16 sm:px-8 lg:grid-cols-2 lg:px-10">
        {BENCH_TASKS.map((task) => (
          <article key={task.id} className="rounded-lg border border-szn-border-subtle bg-szn-card p-5">
            <div className="mb-5">
              <p className="text-sm font-semibold">{task.label}</p>
              <p className="mt-1 text-sm leading-6 text-szn-text-2">{task.description}</p>
            </div>
            <div className="space-y-4">
              {getRowsForTask(rows, task.id).map((row) => (
                <ScoreBar key={`${task.id}-${row.system}`} row={row} />
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
