import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyCronSecret } from '@/lib/cron-auth';
import { logServerError } from '@/lib/server/logger';

// Plan limits for downgrade
const FREE_PLAN_LIMITS = {
  memory_limit: 10000,
  api_calls_limit: 1000,
};

// GET /api/cron/subscription-expiry - Check and downgrade expired subscriptions
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const results = {
    checked: 0,
    downgraded: 0,
    errors: 0,
    details: [] as Array<{ userId: string; oldPlan: string; error?: string }>,
  };

  try {
    const supabase = createServerClient();
    const now = new Date().toISOString();

    // Find expired subscriptions
    // Users with subscription_ends_at < now AND plan != 'free'
    const { data: expiredUsers, error: fetchError } = await supabase
      .from('profiles')
      .select('id, email, plan, subscription_ends_at, subscription_cancelled')
      .neq('plan', 'free')
      .lt('subscription_ends_at', now)
      .not('subscription_ends_at', 'is', null);

    if (fetchError) {
      logServerError('Subscription expiry cron failed to fetch expired subscriptions', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch expired subscriptions' },
        { status: 500 }
      );
    }

    results.checked = expiredUsers?.length || 0;

    // Process each expired user
    for (const user of expiredUsers || []) {
      try {
        const oldPlan = user.plan;

        // Downgrade to free plan
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            plan: 'free',
            memory_limit: FREE_PLAN_LIMITS.memory_limit,
            api_calls_limit: FREE_PLAN_LIMITS.api_calls_limit,
            plan_updated_at: now,
            // Clear subscription fields
            subscription_ends_at: null,
            subscription_renews_at: null,
            subscription_cancelled: false,
          })
          .eq('id', user.id);

        if (updateError) {
          logServerError('Subscription expiry cron failed to downgrade user', updateError, {
            userId: user.id,
          });
          results.errors++;
          results.details.push({
            userId: user.id,
            oldPlan,
            error: updateError.message,
          });
          continue;
        }

        // Log to audit table
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action: 'subscription.expired',
          resource_type: 'profile',
          resource_id: user.id,
          details: {
            reason: 'subscription_expired',
            subscription_ended_at: user.subscription_ends_at,
            was_cancelled: user.subscription_cancelled,
          },
          previous_state: { plan: oldPlan },
          new_state: { plan: 'free' },
          status: 'success',
        });

        results.downgraded++;
        results.details.push({
          userId: user.id,
          oldPlan,
        });

        console.log(
          `Downgraded user ${user.id} from ${oldPlan} to free (expired: ${user.subscription_ends_at})`
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logServerError('Subscription expiry cron failed to process user', err, {
          userId: user.id,
        });
        results.errors++;
        results.details.push({
          userId: user.id,
          oldPlan: user.plan,
          error: errorMessage,
        });
      }
    }

    const duration = Date.now() - startTime;

    console.log(
      `Subscription expiry cron completed: ${results.downgraded}/${results.checked} downgraded, ${results.errors} errors, ${duration}ms`
    );

    return NextResponse.json({
      success: true,
      checked: results.checked,
      downgraded: results.downgraded,
      errors: results.errors,
      duration_ms: duration,
      timestamp: now,
    });
  } catch (error) {
    logServerError('Subscription expiry cron failed', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
