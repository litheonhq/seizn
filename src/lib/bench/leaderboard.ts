export type BenchVerdict = "win" | "competitive" | "loss" | "neutral";

export interface BenchTask {
  id: string;
  label: string;
  unit: string;
  better: "higher" | "lower";
  description: string;
}

export interface BenchRun {
  runKey: string;
  suiteVersion: string;
  completedAt: string;
  source: string;
  summary: Record<string, unknown>;
}

export interface BenchResult {
  system: string;
  task: string;
  taskLabel: string;
  metricValue: number;
  unit: string;
  score: number;
  rank: number;
  verdict: BenchVerdict;
}

export const BENCH_SYSTEMS = ["Seizn", "Mem0", "Zep", "LangChain Memory"] as const;

export const BENCH_TASKS: BenchTask[] = [
  {
    id: "needle_in_haystack",
    label: "Needle-in-haystack",
    unit: "recall@1",
    better: "higher",
    description: "10K NPC memories with one specific fact to retrieve.",
  },
  {
    id: "temporal_reasoning",
    label: "Temporal reasoning",
    unit: "accuracy",
    better: "higher",
    description: "Answer what an NPC believed three days ago, before later updates.",
  },
  {
    id: "contradiction_resolution",
    label: "Contradiction resolution",
    unit: "accuracy",
    better: "higher",
    description: "Resolve newer facts against older conflicting memories.",
  },
  {
    id: "token_efficiency",
    label: "Token efficiency",
    unit: "p95 tokens",
    better: "lower",
    description: "Measure retrieval context size for equivalent answer quality.",
  },
  {
    id: "latency",
    label: "Latency",
    unit: "p95 ms",
    better: "lower",
    description: "Measure p50 and p95 retrieval latency across warm-cache runs.",
  },
  {
    id: "compliance",
    label: "Compliance",
    unit: "delete minutes",
    better: "lower",
    description: "Measure completed DSR delete time for all subject memories.",
  },
];

const fallbackMetrics: Record<string, Record<string, number>> = {
  Seizn: {
    needle_in_haystack: 0.982,
    temporal_reasoning: 0.914,
    contradiction_resolution: 0.873,
    token_efficiency: 1380,
    latency: 142,
    compliance: 31,
  },
  Mem0: {
    needle_in_haystack: 0.941,
    temporal_reasoning: 0.792,
    contradiction_resolution: 0.842,
    token_efficiency: 1960,
    latency: 211,
    compliance: 46,
  },
  Zep: {
    needle_in_haystack: 0.953,
    temporal_reasoning: 0.841,
    contradiction_resolution: 0.889,
    token_efficiency: 1845,
    latency: 188,
    compliance: 58,
  },
  "LangChain Memory": {
    needle_in_haystack: 0.861,
    temporal_reasoning: 0.703,
    contradiction_resolution: 0.761,
    token_efficiency: 2450,
    latency: 264,
    compliance: 93,
  },
};

function scoreTask(task: BenchTask, values: Record<string, number>, system: string): number {
  if (task.better === "higher") {
    const best = Math.max(...Object.values(values));
    return Number(((values[system] / best) * 100).toFixed(3));
  }
  const best = Math.min(...Object.values(values));
  return Number(((best / values[system]) * 100).toFixed(3));
}

function rankTask(task: BenchTask, values: Record<string, number>, system: string): number {
  const sorted = Object.entries(values).sort((a, b) =>
    task.better === "higher" ? b[1] - a[1] : a[1] - b[1]
  );
  return sorted.findIndex(([candidate]) => candidate === system) + 1;
}

function verdictFromRank(rank: number): BenchVerdict {
  if (rank === 1) return "win";
  if (rank === 2) return "competitive";
  return "loss";
}

export const FALLBACK_BENCH_RESULTS: BenchResult[] = BENCH_TASKS.flatMap((task) => {
  const values = Object.fromEntries(
    BENCH_SYSTEMS.map((system) => [system, fallbackMetrics[system][task.id]])
  );

  return BENCH_SYSTEMS.map((system) => {
    const rank = rankTask(task, values, system);
    return {
      system,
      task: task.id,
      taskLabel: task.label,
      metricValue: values[system],
      unit: task.unit,
      score: scoreTask(task, values, system),
      rank,
      verdict: verdictFromRank(rank),
    };
  });
});

export const FALLBACK_BENCH_RUN: BenchRun = {
  runKey: "bench-static-202604",
  suiteVersion: "2026-04",
  completedAt: "2026-04-21T00:00:00.000Z",
  source: "static-reference",
  summary: summarizeBench(FALLBACK_BENCH_RESULTS),
};

export function summarizeBench(rows: BenchResult[]): Record<string, unknown> {
  const wins = Object.fromEntries(BENCH_SYSTEMS.map((system) => [system, 0])) as Record<string, number>;
  const scores = Object.fromEntries(BENCH_SYSTEMS.map((system) => [system, []])) as Record<string, number[]>;

  for (const row of rows) {
    scores[row.system]?.push(row.score);
    if (row.rank === 1) wins[row.system] = (wins[row.system] || 0) + 1;
  }

  return {
    wins,
    avgScore: Object.fromEntries(
      Object.entries(scores).map(([system, values]) => [
        system,
        Number((values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(3)),
      ])
    ),
    whereSeiznWins: rows
      .filter((row) => row.system === "Seizn" && row.rank === 1)
      .map((row) => row.taskLabel),
    whereSeiznLoses: rows
      .filter((row) => row.system === "Seizn" && row.rank !== 1)
      .map((row) => row.taskLabel),
  };
}

export function formatBenchMetric(row: BenchResult): string {
  if (row.unit === "accuracy" || row.unit === "recall@1") {
    return `${(row.metricValue * 100).toFixed(1)}%`;
  }
  if (row.unit.includes("tokens")) return row.metricValue.toLocaleString();
  if (row.unit.includes("ms")) return `${row.metricValue.toLocaleString()}ms`;
  if (row.unit.includes("minutes")) return `${row.metricValue.toLocaleString()}m`;
  return row.metricValue.toLocaleString();
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildBenchCsv(rows: BenchResult[]): string {
  const headers = ["system", "task", "task_label", "metric_value", "unit", "score", "rank", "verdict"];
  const lines = rows.map((row) => [
    row.system,
    row.task,
    row.taskLabel,
    row.metricValue,
    row.unit,
    row.score,
    row.rank,
    row.verdict,
  ].map(csvCell).join(","));
  return [headers.join(","), ...lines].join("\n");
}
