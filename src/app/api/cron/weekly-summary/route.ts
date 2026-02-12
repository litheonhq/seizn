import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendBatchEmails } from '@/lib/email';
import { weeklyUsageSummaryEmail } from '@/lib/email/templates';
import { verifyCronSecret } from '@/lib/cron-auth';

// GET /api/cron/weekly-summary - Send weekly usage summaries
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServerClient();

    // Get the date range for last week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Get all users with email
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .not('email', 'is', null);

    if (usersError) {
      console.error('Failed to fetch users:', usersError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    const emailsToSend: Array<{
      to: string;
      subject: string;
      html: string;
    }> = [];

    for (const user of users || []) {
      if (!user.email) continue;

      // Get memories created this week
      const { count: memoriesCount } = await supabase
        .from('memories')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', oneWeekAgo.toISOString());

      // Get API calls this week
      const { count: apiCallsCount } = await supabase
        .from('usage_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', oneWeekAgo.toISOString());

      // Only send if there was activity
      if ((memoriesCount || 0) > 0 || (apiCallsCount || 0) > 0) {
        // Get top tags from memories created this week
        const { data: recentMemories } = await supabase
          .from('memories')
          .select('tags')
          .eq('user_id', user.id)
          .gte('created_at', oneWeekAgo.toISOString())
          .limit(100);

        // Count tag occurrences
        const tagCounts: Record<string, number> = {};
        for (const memory of recentMemories || []) {
          for (const tag of memory.tags || []) {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        }

        // Get top 5 tags
        const topTags = Object.entries(tagCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([tag]) => tag);

        emailsToSend.push({
          to: user.email,
          subject: `Your Weekly Seizn Summary: ${memoriesCount || 0} memories, ${apiCallsCount || 0} API calls`,
          html: weeklyUsageSummaryEmail(
            user.full_name || '',
            memoriesCount || 0,
            apiCallsCount || 0,
            topTags
          ),
        });
      }
    }

    // Send all emails in batch (max 100 per batch for Resend)
    if (emailsToSend.length > 0) {
      // Split into batches of 100
      const batches = [];
      for (let i = 0; i < emailsToSend.length; i += 100) {
        batches.push(emailsToSend.slice(i, i + 100));
      }

      for (const batch of batches) {
        const result = await sendBatchEmails(batch);
        console.log(`Sent batch of ${batch.length} weekly summary emails`, result);
      }
    }

    return NextResponse.json({
      success: true,
      summariesSent: emailsToSend.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Weekly summary cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
