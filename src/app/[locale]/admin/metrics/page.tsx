import type { Metadata } from 'next';
import { headers } from 'next/headers';
import MetricsDashboardClient from './metrics-dashboard';

export const metadata: Metadata = {
  title: 'Admin metrics — Seizn',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminMetricsPage() {
  const headersList = await headers();
  const host = headersList.get('host') ?? 'localhost';
  const protocol = host.startsWith('localhost') ? 'http' : 'https';
  // Server fetch with cookie passthrough so the auth() check in the API
  // route sees the same session.
  const cookie = headersList.get('cookie') ?? '';
  const response = await fetch(`${protocol}://${host}/api/admin/metrics`, {
    headers: { cookie },
    cache: 'no-store',
  });
  if (response.status === 401 || response.status === 403) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold">Admin only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This dashboard is restricted to Seizn admin emails.
        </p>
      </div>
    );
  }
  if (!response.ok) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-xl font-semibold">Metrics unavailable</h1>
        <p className="mt-2 text-sm">Status {response.status}.</p>
      </div>
    );
  }
  const data = await response.json();
  return <MetricsDashboardClient data={data} />;
}
