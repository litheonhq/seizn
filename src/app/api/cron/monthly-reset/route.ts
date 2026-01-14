import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// Cron authentication
const CRON_SECRET = process.env.CRON_SECRET;

// GET /api/cron/monthly-reset - Reset monthly API call counters for all users
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const now = new Date();
  const resetMonth = now.toISOString().slice(0, 7); // YYYY-MM format

  try {
    const supabase = createServerClient();

    // Get count of users with API calls before reset (for logging)
    const { count: usersWithCalls } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gt('api_calls_this_month', 0);

    // Get total API calls across all users (for statistics)
    const { data: statsData } = await supabase
      .from('profiles')
      .select('api_calls_this_month')
      .gt('api_calls_this_month', 0);

    const totalCallsBeforeReset = statsData?.reduce(
      (sum, profile) => sum + (profile.api_calls_this_month || 0),
      0
    ) || 0;

    // Reset all users' monthly API call counters
    const { error: resetError } = await supabase
      .from('profiles')
      .update({
        api_calls_this_month: 0,
        updated_at: now.toISOString(),
      })
      .gt('api_calls_this_month', 0);

    if (resetError) {
      console.error('Failed to reset API call counters:', resetError);
      return NextResponse.json(
        { error: 'Failed to reset API call counters', details: resetError.message },
        { status: 500 }
      );
    }

    // Log the monthly reset event to audit table
    await supabase.from('audit_logs').insert({
      user_id: null, // System action
      action: 'system.monthly_reset',
      resource_type: 'profile',
      resource_id: null,
      details: {
        reset_month: resetMonth,
        users_affected: usersWithCalls || 0,
        total_calls_reset: totalCallsBeforeReset,
      },
      status: 'success',
    });

    const duration = Date.now() - startTime;

    console.log(
      `Monthly reset completed for ${resetMonth}: ${usersWithCalls || 0} users, ${totalCallsBeforeReset} total calls reset, ${duration}ms`
    );

    return NextResponse.json({
      success: true,
      reset_month: resetMonth,
      users_reset: usersWithCalls || 0,
      total_calls_reset: totalCallsBeforeReset,
      duration_ms: duration,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Monthly reset cron error:', errorMessage);

    // Log the failure
    try {
      const supabase = createServerClient();
      await supabase.from('audit_logs').insert({
        user_id: null,
        action: 'system.monthly_reset',
        resource_type: 'profile',
        resource_id: null,
        details: { reset_month: resetMonth },
        status: 'failed',
        error_message: errorMessage,
      });
    } catch {
      // Ignore logging errors
    }

    return NextResponse.json(
      { error: 'Internal server error', details: errorMessage },
      { status: 500 }
    );
  }
}
