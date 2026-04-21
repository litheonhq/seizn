import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyCronSecret } from '@/lib/cron-auth';
import {
  calculateOverageForecast,
  isMeteredOveragePlan,
  reportMeterEvent,
  type UsageDimension,
} from '@/lib/stripe-metered';
import { logServerError } from '@/lib/server/logger';

interface UsageAggregateRow {
  studio_id: string;
  cycle_start: string;
  dimension: UsageDimension;
  total_quantity: number | string;
  stripe_reported_quantity: number | string | null;
  stripe_customer_id: string | null;
  subscription_id: string | null;
  plan: string | null;
}

function currentCycleStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function toInteger(value: number | string | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

async function processFlush() {
  const supabase = createServerClient();
  const cycleStart = currentCycleStart();

  const { data, error } = await supabase
    .from('usage_aggregates_monthly')
    .select('studio_id, cycle_start, dimension, total_quantity, stripe_reported_quantity, stripe_customer_id, subscription_id, plan')
    .eq('cycle_start', cycleStart)
    .in('dimension', ['memories', 'ops'])
    .order('updated_at', { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data || []) as UsageAggregateRow[];
  const results = {
    cycleStart,
    checked: rows.length,
    reported: 0,
    skipped: 0,
    errors: 0,
    quantityReported: {
      memories: 0,
      ops: 0,
    },
    details: [] as Array<{
      studioId: string;
      dimension: UsageDimension;
      quantity: number;
      status: 'reported' | 'skipped' | 'error';
      reason?: string;
    }>,
  };

  for (const row of rows) {
    const dimension = row.dimension;
    const plan = row.plan || 'free';
    const totalQuantity = toInteger(row.total_quantity);
    const stripeReportedQuantity = toInteger(row.stripe_reported_quantity);
    const forecast = calculateOverageForecast({
      plan,
      dimension,
      totalQuantity,
      stripeReportedQuantity,
    });

    if (!isMeteredOveragePlan(plan)) {
      results.skipped += 1;
      results.details.push({
        studioId: row.studio_id,
        dimension,
        quantity: 0,
        status: 'skipped',
        reason: 'non_metered_plan',
      });
      continue;
    }

    if (!row.stripe_customer_id) {
      results.skipped += 1;
      results.details.push({
        studioId: row.studio_id,
        dimension,
        quantity: 0,
        status: 'skipped',
        reason: 'missing_stripe_customer_id',
      });
      continue;
    }

    if (forecast.unreported <= 0) {
      results.skipped += 1;
      results.details.push({
        studioId: row.studio_id,
        dimension,
        quantity: 0,
        status: 'skipped',
        reason: 'no_unreported_overage',
      });
      continue;
    }

    try {
      const newReportedQuantity = stripeReportedQuantity + forecast.unreported;
      await reportMeterEvent(row.stripe_customer_id, dimension, forecast.unreported, {
        identifier: `usage:${row.studio_id}:${row.cycle_start}:${dimension}:${newReportedQuantity}`,
      });

      const { error: updateError } = await supabase
        .from('usage_aggregates_monthly')
        .update({
          stripe_reported_quantity: newReportedQuantity,
          last_flushed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('studio_id', row.studio_id)
        .eq('cycle_start', row.cycle_start)
        .eq('dimension', dimension);

      if (updateError) {
        throw updateError;
      }

      results.reported += 1;
      results.quantityReported[dimension] += forecast.unreported;
      results.details.push({
        studioId: row.studio_id,
        dimension,
        quantity: forecast.unreported,
        status: 'reported',
      });
    } catch (error) {
      results.errors += 1;
      results.details.push({
        studioId: row.studio_id,
        dimension,
        quantity: forecast.unreported,
        status: 'error',
        reason: error instanceof Error ? error.message : 'unknown_error',
      });
      logServerError('[usage/flush] Stripe meter event reporting failed', error, {
        studioId: row.studio_id,
        dimension,
      });
    }
  }

  return results;
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await processFlush();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...results,
    });
  } catch (error) {
    logServerError('[usage/flush] Usage flush failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
