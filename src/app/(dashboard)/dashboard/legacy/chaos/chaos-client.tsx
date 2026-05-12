"use client";

import { FormEvent, useMemo, useState } from "react";
import { AlertTriangle, Play, RefreshCw } from "lucide-react";
import type { ChaosFinding, ChaosRun } from "@/lib/chaos/types";

interface ChaosClientProps {
  initialRuns: ChaosRun[];
  loadError?: string | null;
  live: boolean;
}

function formatWhen(value: string | null) {
  if (!value) return "not started";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function shortId(value: string) {
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-5)}` : value;
}

function statusClass(status: ChaosRun["status"]) {
  if (status === "completed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (status === "running") return "border-violet-500/30 bg-violet-500/10 text-violet-200";
  if (status === "failed") return "border-red-500/30 bg-red-500/10 text-red-300";
  return "border-szn-border-subtle bg-szn-surface-1 text-szn-text-2";
}

function severityClass(severity: ChaosFinding["severity"]) {
  if (severity === "critical") return "border-red-500/40 bg-red-500/10 text-red-200";
  if (severity === "high") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  if (severity === "medium") return "border-violet-500/30 bg-violet-500/10 text-violet-200";
  return "border-szn-border-subtle bg-szn-bg text-szn-text-2";
}

function categoryLabel(value: string) {
  return value.replaceAll("_", " ");
}

function summaryCount(run: ChaosRun, key: string) {
  const byCategory = run.failureSummary.byCategory;
  return byCategory && typeof byCategory === "object"
    ? Number((byCategory as Record<string, unknown>)[key] || 0)
    : 0;
}

function progress(run: ChaosRun) {
  if (run.progressTotal <= 0) return 0;
  return Math.min(100, Math.round((run.progressCompleted / run.progressTotal) * 100));
}

export function ChaosClient({ initialRuns, loadError = null, live }: ChaosClientProps) {
  const [runs, setRuns] = useState(initialRuns);
  const [selectedRun, setSelectedRun] = useState<ChaosRun | null>(initialRuns[0] || null);
  const [findings, setFindings] = useState<ChaosFinding[]>([]);
  const [npcId, setNpcId] = useState("");
  const [promptCount, setPromptCount] = useState("1000");
  const [suite, setSuite] = useState("basic");
  const [targetEndpoint, setTargetEndpoint] = useState("");
  const [message, setMessage] = useState<string | null>(loadError);
  const [isCreating, setIsCreating] = useState(false);
  const [busyRunId, setBusyRunId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const totalFindings = runs.reduce((sum, run) => sum + run.findingsCount, 0);
    return {
      runs: runs.length,
      queued: runs.filter((run) => run.status === "queued").length,
      running: runs.filter((run) => run.status === "running").length,
      findings: totalFindings,
    };
  }, [runs]);

  async function refreshRuns() {
    const response = await fetch("/api/chaos/runs");
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error?.message || "Failed to refresh chaos runs");
    const nextRuns = payload.data.runs as ChaosRun[];
    setRuns(nextRuns);
    if (selectedRun) {
      const updated = nextRuns.find((run) => run.id === selectedRun.id);
      if (updated) setSelectedRun(updated);
    }
  }

  async function loadRun(run: ChaosRun) {
    setSelectedRun(run);
    setMessage(null);
    const response = await fetch(`/api/chaos/runs/${encodeURIComponent(run.id)}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error?.message || "Failed to load chaos run");
    }
    setSelectedRun(payload.data.run as ChaosRun);
    setFindings(payload.data.findings as ChaosFinding[]);
  }

  async function createRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!live) {
      setMessage("Login required to launch chaos runs.");
      return;
    }
    if (!npcId.trim()) {
      setMessage("NPC id is required.");
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch("/api/chaos/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          npcId: npcId.trim(),
          promptCount: Number(promptCount),
          suite,
          targetEndpoint: targetEndpoint.trim() || null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message || "Failed to create chaos run");
      const run = payload.data.run as ChaosRun;
      setRuns((current) => [run, ...current]);
      setSelectedRun(run);
      setFindings([]);
      setMessage("Chaos run queued.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create chaos run");
    } finally {
      setIsCreating(false);
    }
  }

  async function runNow(run: ChaosRun) {
    setBusyRunId(run.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/chaos/runs/${encodeURIComponent(run.id)}`, { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message || "Failed to execute chaos run");
      setSelectedRun(payload.data.run as ChaosRun);
      setFindings(payload.data.findings as ChaosFinding[]);
      await refreshRuns();
      setMessage("Chaos run completed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to execute chaos run");
      await refreshRuns().catch(() => undefined);
    } finally {
      setBusyRunId(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 grid gap-6 xl:grid-cols-[1fr_520px] xl:items-end">
        <div>
          <div className="szn-section-number mb-5">07 / CHAOS</div>
          <h1 className="szn-serif text-5xl leading-none text-szn-text-1 sm:text-6xl">
            NPC Chaos Monkey
          </h1>
          <p className="mt-4 max-w-3xl text-[15px] leading-[1.7] text-szn-text-2">
            Adversarial QA runs for canon, safety, contradiction, and dead-end failures.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-px border border-szn-border-subtle bg-szn-border-subtle">
          <Metric label="Runs" value={stats.runs} />
          <Metric label="Queued" value={stats.queued} />
          <Metric label="Running" value={stats.running} />
          <Metric label="Findings" value={stats.findings} />
        </div>
      </div>

      {message && (
        <div className="mb-6 flex items-center gap-2 border border-szn-border-subtle bg-szn-surface-1 px-4 py-3 text-sm text-szn-text-2">
          <AlertTriangle className="h-4 w-4 text-szn-signal" aria-hidden="true" />
          {message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[390px_1fr]">
        <aside className="space-y-6">
          <form onSubmit={createRun} className="border border-szn-border-subtle bg-szn-surface-1 p-5">
            <h2 className="text-lg font-semibold text-szn-text-1">Launch run</h2>

            <label className="mt-5 block text-sm text-szn-text-2">
              NPC id
              <input aria-label="NPC ID"
                value={npcId}
                onChange={(event) => setNpcId(event.target.value)}
                placeholder="kaelan"
                className="mt-2 w-full border border-szn-border-subtle bg-szn-bg px-3 py-2 text-sm text-szn-text-1 outline-none focus:border-szn-signal"
              />
            </label>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block text-sm text-szn-text-2">
                Prompts
                <input aria-label="Prompt Count"
                  type="number"
                  min={1}
                  max={5000}
                  value={promptCount}
                  onChange={(event) => setPromptCount(event.target.value)}
                  className="mt-2 w-full border border-szn-border-subtle bg-szn-bg px-3 py-2 text-sm text-szn-text-1 outline-none focus:border-szn-signal"
                />
              </label>

              <label className="block text-sm text-szn-text-2">
                Suite
                <select
                  value={suite}
                  onChange={(event) => setSuite(event.target.value)}
                  className="mt-2 w-full border border-szn-border-subtle bg-szn-bg px-3 py-2 text-sm text-szn-text-1 outline-none focus:border-szn-signal"
                >
                  <option value="basic">basic</option>
                  <option value="canon">canon</option>
                  <option value="jailbreak">jailbreak</option>
                  <option value="story">story</option>
                </select>
              </label>
            </div>

            <label className="mt-4 block text-sm text-szn-text-2">
              Target endpoint
              <input aria-label="Target Endpoint"
                value={targetEndpoint}
                onChange={(event) => setTargetEndpoint(event.target.value)}
                placeholder="optional https://..."
                className="mt-2 w-full border border-szn-border-subtle bg-szn-bg px-3 py-2 text-sm text-szn-text-1 outline-none focus:border-szn-signal"
              />
            </label>

            <button
              type="submit"
              disabled={isCreating}
              className="szn-btn-signal mt-5 inline-flex w-full items-center justify-center gap-2 px-4 py-2 text-sm disabled:opacity-60"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {isCreating ? "Queueing" : "Queue run"}
            </button>
          </form>

          <section className="border border-szn-border-subtle bg-szn-surface-1">
            <div className="flex items-center justify-between border-b border-szn-border-subtle px-5 py-4">
              <h2 className="text-lg font-semibold text-szn-text-1">Recent runs</h2>
              <button
                type="button"
                onClick={() => refreshRuns().catch((error) => setMessage(error.message))}
                className="inline-flex items-center gap-2 text-xs text-szn-text-3 hover:text-szn-text-1"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Refresh
              </button>
            </div>
            <div className="divide-y divide-szn-border-subtle">
              {runs.length === 0 ? (
                <p className="p-5 text-sm text-szn-text-2">No chaos runs yet.</p>
              ) : (
                runs.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => loadRun(run).catch((error) => setMessage(error.message))}
                    className="block w-full px-5 py-4 text-left hover:bg-white/[0.03]"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="font-mono text-xs text-szn-text-3">{shortId(run.id)}</span>
                      <span className={`border px-2 py-1 text-xs ${statusClass(run.status)}`}>{run.status}</span>
                    </div>
                    <div className="text-sm font-medium text-szn-text-1">{run.npcId}</div>
                    <div className="mt-2 h-1.5 bg-szn-bg">
                      <div className="h-full bg-szn-signal" style={{ width: `${progress(run)}%` }} />
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-szn-text-3">
                      <span>{run.findingsCount} findings</span>
                      <span>{formatWhen(run.createdAt)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        </aside>

        <section className="border border-szn-border-subtle bg-szn-surface-1">
          {!selectedRun ? (
            <div className="p-6 text-sm text-szn-text-2">Select a run to inspect findings.</div>
          ) : (
            <>
              <div className="border-b border-szn-border-subtle p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className={`border px-2 py-1 text-xs ${statusClass(selectedRun.status)}`}>
                        {selectedRun.status}
                      </span>
                      <span className="border border-szn-border-subtle bg-szn-bg px-2 py-1 text-xs text-szn-text-2">
                        {selectedRun.suite}
                      </span>
                      <span className="font-mono text-xs text-szn-text-3">{selectedRun.id}</span>
                    </div>
                    <h2 className="text-2xl font-semibold text-szn-text-1">{selectedRun.npcId}</h2>
                    <p className="mt-2 text-sm text-szn-text-2">
                      {selectedRun.progressCompleted}/{selectedRun.progressTotal || selectedRun.promptCount} prompts,
                      {" "}
                      {selectedRun.findingsCount} findings, started {formatWhen(selectedRun.startedAt)}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => loadRun(selectedRun).catch((error) => setMessage(error.message))}
                      className="szn-btn-ghost inline-flex items-center gap-2 px-3 py-2 text-xs"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      Reload
                    </button>
                    {selectedRun.status !== "completed" && selectedRun.status !== "running" && (
                      <button
                        type="button"
                        disabled={busyRunId === selectedRun.id}
                        onClick={() => runNow(selectedRun)}
                        className="szn-btn-signal inline-flex items-center gap-2 px-3 py-2 text-xs disabled:opacity-60"
                      >
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                        {busyRunId === selectedRun.id ? "Running" : "Run now"}
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-5 grid gap-px border border-szn-border-subtle bg-szn-border-subtle sm:grid-cols-4">
                  <Metric label="Canon" value={summaryCount(selectedRun, "canon_violation")} />
                  <Metric label="Safety" value={summaryCount(selectedRun, "toxic_output")} />
                  <Metric label="Loops" value={summaryCount(selectedRun, "contradiction_loop")} />
                  <Metric label="Dead ends" value={summaryCount(selectedRun, "dead_end")} />
                </div>
              </div>

              <div className="divide-y divide-szn-border-subtle">
                {findings.length === 0 ? (
                  <div className="p-6 text-sm text-szn-text-2">
                    No findings loaded for this run.
                  </div>
                ) : (
                  findings.map((finding) => (
                    <article key={finding.id} className="grid gap-4 p-5 xl:grid-cols-[1fr_210px]">
                      <div>
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <span className={`border px-2 py-1 text-xs ${severityClass(finding.severity)}`}>
                            {finding.severity}
                          </span>
                          <span className="border border-szn-border-subtle bg-szn-bg px-2 py-1 text-xs text-szn-text-2">
                            {categoryLabel(finding.category)}
                          </span>
                          <span className="text-xs text-szn-text-3">prompt {finding.promptIndex + 1}</span>
                        </div>
                        <p className="text-sm leading-6 text-szn-text-1">{finding.prompt}</p>
                        {finding.actualOutput && (
                          <p className="mt-3 border-l border-szn-border-subtle pl-3 text-sm leading-6 text-szn-text-2">
                            {finding.actualOutput}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2 text-xs text-szn-text-3 xl:text-right">
                        <div>{formatWhen(finding.createdAt)}</div>
                        {finding.replayTraceId ? (
                          <a
                            href={`/dashboard/replay/${encodeURIComponent(finding.replayTraceId)}`}
                            className="inline-block text-szn-signal hover:text-szn-text-1"
                          >
                            Replay trace
                          </a>
                        ) : (
                          <span>No replay trace</span>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-szn-surface-1 px-4 py-3">
      <div className="text-2xl font-semibold text-szn-text-1">{value}</div>
      <div className="mt-1 text-xs uppercase text-szn-text-3">{label}</div>
    </div>
  );
}
