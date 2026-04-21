import type { Metadata } from "next";
import Link from "next/link";
import { getDictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import { createServerClient, hasServerSupabaseServiceRoleConfig } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

type IncidentRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  severity: "minor" | "major" | "critical";
  status: "investigating" | "identified" | "monitoring" | "resolved";
  title: string;
  summary: string | null;
  affected_components: string[] | null;
};

type PublicStatus = "operational" | "degraded" | "outage";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  return {
    title: dict.status.metadataTitle,
    description: dict.status.metadataDescription,
  };
}

async function getRecentIncidents(): Promise<IncidentRow[]> {
  if (!hasServerSupabaseServiceRoleConfig()) {
    return [];
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("incidents")
      .select("id, started_at, ended_at, severity, status, title, summary, affected_components")
      .eq("public", true)
      .order("started_at", { ascending: false })
      .limit(10);

    if (error) {
      console.warn("[status] Failed to load public incidents:", error.message);
      return [];
    }

    return (data ?? []) as IncidentRow[];
  } catch (error) {
    console.warn("[status] Failed to load public incidents:", error);
    return [];
  }
}

function getCurrentStatus(incidents: IncidentRow[]): PublicStatus {
  const active = incidents.filter((incident) => incident.status !== "resolved");

  if (active.some((incident) => incident.severity === "critical")) {
    return "outage";
  }

  if (active.length > 0) {
    return "degraded";
  }

  return "operational";
}

function getLast30DaysUptime(incidents: IncidentRow[], now = new Date()): number {
  const windowStart = now.getTime() - THIRTY_DAYS_MS;
  const downtimeMs = incidents.reduce((total, incident) => {
    const startedAt = new Date(incident.started_at).getTime();
    const endedAt = incident.ended_at ? new Date(incident.ended_at).getTime() : now.getTime();
    const overlapStart = Math.max(startedAt, windowStart);
    const overlapEnd = Math.min(endedAt, now.getTime());

    if (overlapEnd <= overlapStart) {
      return total;
    }

    return total + (overlapEnd - overlapStart);
  }, 0);

  return Math.max(0, 100 - (downtimeMs / THIRTY_DAYS_MS) * 100);
}

function formatDate(locale: Locale, value: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function LocalizedStatusPage({ params }: PageProps) {
  const { locale } = await params;
  const dict = await getDictionary(locale);
  const copy = dict.status;
  const incidents = await getRecentIncidents();
  const currentStatus = getCurrentStatus(incidents);
  const uptime = getLast30DaysUptime(incidents);
  const statusLabel = copy.states[currentStatus];
  const statusTone = {
    operational: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
    degraded: "border-amber-400/40 bg-amber-400/10 text-amber-100",
    outage: "border-red-400/40 bg-red-400/10 text-red-100",
  }[currentStatus];

  return (
    <main className="min-h-screen bg-szn-bg text-szn-text-1">
      <section className="border-b border-szn-border-subtle">
        <div className="mx-auto max-w-5xl px-6 py-20 md:py-28">
          <Link
            href={`/${locale}`}
            className="text-sm font-medium text-szn-text-2 transition-colors hover:text-szn-text-1"
          >
            Seizn
          </Link>
          <p className="szn-section-number mt-12">{copy.eyebrow}</p>
          <h1 className="szn-serif mt-5 text-[clamp(42px,7vw,76px)] leading-[1.03] text-szn-text-1">
            {copy.title}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-szn-text-2">{copy.subtitle}</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-5 px-6 py-12 md:grid-cols-2">
        <div className={`border ${statusTone} p-6`}>
          <p className="text-sm font-medium uppercase tracking-[0.14em]">{copy.currentStatusLabel}</p>
          <p className="mt-5 text-4xl font-semibold capitalize">{statusLabel}</p>
          <p className="mt-3 text-sm opacity-80">
            {copy.measuredScope}
          </p>
        </div>

        <div className="border border-szn-border-subtle bg-szn-surface p-6">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-szn-text-2">{copy.uptimeLabel}</p>
          <p className="mt-5 font-mono text-4xl font-semibold text-szn-text-1">{uptime.toFixed(3)}%</p>
          <p className="mt-3 text-sm text-szn-text-2">{copy.uptimeWindow}</p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="szn-section-number">{copy.incidentsEyebrow}</p>
            <h2 className="mt-3 text-2xl font-semibold text-szn-text-1">{copy.recentIncidentsTitle}</h2>
          </div>
          <Link href={`/${locale}/sla`} className="text-sm text-szn-signal transition-colors hover:text-szn-text-1">
            {copy.slaLink}
          </Link>
        </div>

        {incidents.length === 0 ? (
          <div className="border border-szn-border-subtle bg-szn-surface p-8 text-center">
            <p className="text-lg font-medium text-szn-text-1">{copy.noRecentIncidents}</p>
            <p className="mt-2 text-sm text-szn-text-2">{copy.noRecentIncidentsBody}</p>
          </div>
        ) : (
          <div className="divide-y divide-szn-border-subtle border border-szn-border-subtle">
            {incidents.map((incident) => (
              <article key={incident.id} className="bg-szn-surface p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-szn-text-1">{incident.title}</h3>
                    {incident.summary ? (
                      <p className="mt-2 text-sm leading-6 text-szn-text-2">{incident.summary}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <span className="border border-szn-border-subtle px-2 py-1 text-xs uppercase text-szn-text-2">
                      {incident.severity}
                    </span>
                    <span className="border border-szn-border-subtle px-2 py-1 text-xs uppercase text-szn-text-2">
                      {incident.status}
                    </span>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-szn-text-3">
                  <span>{formatDate(locale, incident.started_at)}</span>
                  {(incident.affected_components ?? []).length > 0 ? (
                    <span>{incident.affected_components?.join(", ")}</span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
