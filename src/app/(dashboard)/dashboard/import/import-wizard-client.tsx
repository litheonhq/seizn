"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileJson, RefreshCw, RotateCcw, UploadCloud } from "lucide-react";
import type {
  CompetitorImportSource,
  ImportJobView,
  NormalizedImportBundle,
} from "@/lib/import/types";

type PreviewResponse = {
  success: boolean;
  data?: { job: ImportJobView; bundle: NormalizedImportBundle };
  error?: { message?: string };
};

type JobResponse = {
  success: boolean;
  data?: { job: ImportJobView };
  error?: { message?: string };
};

const SOURCE_LABELS: Record<CompetitorImportSource, string> = {
  inworld: "Inworld",
  convai: "Convai",
  rivet: "Rivet",
};

const SAMPLE_HINTS: Record<CompetitorImportSource, string> = {
  inworld: "Upload the JSON export with knowledge and goals.",
  convai: "Upload the character JSON with backstory and tagline.",
  rivet: "Upload the graph JSON with nodes to seed belief shards.",
};

function statusTone(status?: string): string {
  if (status === "committed") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
  if (status === "rolled_back") return "border-amber-400/30 bg-amber-400/10 text-amber-100";
  return "border-szn-border-subtle bg-szn-surface-1 text-szn-text-2";
}

function compactList(items: string[]): string {
  if (items.length <= 4) return items.join(", ");
  return `${items.slice(0, 4).join(", ")} +${items.length - 4}`;
}

export function ImportWizardClient({ live }: { live: boolean }) {
  const [source, setSource] = useState<CompetitorImportSource>("inworld");
  const [filename, setFilename] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [job, setJob] = useState<ImportJobView | null>(null);
  const [bundle, setBundle] = useState<NormalizedImportBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(live ? null : "Login required");

  const canPreview = live && content.trim().length > 0 && !busy;
  const canCommit = live && job?.status === "previewed" && !busy;
  const canRollback = live && job?.status === "committed" && !busy;
  const previewRows = useMemo(() => {
    if (!bundle) return [];
    return [
      ...bundle.memories.slice(0, 4).map((item) => ({ kind: "Memory", label: item.content, meta: compactList(item.tags) })),
      ...bundle.canonLocks.slice(0, 4).map((item) => ({ kind: "Canon", label: item.statement, meta: item.scope })),
      ...bundle.beliefs.slice(0, 4).map((item) => ({ kind: "Belief", label: item.content, meta: item.holderEntityId })),
    ].slice(0, 8);
  }, [bundle]);

  useEffect(() => {
    const lastJobId = window.localStorage.getItem("seizn:last-import-job");
    if (!lastJobId || !live) return;

    let cancelled = false;
    const load = async () => {
      const response = await fetch(`/api/import/commit?jobId=${encodeURIComponent(lastJobId)}`, { cache: "no-store" });
      const payload = await response.json() as JobResponse;
      if (!cancelled && payload.success && payload.data?.job) {
        setJob(payload.data.job);
      }
    };

    void load();
    const timer = window.setInterval(load, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [live]);

  async function readFile(file: File) {
    setFilename(file.name);
    setContent(await file.text());
    setJob(null);
    setBundle(null);
    setError(null);
  }

  async function preview() {
    if (!canPreview) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/import/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source, filename, content }),
      });
      const payload = await response.json() as PreviewResponse;
      if (!payload.success || !payload.data) throw new Error(payload.error?.message || "Preview failed");
      setJob(payload.data.job);
      setBundle(payload.data.bundle);
      window.localStorage.setItem("seizn:last-import-job", payload.data.job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function updateJob(action: "commit" | "rollback") {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: job.id, action }),
      });
      const payload = await response.json() as JobResponse;
      if (!payload.success || !payload.data?.job) throw new Error(payload.error?.message || `${action} failed`);
      setJob(payload.data.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : `${action} failed`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-lg border border-szn-border-subtle bg-szn-surface-1 p-5">
        <div className="flex items-center gap-3">
          <UploadCloud className="h-5 w-5 text-szn-signal" aria-hidden="true" />
          <h2 className="text-lg font-semibold tracking-normal">Upload export</h2>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-2">
            <span className="szn-eyebrow">Source</span>
            <select
              value={source}
              onChange={(event) => {
                setSource(event.target.value as CompetitorImportSource);
                setJob(null);
                setBundle(null);
              }}
              className="rounded-md border border-szn-border-subtle bg-szn-bg px-3 py-2 text-sm text-szn-text-1 outline-none focus:border-szn-signal"
            >
              {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="szn-eyebrow">JSON file</span>
            <input aria-label="File upload"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
              }}
              className="rounded-md border border-szn-border-subtle bg-szn-bg px-3 py-2 text-sm text-szn-text-2 file:mr-3 file:rounded-md file:border-0 file:bg-szn-surface-2 file:px-3 file:py-1.5 file:text-szn-text-1"
            />
            <span className="text-xs text-szn-text-3">{SAMPLE_HINTS[source]}</span>
          </label>

          <label className="grid gap-2">
            <span className="szn-eyebrow">Paste JSON</span>
            <textarea
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                setJob(null);
                setBundle(null);
              }}
              placeholder="{ ... }"
              className="min-h-[220px] resize-y rounded-md border border-szn-border-subtle bg-szn-bg px-3 py-2 font-mono text-xs leading-5 text-szn-text-1 outline-none placeholder:text-szn-text-3 focus:border-szn-signal"
            />
          </label>

          {error && (
            <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={!canPreview}
            onClick={preview}
            className="szn-btn-signal inline-flex items-center justify-center gap-2 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileJson className="h-4 w-4" aria-hidden="true" />}
            Preview import
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-szn-border-subtle bg-szn-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-normal">Preview and commit</h2>
            <p className="mt-1 text-sm text-szn-text-2">{filename || job?.filename || "No file selected"}</p>
          </div>
          <span className={`rounded-md border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] ${statusTone(job?.status)}`}>
            {job?.status || "idle"}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-szn-border-subtle bg-szn-surface-1 p-4">
            <p className="text-3xl font-semibold">{job?.summary.memories || 0}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.12em] text-szn-text-3">memories</p>
          </div>
          <div className="rounded-lg border border-szn-border-subtle bg-szn-surface-1 p-4">
            <p className="text-3xl font-semibold">{job?.summary.canonLocks || 0}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.12em] text-szn-text-3">canon locks</p>
          </div>
          <div className="rounded-lg border border-szn-border-subtle bg-szn-surface-1 p-4">
            <p className="text-3xl font-semibold">{job?.summary.beliefs || 0}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.12em] text-szn-text-3">beliefs</p>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-szn-border-subtle bg-szn-surface-1">
          {previewRows.length > 0 ? previewRows.map((row) => (
            <div key={`${row.kind}:${row.label}`} className="border-b border-szn-border-subtle px-4 py-3 last:border-0">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-szn-signal">{row.kind}</span>
                <span className="text-xs text-szn-text-3">{row.meta}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-szn-text-2">{row.label}</p>
            </div>
          )) : (
            <div className="px-4 py-8 text-center text-sm text-szn-text-3">
              Preview an export to inspect mapped Seizn entities.
            </div>
          )}
        </div>

        {bundle?.warnings && bundle.warnings.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            {bundle.warnings.slice(0, 3).join(" ")}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!canCommit}
            onClick={() => void updateJob("commit")}
            className="szn-btn-signal inline-flex items-center gap-2 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Commit import
          </button>
          <button
            type="button"
            disabled={!canRollback}
            onClick={() => void updateJob("rollback")}
            className="szn-btn-ghost inline-flex items-center gap-2 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Roll back
          </button>
        </div>
      </section>
    </div>
  );
}
