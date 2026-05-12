'use client';

interface MetricsData {
  computed_at: string;
  current_month: string;
  cac_by_channel: Array<{ channel: string; spend: number; signups: number; cac: number | null }>;
  funnel_30d: {
    signups: number;
    byok_added: number;
    first_extract: number;
    first_check: number;
    first_dialog: number;
    subscribed: number;
    cancelled: number;
    blended_conversion: number | null;
  };
  mrr: { current_cents: number; previous_month_cents: number; growth_pct: number | null };
  churn: { last_month_pct: number | null; canceled: number; active_at_start: number };
  trial_cost: { last_month_total_usd: number; users: number; avg_per_user_usd: number | null };
  alerts: string[];
}

function fmtUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtPct(value: number | null) {
  return value == null ? '—' : `${value.toFixed(1)}%`;
}

export default function MetricsDashboardClient({ data }: { data: MetricsData }) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex items-baseline justify-between mb-8">
        <h1 className="text-2xl font-semibold">📊 Seizn Metrics</h1>
        <p className="text-xs text-muted-foreground">
          Updated {new Date(data.computed_at).toLocaleString()}
        </p>
      </div>

      {data.alerts.length > 0 && (
        <section className="mb-8 p-4 rounded-lg border border-red-300 bg-red-50">
          <h2 className="text-sm font-medium text-red-900 mb-2">⚠️ Active alerts</h2>
          <ul className="text-xs space-y-1">
            {data.alerts.map((a, i) => (
              <li key={i} className="text-red-800">{a}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card title="MRR (current)">
          <p className="text-3xl font-semibold">{fmtUsd(data.mrr.current_cents)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Previous month: {fmtUsd(data.mrr.previous_month_cents)}
            {data.mrr.growth_pct != null && (
              <span className={data.mrr.growth_pct >= 0 ? ' text-green-700' : ' text-red-700'}>
                {' '}({data.mrr.growth_pct >= 0 ? '+' : ''}{data.mrr.growth_pct}%)
              </span>
            )}
          </p>
        </Card>

        <Card title="Monthly churn">
          <p className="text-3xl font-semibold">{fmtPct(data.churn.last_month_pct)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {data.churn.canceled} canceled · {data.churn.active_at_start} active at month start
          </p>
        </Card>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-medium mb-3">Funnel (last 30 days)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Signups" value={data.funnel_30d.signups} />
          <Stat label="BYOK added" value={data.funnel_30d.byok_added} />
          <Stat label="First extract" value={data.funnel_30d.first_extract} />
          <Stat label="First check" value={data.funnel_30d.first_check} />
          <Stat label="First dialog" value={data.funnel_30d.first_dialog} />
          <Stat label="Subscribed" value={data.funnel_30d.subscribed} highlight />
          <Stat label="Cancelled" value={data.funnel_30d.cancelled} />
          <Stat
            label="Conversion"
            value={fmtPct(data.funnel_30d.blended_conversion)}
            highlight
          />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-medium mb-3">CAC by channel ({data.current_month})</h2>
        {data.cac_by_channel.length === 0 ? (
          <p className="text-xs text-muted-foreground">No ad spend logged this month.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 font-medium">Channel</th>
                <th className="text-right py-2 font-medium">Spend</th>
                <th className="text-right py-2 font-medium">Signups</th>
                <th className="text-right py-2 font-medium">CAC</th>
              </tr>
            </thead>
            <tbody>
              {data.cac_by_channel.map((row) => (
                <tr key={row.channel} className="border-b">
                  <td className="py-2">{row.channel}</td>
                  <td className="py-2 text-right">${row.spend.toFixed(2)}</td>
                  <td className="py-2 text-right">{row.signups}</td>
                  <td
                    className={`py-2 text-right ${
                      row.cac != null && row.cac > 25 ? 'text-red-700' : ''
                    }`}
                  >
                    {row.cac != null ? `$${row.cac.toFixed(2)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium mb-3">Trial cost (last month)</h2>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Total cost" value={`$${data.trial_cost.last_month_total_usd.toFixed(2)}`} />
          <Stat label="Users" value={data.trial_cost.users} />
          <Stat
            label="Avg / user"
            value={
              data.trial_cost.avg_per_user_usd != null
                ? `$${data.trial_cost.avg_per_user_usd.toFixed(2)}`
                : '—'
            }
          />
        </div>
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-5 rounded-lg border bg-white">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div className={`p-3 rounded-lg border ${highlight ? 'bg-blue-50 border-blue-200' : 'bg-white'}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold mt-1">{value}</p>
    </div>
  );
}
