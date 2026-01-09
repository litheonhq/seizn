import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendBatchEmails } from '@/lib/email';
import { usageAlertEmail } from '@/lib/email/templates';

// Cron authentication
const CRON_SECRET = process.env.CRON_SECRET;

// Usage thresholds to trigger alerts (as percentages)
const USAGE_THRESHOLDS = [80, 90, 100];

// GET /api/cron/usage-alerts - Check usage and send alerts
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServerClient();

    // Get all users with their usage data
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, plan, memory_count, memory_limit, api_calls_this_month, api_calls_limit')
      .not('email', 'is', null);

    if (error) {
      console.error('Failed to fetch users:', error);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    const emailsToSend: Array<{
      to: string;
      subject: string;
      html: string;
    }> = [];

    for (const user of users || []) {
      if (!user.email) continue;

      // Calculate usage percentages
      const memoryPercent = user.memory_limit > 0
        ? Math.round((user.memory_count / user.memory_limit) * 100)
        : 0;
      const apiCallsPercent = user.api_calls_limit > 0
        ? Math.round((user.api_calls_this_month / user.api_calls_limit) * 100)
        : 0;

      // Get highest usage percentage
      const highestUsage = Math.max(memoryPercent, apiCallsPercent);

      // Find applicable threshold
      const applicableThreshold = USAGE_THRESHOLDS.find(
        (threshold) => highestUsage >= threshold
      );

      if (applicableThreshold) {
        // Check if we already sent an alert for this threshold today
        const today = new Date().toISOString().split('T')[0];
        const { data: existingAlert } = await supabase
          .from('usage_alerts_sent')
          .select('id')
          .eq('user_id', user.id)
          .eq('threshold', applicableThreshold)
          .gte('sent_at', `${today}T00:00:00Z`)
          .single();

        if (!existingAlert) {
          // Prepare email
          emailsToSend.push({
            to: user.email,
            subject: `Usage Alert: ${highestUsage}% of your ${user.plan} plan used`,
            html: usageAlertEmail(
              highestUsage,
              user.plan || 'Free',
              user.memory_count || 0,
              user.memory_limit || 0,
              user.api_calls_this_month || 0,
              user.api_calls_limit || 0
            ),
          });

          // Record that we sent this alert (table might not exist, that's okay)
          try {
            await supabase.from('usage_alerts_sent').insert({
              user_id: user.id,
              threshold: applicableThreshold,
              usage_percent: highestUsage,
            });
          } catch {
            console.log('usage_alerts_sent table does not exist, skipping tracking');
          }
        }
      }
    }

    // Send all emails in batch
    if (emailsToSend.length > 0) {
      const result = await sendBatchEmails(emailsToSend);
      console.log(`Sent ${emailsToSend.length} usage alert emails`, result);
    }

    return NextResponse.json({
      success: true,
      alertsSent: emailsToSend.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Usage alert cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
