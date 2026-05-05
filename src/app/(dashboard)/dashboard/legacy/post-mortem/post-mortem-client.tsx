"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { AlertTriangle, FileText, Play, Share2 } from "lucide-react";
import type { PostMortemReportRecord } from "@/lib/post-mortem/types";

interface PostMortemClientProps {
  reports: PostMortemReportRecord[];
  loadError?: string | null;
  live: boolean;
}

function formatWhen(value: string | null) {
  if (!value) return "pending";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusClass(status: PostMortemReportRecord["status"]) {
  if (status === "completed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (status === "running") return "border-violet-500/30 bg-violet-500/10 text-violet-200";
  if (status === "failed") return "border-red-500/30 bg-red-500/10 text-red-300";
  return "border-szn-border-subtle bg-szn-bg text-szn-text-2";
}

export function PostMortemClient({ reports: initialReports, loadError = null, live }: PostMortemClientProps) {
  const [reports, setReports] = useState(initialReports);
  const [title, setTitle] = useState("");
  const [days, setDays] = useState("30");
  const [message, setMessage] = useState<string | null>(loadError);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const stats = useMemo(() => {
    return {
      total: reports.length,
      completed: reports.filter((report) => report.status === "completed").length,
      running: reports.filter((report) => report.status === "running").length,
      failed: reports.filter((report) => report.status === "failed").length,
    };
  }, [reports]);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setShareUrl(null);

    if (!live) {
      setMessage("Login required to generate post-mortems.");
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch("/api/post-mortem/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || null,
          days: Number(days),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error?.message || "Failed to generate post-mortem");
      }
      const report = payload.data.report as PostMortemReportRecord;
      setReports((current) => [report, ...current.filter((item) => item.id !== report.id)]);
      setShareUrl(payload.data.shareUrl as string);
      setTitle("");
      setMessage("Post-mortem generated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to generate post-mortem");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 grid gap-6 xl:grid-cols-[1fr_520px] xl:items-end">
        <div>
          <div className="szn-section-number mb-5">09 / POST-MORTEM</div>
          <h1 className="szn-serif text-5xl leading-none text-szn-text-1 sm:text-6xl">
            Post-Mortem Reports
          </h1>
          <p className="mt-4 max-w-3xl text-[15px] leading-[1.7] text-szn-text-2">
            Shipped-title review packs with replay, canon, chaos, Story Health, and billing signals.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-px border border-szn-border-subtle bg-szn-border-subtle sm:grid-cols-4">
          <Metric label="Reports" value={stats.total.toLocaleString()} />
          <Metric label="Complete" value={stats.completed.toLocaleString()} />
          <Metric label="Running" value={stats.running.toLocaleString()} />
          <Metric label="Failed" value={stats.failed.toLocaleString()} />
        </div>
      </div>

      {message && (
        <div className="mb-6 flex items-center gap-2 border border-szn-border-subtle bg-szn-surface-1 px-4 py-3 text-sm text-szn-text-2">
          <AlertTriangle className="h-4 w-4 text-szn-signal" aria-hidden="true" />
          {message}
        </div>
      )}

      {shareUrl && (
        <div className="mb-6 border border-szn-signal-line bg-szn-signal-soft px-4 py-3 text-sm text-szn-text-1">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <Share2 className="h-4 w-4" aria-hidden="true" />
            Share link
          </div>
          <a href={shareUrl} className="break-all font-mono text-xs text-szn-signal hover:text-szn-text-1">
            {shareUrl}
          </a>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <form onSubmit={generate} className="border border-szn-border-subtle bg-szn-surface-1 p-5">
          <h2 className="text-lg font-semibold text-szn-text-1">Generate</h2>
          <label className="mt-5 block text-sm text-szn-text-2">
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Launch 1.0 post-mortem"
              className="mt-2 w-full border border-szn-border-subtle bg-szn-bg px-3 py-2 text-sm text-szn-text-1 outline-none focus:border-szn-signal"
            />
          </label>
          <label className="mt-4 block text-sm text-szn-text-2">
            Window
            <select
              value={days}
              onChange={(event) => setDays(event.target.value)}
              className="mt-2 w-full border border-szn-border-subtle bg-szn-bg px-3 py-2 text-sm text-szn-text-1 outline-none focus:border-szn-signal"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={isGenerating}
            className="szn-btn-signal mt-5 inline-flex w-full items-center justify-center gap-2 px-4 py-2 text-sm disabled:opacity-60"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {isGenerating ? "Generating" : "Generate report"}
          </button>
        </form>

        <section className="border border-szn-border-subtle bg-szn-surface-1">
          <div className="border-b border-szn-border-subtle px-5 py-4">
            <h2 className="text-lg font-semibold text-szn-text-1">Reports</h2>
          </div>
          <div className="divide-y divide-szn-border-subtle">
            {reports.length === 0 ? (
              <div className="p-6 text-sm text-szn-text-2">No post-mortems generated yet.</div>
            ) : (
              reports.map((report) => (
                <article key={report.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_180px_130px]">
                  <div>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex border px-2 py-1 text-xs font-medium ${statusClass(report.status)}`}>
                        {report.status}
                      </span>
                      <span className="font-mono text-xs text-szn-text-3">{report.id.slice(0, 8)}</span>
                    </div>
                    <h3 className="text-xl font-semibold text-szn-text-1">{report.title}</h3>
                    <p className="mt-2 text-sm text-szn-text-2">
                      {formatWhen(report.windowStart)} to {formatWhen(report.windowEnd)}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-px border border-szn-border-subtle bg-szn-border-subtle">
                    <Mini label="Replays" value={report.reportPayload.replayCount.toString()} />
                    <Mini label="PDF" value={report.pdfSizeBytes > 0 ? `${Math.round(report.pdfSizeBytes / 1024)}KB` : "-"} />
                  </div>
                  <div className="flex items-start gap-2 lg:justify-end">
                    <Link href={`/dashboard/legacy/post-mortem/${report.id}`} className="szn-btn-ghost inline-flex items-center gap-2 px-3 py-2 text-xs">
                      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                      Open
                    </Link>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
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

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-szn-bg px-3 py-2">
      <div className="font-mono text-sm text-szn-text-1">{value}</div>
      <div className="mt-1 text-[11px] uppercase text-szn-text-3">{label}</div>
    </div>
  );
}
