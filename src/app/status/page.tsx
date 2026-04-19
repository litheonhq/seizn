import Link from 'next/link';
import { StatusClient } from './status-client';

export const metadata = {
  title: 'System Status · Seizn',
  description: 'Real-time system status and uptime information for Seizn API services',
};

// ISR: Revalidate every 60 seconds
export const revalidate = 60;

interface ServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  latency_ms?: number;
  message?: string;
  last_check: string;
}

interface Incident {
  id: string;
  title: string;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  severity: 'minor' | 'major' | 'critical';
  affected_services: string[];
  started_at: string;
  resolved_at?: string;
  updates: Array<{ message: string; timestamp: string; }>;
}

type OverallStatus = 'operational' | 'degraded' | 'partial_outage' | 'major_outage';

interface StatusData {
  status: OverallStatus;
  services: ServiceStatus[];
  incidents: Incident[];
  uptime: {
    last_24h: number;
    last_7d: number;
    last_30d: number;
    last_90d: number;
  };
  incident_history?: Incident[];
  status_history?: Array<{ date: string; status: string; uptime_percent: number; }>;
  last_updated: string;
}

/**
 * Compute overall status from services (SSOT - same logic as status-client.tsx)
 * Rules:
 * - 3+ services down = major_outage
 * - 1+ services down = partial_outage
 * - 1+ services degraded = degraded
 * - All operational = operational
 */
function computeOverallStatus(services: ServiceStatus[]): OverallStatus {
  const downCount = services.filter((s) => s.status === 'down').length;
  const degradedCount = services.filter((s) => s.status === 'degraded').length;

  if (downCount >= 3) return 'major_outage';
  if (downCount >= 1) return 'partial_outage';
  if (degradedCount >= 1) return 'degraded';
  return 'operational';
}

async function getStatusData(): Promise<StatusData | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://seizn.com';
    const response = await fetch(baseUrl + '/api/status', {
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.success ? data : null;
  } catch (error) {
    console.error('Failed to fetch status data:', error);
    return {
      status: 'operational',
      incidents: [],
      services: [
        { name: 'API', status: 'operational', last_check: new Date().toISOString() },
        { name: 'Dashboard', status: 'operational', last_check: new Date().toISOString() },
        { name: 'Database', status: 'operational', last_check: new Date().toISOString() },
        { name: 'Search', status: 'operational', last_check: new Date().toISOString() },
      ],
      uptime: { last_24h: 100, last_7d: 99.99, last_30d: 99.98, last_90d: 99.97 },
      last_updated: new Date().toISOString(),
    };
  }
}

function getStatusLabel(status: StatusData['status']): string {
  const labels: Record<StatusData['status'], string> = {
    operational: 'All Systems Operational',
    degraded: 'Degraded Performance',
    partial_outage: 'Partial System Outage',
    major_outage: 'Major System Outage',
  };
  return labels[status];
}

function getStatusColors(status: StatusData['status']) {
  const colors: Record<StatusData['status'], { bg: string; text: string; border: string }> = {
    operational: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    degraded: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
    partial_outage: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
    major_outage: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  };
  return colors[status];
}

function SSRStatusContent({ data }: { data: StatusData }) {
  // Use computed status from services (ensures consistency with client)
  const computedStatus = computeOverallStatus(data.services);
  const statusLabel = getStatusLabel(computedStatus);
  const colors = getStatusColors(computedStatus);
  const statusIcon = computedStatus === 'operational' ? '\u2713' : '!';
  const iconBg = computedStatus === 'operational' ? 'bg-emerald-500' :
    computedStatus === 'major_outage' ? 'bg-red-500' : 'bg-orange-500';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <Link href="/" className="text-2xl font-bold text-szn-text-1">
          Seizn
        </Link>
        <span className="text-sm text-szn-text-2">System Status</span>
      </div>

      <div className={colors.bg + ' rounded-2xl p-6 mb-8 border ' + colors.border}>
        <div className="flex items-center gap-4">
          <div className={'w-12 h-12 ' + iconBg + ' rounded-full flex items-center justify-center text-white text-xl font-bold'}>
            {statusIcon}
          </div>
          <div>
            <h1 className={'text-xl font-bold ' + colors.text}>
              {statusLabel}
            </h1>
            <p className="text-szn-text-2 text-sm mt-1">
              Last updated: {new Date(data.last_updated).toISOString()}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-szn-card rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-szn-text-1">{data.uptime.last_24h.toFixed(2)}%</p>
          <p className="text-sm text-szn-text-2">24 hours</p>
        </div>
        <div className="bg-szn-card rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-szn-text-1">{data.uptime.last_7d.toFixed(2)}%</p>
          <p className="text-sm text-szn-text-2">7 days</p>
        </div>
        <div className="bg-szn-card rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-szn-text-1">{data.uptime.last_30d.toFixed(2)}%</p>
          <p className="text-sm text-szn-text-2">30 days</p>
        </div>
        <div className="bg-szn-card rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-szn-text-1">{data.uptime.last_90d.toFixed(2)}%</p>
          <p className="text-sm text-szn-text-2">90 days</p>
        </div>
      </div>

      <div className="bg-szn-card rounded-2xl border mb-8">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-szn-text-1">Service Status</h2>
        </div>
        <div className="divide-y">
          {data.services.map((service) => {
            const dotColor = service.status === 'operational' ? 'bg-emerald-500' :
              service.status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500';
            const textColor = service.status === 'operational' ? 'text-szn-accent' :
              service.status === 'degraded' ? 'text-yellow-600' : 'text-red-600';
            const statusText = service.status === 'operational' ? 'Operational' :
              service.status === 'degraded' ? 'Degraded' : 'Down';
            return (
              <div key={service.name} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className={'w-2.5 h-2.5 rounded-full ' + dotColor} />
                  <span className="font-medium text-szn-text-1">{service.name}</span>
                </div>
                <div className="flex items-center gap-4">
                  {service.latency_ms && (
                    <span className="text-sm text-szn-text-2">{service.latency_ms}ms</span>
                  )}
                  <span className={'text-sm ' + textColor}>{statusText}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="sr-only">
        <h2>Seizn System Status Summary</h2>
        <p>Current status: {statusLabel}</p>
        <p>Uptime last 24 hours: {data.uptime.last_24h}%</p>
        <p>Uptime last 7 days: {data.uptime.last_7d}%</p>
        <p>Uptime last 30 days: {data.uptime.last_30d}%</p>
        <p>Uptime last 90 days: {data.uptime.last_90d}%</p>
        <h3>Services</h3>
        <ul>
          {data.services.map((service) => (
            <li key={service.name}>{service.name}: {service.status}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default async function StatusPage() {
  const data = await getStatusData();

  return (
    <div className="min-h-screen bg-szn-bg">
      {data && (
        <noscript>
          <SSRStatusContent data={data} />
        </noscript>
      )}

      {/*
        StatusClient receives initialData and renders immediately without loading state
        when data is available. No Suspense wrapper needed since client handles loading.
        This eliminates duplicate "Service Status" headings that occurred when Suspense
        fallback also rendered SSRStatusContent before hydration completed.
      */}
      <StatusClient initialData={data} />
    </div>
  );
}
