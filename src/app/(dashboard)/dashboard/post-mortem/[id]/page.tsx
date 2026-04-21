import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { resolveMemoryBudgetOrganizationId } from "@/lib/memory/budget";
import {
  createPostMortemPdfSignedUrl,
  getPostMortemReport,
} from "@/lib/post-mortem/report";
import type { PostMortemReportRecord } from "@/lib/post-mortem/types";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Post-Mortem Report | Seizn Dashboard",
  robots: {
    index: false,
    follow: false,
  },
};

interface PostMortemDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ token?: string }>;
}

function formatWhen(value: string | null) {
  if (!value) return "pending";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

async function loadReport(id: string, token: string | null) {
  const supabase = createServerClient();
  if (token) {
    const report = await getPostMortemReport({ id, token, supabase });
    return { report, signedUrl: report ? await createPostMortemPdfSignedUrl(report, supabase) : null };
  }

  const authState = await getAuthOrReview();
  if (!authState.isAuthenticated) return { report: null, signedUrl: null };

  const organizationId = await resolveMemoryBudgetOrganizationId(supabase, {
    userId: authState.user.id,
    keyId: null,
  });
  if (!organizationId) return { report: null, signedUrl: null };

  const report = await getPostMortemReport({ id, studioId: organizationId, supabase });
  return { report, signedUrl: report ? await createPostMortemPdfSignedUrl(report, supabase) : null };
}

export default async function PostMortemDetailPage({ params, searchParams }: PostMortemDetailPageProps) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const { report, signedUrl } = await loadReport(id, query.token || null);

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Link href="/dashboard/post-mortem" className="mb-6 inline-flex text-xs text-szn-signal hover:text-szn-text-1">
          POST-MORTEMS
        </Link>

        {!report ? (
          <section className="border-y border-szn-border-subtle py-12 text-sm text-szn-text-2">
            Post-mortem not found or token is invalid.
          </section>
        ) : (
          <ReportView report={report} signedUrl={signedUrl} />
        )}
      </div>
    </DashboardShell>
  );
}

function ReportView({ report, signedUrl }: { report: PostMortemReportRecord; signedUrl: string | null }) {
  const payload = report.reportPayload;
  const usageTotal = payload.usage.reduce((sum, item) => sum + item.forecastCents, 0);

  return (
    <main className="space-y-8">
      <header className="border-b border-szn-border-subtle pb-8">
        <div className="szn-section-number mb-5">LIVE POST-MORTEM</div>
        <h1 className="szn-serif text-5xl leading-none text-szn-text-1 sm:text-6xl">
          {report.title}
        </h1>
        <p className="mt-4 text-sm text-szn-text-2">
          {formatWhen(report.windowStart)} to {formatWhen(report.windowEnd)}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {signedUrl && (
            <a href={signedUrl} className="szn-btn-signal px-4 py-2 text-sm">
              Download PDF
            </a>
          )}
          <Link href="/dashboard/replay" className="szn-btn-ghost px-4 py-2 text-sm">
            Open Replay
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-px border border-szn-border-subtle bg-szn-border-subtle lg:grid-cols-4">
        <Metric label="Replays" value={payload.replayCount.toLocaleString()} />
        <Metric label="Canon hits" value={payload.canonViolations.length.toLocaleString()} />
        <Metric label="Chaos" value={payload.chaosFindings.length.toLocaleString()} />
        <Metric label="Overage" value={`$${(usageTotal / 100).toFixed(2)}`} />
      </section>

      <Section title="Executive Summary">
        <div className="space-y-4 text-[15px] leading-7 text-szn-text-2">
          {report.executiveSummary.map((paragraph, index) => (
            <p key={`${report.id}-summary-${index}`}>{paragraph}</p>
          ))}
        </div>
      </Section>

      <Section title="Top Canon Violations">
        <div className="divide-y divide-szn-border-subtle">
          {payload.canonViolations.length === 0 ? (
            <p className="py-4 text-sm text-szn-text-2">No canon violations in this window.</p>
          ) : (
            payload.canonViolations.map((item) => (
              <article key={item.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_120px_180px]">
                <p className="text-sm leading-6 text-szn-text-1">{item.attemptedContent}</p>
                <span className="text-xs uppercase text-szn-text-3">{item.severity}</span>
                {item.sessionId ? (
                  <Link href={`/dashboard/replay/${item.sessionId}`} className="break-all font-mono text-xs text-szn-signal">
                    {item.sessionId}
                  </Link>
                ) : (
                  <span className="text-xs text-szn-text-3">no replay</span>
                )}
              </article>
            ))
          )}
        </div>
      </Section>

      <Section title="Top Chaos Findings">
        <div className="divide-y divide-szn-border-subtle">
          {payload.chaosFindings.length === 0 ? (
            <p className="py-4 text-sm text-szn-text-2">No chaos findings in this window.</p>
          ) : (
            payload.chaosFindings.map((item) => (
              <article key={item.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_120px_160px]">
                <p className="text-sm leading-6 text-szn-text-1">{item.prompt}</p>
                <span className="text-xs uppercase text-szn-text-3">{item.severity}</span>
                <span className="text-xs uppercase text-szn-text-3">{item.category}</span>
              </article>
            ))
          )}
        </div>
      </Section>

      <Section title="Story Health Trend">
        {report.storyChartPngBase64 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:image/png;base64,${report.storyChartPngBase64}`}
            alt="Story Health trend chart"
            className="w-full border border-szn-border-subtle bg-szn-surface-1"
          />
        ) : (
          <p className="text-sm text-szn-text-2">No Story Health chart available.</p>
        )}
      </Section>

      <Section title="Overage Billing Summary">
        <div className="grid gap-px border border-szn-border-subtle bg-szn-border-subtle md:grid-cols-2">
          {payload.usage.length === 0 ? (
            <p className="bg-szn-bg p-4 text-sm text-szn-text-2">No metered overage usage in this window.</p>
          ) : (
            payload.usage.map((item) => (
              <div key={`${item.cycleStart}-${item.dimension}`} className="bg-szn-bg p-4">
                <div className="text-xs uppercase text-szn-text-3">{item.dimension}</div>
                <div className="mt-2 text-2xl font-semibold text-szn-text-1">{item.total.toLocaleString()}</div>
                <div className="mt-1 text-sm text-szn-text-2">
                  {item.billable.toLocaleString()} billable / ${(item.forecastCents / 100).toFixed(2)}
                </div>
              </div>
            ))
          )}
        </div>
      </Section>

      <Section title="Recommendations">
        <ol className="space-y-3 text-[15px] leading-7 text-szn-text-2">
          {report.recommendations.map((item, index) => (
            <li key={`${report.id}-rec-${index}`}>{index + 1}. {item}</li>
          ))}
        </ol>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-szn-border-subtle pt-6">
      <h2 className="mb-4 text-2xl font-semibold text-szn-text-1">{title}</h2>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-szn-bg p-4">
      <div className="text-2xl font-semibold text-szn-text-1">{value}</div>
      <div className="mt-1 text-xs uppercase text-szn-text-3">{label}</div>
    </div>
  );
}
