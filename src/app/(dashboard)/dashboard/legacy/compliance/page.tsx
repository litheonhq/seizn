import type { Metadata } from 'next';
import DashboardShell from '@/components/dashboard/DashboardShell';
import { getAuthOrReview } from '@/lib/auth-or-review';
import { createServerClient } from '@/lib/supabase';
import { resolveComplianceOrganizationId } from '@/lib/compliance/organization';
import {
  buildOrganizationComplianceStatus,
  listRecentDsrJobs,
} from '@/lib/compliance/dsr';

export const metadata: Metadata = {
  title: 'Compliance & Privacy - Seizn Dashboard',
  description: 'Monitor data subject requests, consent posture, and audit readiness.',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function CompliancePage() {
  const { user } = await getAuthOrReview();
  const supabase = createServerClient();
  const organizationId =
    user.id === 'review'
      ? null
      : await resolveComplianceOrganizationId(supabase, { userId: user.id });

  const [status, jobs] = organizationId
    ? await Promise.all([
        buildOrganizationComplianceStatus(supabase, organizationId),
        listRecentDsrJobs(supabase, organizationId, 25),
      ])
    : [
        {
          pendingJobs: 0,
          completedJobs: 0,
          consentRecords: 0,
          subjectMemories: 0,
        },
        [],
      ];

  return (
    <DashboardShell>
      <div className="space-y-10">
        <section className="relative overflow-hidden py-10 sm:py-12">
          <div className="absolute inset-0 szn-glow-signal opacity-40 pointer-events-none" aria-hidden="true" />
          <div className="relative">
            <div className="szn-section-number mb-5">06 / RIGHTS LAYER</div>
            <h1 className="szn-serif text-[clamp(36px,4.4vw,64px)] text-szn-text-1 leading-[1.02] mb-3">
              Compliance &amp; Privacy
            </h1>
            <p className="text-szn-text-2 text-[15px] max-w-2xl leading-[1.6]">
              Export, erase, and prove subject-keyed memory actions without leaving the audit trail.
            </p>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-px bg-szn-border-subtle border-y border-szn-border-subtle">
          <StatCell label="EU/EEA users" value="Ready" note="DSR export + delete" accent />
          <StatCell label="Under-13 retention" value="Gated" note="Consent required" />
          <StatCell label="Audit retention" value="7 years" note="Tamper-evident export" />
          <StatCell label="Subject memories" value={String(status.subjectMemories)} note="With subject_id" />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="border-y border-szn-border-subtle py-6">
            <div className="szn-eyebrow mb-2">REQUEST INTAKE</div>
            <h2 className="szn-serif text-[28px] text-szn-text-1 leading-[1.1] mb-5">
              Run DSR export
            </h2>
            <form className="space-y-4" action="/api/v1/dsr/export" method="post">
              <label className="block">
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-szn-text-3">
                  subject_id
                </span>
                <input
                  name="subject_id"
                  placeholder="player_7f4a"
                  className="mt-2 w-full rounded-md border border-szn-border-subtle bg-szn-surface-1 px-3 py-2 text-sm text-szn-text-1 outline-none focus:border-szn-signal"
                />
              </label>
              <button
                type="submit"
                className="rounded-md bg-szn-signal px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-szn-bg"
              >
                Export Archive
              </button>
            </form>
            <p className="mt-4 text-[12px] leading-[1.6] text-szn-text-3">
              API clients should send the same payload with an organization-scoped Bearer key.
            </p>
          </div>

          <div className="border-y border-szn-border-subtle py-6">
            <div className="szn-eyebrow mb-2">VERIFIABLE ERASURE</div>
            <h2 className="szn-serif text-[28px] text-szn-text-1 leading-[1.1] mb-5">
              Run DSR deletion
            </h2>
            <form className="space-y-4" action="/api/v1/dsr/delete" method="post">
              <label className="block">
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-szn-text-3">
                  subject_id
                </span>
                <input
                  name="subject_id"
                  placeholder="player_7f4a"
                  className="mt-2 w-full rounded-md border border-szn-border-subtle bg-szn-surface-1 px-3 py-2 text-sm text-szn-text-1 outline-none focus:border-szn-signal"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-szn-text-3">
                  reason
                </span>
                <input
                  name="reason"
                  placeholder="GDPR Article 17 request"
                  className="mt-2 w-full rounded-md border border-szn-border-subtle bg-szn-surface-1 px-3 py-2 text-sm text-szn-text-1 outline-none focus:border-szn-signal"
                />
              </label>
              <button
                type="submit"
                className="rounded-md border border-szn-signal-line px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-szn-signal"
              >
                Delete + Certify
              </button>
            </form>
          </div>
        </section>

        <section className="border-y border-szn-border-subtle">
          <div className="py-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="szn-eyebrow mb-2">RECENT DSR JOBS</div>
              <h2 className="szn-serif text-[28px] text-szn-text-1 leading-[1.1]">
                Rights request ledger
              </h2>
            </div>
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-szn-text-3">
              {status.pendingJobs} pending / {status.completedJobs} completed
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-szn-border-subtle">
                  <TableHead>Job</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Artifact</TableHead>
                </tr>
              </thead>
              <tbody className="divide-y divide-szn-border-subtle">
                {jobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-szn-text-3">
                      No DSR jobs yet.
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-szn-surface-1">
                      <td className="px-4 py-3 font-mono text-xs text-szn-text-1">{job.id}</td>
                      <td className="px-4 py-3 text-szn-text-2">{job.type}</td>
                      <td className="px-4 py-3 font-mono text-xs text-szn-text-2">{job.subject_id}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-szn-signal-soft px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-szn-signal">
                          {job.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-szn-text-3">
                        {new Date(job.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        {job.artifact_url ? (
                          <a className="font-mono text-[11px] uppercase tracking-[0.18em] text-szn-signal" href={job.artifact_url}>
                            Archive
                          </a>
                        ) : job.certificate ? (
                          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-szn-signal">
                            Certificate
                          </span>
                        ) : (
                          <span className="text-szn-text-3">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-px bg-szn-border-subtle border-y border-szn-border-subtle">
          <StatCell label="Consent records" value={String(status.consentRecords)} note="COPPA evidence" />
          <StatCell label="Export endpoint" value="/v1/dsr/export" note="Signed archive URL" />
          <StatCell label="Audit endpoint" value="/v1/audit" note="Filtered + exportable" />
        </section>
      </div>
    </DashboardShell>
  );
}

function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left font-mono text-[11px] uppercase tracking-[0.18em] text-szn-text-3">
      {children}
    </th>
  );
}

function StatCell({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-szn-bg p-6">
      <div className="szn-eyebrow mb-5">{label}</div>
      <div className={`font-mono text-[28px] leading-[1.1] ${accent ? 'text-szn-signal' : 'text-szn-text-1'}`}>
        {value}
      </div>
      <div className="mt-4 text-[12px] leading-[1.5] text-szn-text-3">{note}</div>
    </div>
  );
}
