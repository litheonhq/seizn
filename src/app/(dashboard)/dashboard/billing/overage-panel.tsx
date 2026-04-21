import { getSessionUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import {
  calculateOverageForecast,
  isMeteredOveragePlan,
  resolveUsageBillingContext,
  type UsageDimension,
} from '@/lib/stripe-metered';

interface UsageAggregateRow {
  dimension: UsageDimension;
  total_quantity: number | string | null;
  stripe_reported_quantity: number | string | null;
}

function currentCycleStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function MetricBlock({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-lg border border-szn-border-subtle bg-szn-surface-1 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-szn-text-3">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-szn-text-1">{value}</p>
      <p className="mt-1 text-sm text-szn-text-2">{caption}</p>
    </div>
  );
}

export async function OveragePanel() {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.id) return null;

  const supabase = createServerClient();
  const context = await resolveUsageBillingContext(supabase, sessionUser.id);
  const cycleStart = currentCycleStart();

  const { data } = await supabase
    .from('usage_aggregates_monthly')
    .select('dimension, total_quantity, stripe_reported_quantity')
    .eq('studio_id', context.studioId)
    .eq('cycle_start', cycleStart);

  const aggregates = new Map<UsageDimension, UsageAggregateRow>();
  for (const row of (data || []) as UsageAggregateRow[]) {
    aggregates.set(row.dimension, row);
  }

  const memoryRow = aggregates.get('memories');
  const opsRow = aggregates.get('ops');
  const memories = calculateOverageForecast({
    plan: context.plan,
    dimension: 'memories',
    totalQuantity: toNumber(memoryRow?.total_quantity),
    stripeReportedQuantity: toNumber(memoryRow?.stripe_reported_quantity),
  });
  const ops = calculateOverageForecast({
    plan: context.plan,
    dimension: 'ops',
    totalQuantity: toNumber(opsRow?.total_quantity),
    stripeReportedQuantity: toNumber(opsRow?.stripe_reported_quantity),
  });
  const forecastCents = memories.cents + ops.cents;
  const metered = isMeteredOveragePlan(context.plan);

  return (
    <section className="mb-8 rounded-lg border border-szn-border-subtle bg-szn-surface-2 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="szn-eyebrow">Billing overage</p>
          <h2 className="mt-2 text-xl font-semibold text-szn-text-1">
            Current-cycle forecast
          </h2>
          <p className="mt-1 text-sm text-szn-text-2">
            {metered
              ? 'Studio and Pro overage is reported to Stripe after included usage is exhausted.'
              : 'This plan is hard-capped before overage billing starts.'}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-sm text-szn-text-2">Cycle start</p>
          <p className="font-mono text-sm text-szn-text-1">{cycleStart}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <MetricBlock
          label="Forecast"
          value={formatUsd(forecastCents)}
          caption={`${memories.billable.toLocaleString()} memories + ${ops.billable.toLocaleString()} ops over included usage`}
        />
        <MetricBlock
          label="Memories"
          value={memories.total.toLocaleString()}
          caption={`${memories.included?.toLocaleString() || 'Unlimited'} included, ${formatUsd(memories.cents)} forecast`}
        />
        <MetricBlock
          label="Ops"
          value={ops.total.toLocaleString()}
          caption={`${ops.included?.toLocaleString() || 'Unlimited'} included, ${formatUsd(ops.cents)} forecast`}
        />
      </div>
    </section>
  );
}
