/**
 * GET /api/cron/drift-analysis
 *
 * Daily cron job to collect drift snapshots and analyze all active collections.
 * Runs at 04:00 UTC daily.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DriftCollector } from '@/lib/drift';

// Verify cron secret for security
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // In development, allow without secret
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  // If no secret configured, allow the request
  if (!cronSecret) {
    console.warn('CRON_SECRET not configured, allowing request');
    return true;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  // Verify cron authorization
  if (!verifyCronSecret(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { success: false, error: 'Missing Supabase configuration' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const collector = new DriftCollector(supabaseUrl, supabaseKey);

  const results: {
    collectionId: string;
    collectionName: string;
    success: boolean;
    alertsGenerated: number;
    error?: string;
  }[] = [];

  try {
    // Get all active collections with enough recent activity
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Find collections with recent trace activity
    const { data: activeCollections } = await supabase
      .from('summer_collections')
      .select('id, name, user_id, org_id')
      .eq('active', true);

    if (!activeCollections || activeCollections.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active collections found',
        collectionsProcessed: 0,
        results: [],
      });
    }

    // Process each collection
    for (const collection of activeCollections) {
      try {
        // Check if collection has recent activity
        const { count: traceCount } = await supabase
          .from('traces')
          .select('*', { count: 'exact', head: true })
          .eq('collection_id', collection.id)
          .gte('created_at', yesterday);

        // Skip collections with no recent activity
        if (!traceCount || traceCount < 10) {
          results.push({
            collectionId: collection.id,
            collectionName: collection.name,
            success: true,
            alertsGenerated: 0,
            error: 'Skipped: insufficient recent activity',
          });
          continue;
        }

        // Collect snapshot and analyze
        const { snapshot: _snapshot, alerts } = await collector.collectSnapshot(
          collection.id,
          collection.user_id,
          collection.org_id
        );

        results.push({
          collectionId: collection.id,
          collectionName: collection.name,
          success: true,
          alertsGenerated: alerts.length,
        });

        // If alerts were generated, send notifications
        if (alerts.length > 0) {
          // Get user's notification preferences
          const { data: thresholds } = await supabase
            .from('drift_thresholds')
            .select('email_notifications, webhook_url')
            .eq('user_id', collection.user_id)
            .or(`collection_id.eq.${collection.id},collection_id.is.null`)
            .limit(1);

          const prefs = thresholds?.[0];

          // Send webhook notification if configured
          if (prefs?.webhook_url) {
            try {
              await fetch(prefs.webhook_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  event: 'drift_alerts',
                  collectionId: collection.id,
                  collectionName: collection.name,
                  alerts: alerts.map(a => ({
                    type: a.alertType,
                    severity: a.severity,
                    title: a.title,
                    message: a.message,
                  })),
                  timestamp: new Date().toISOString(),
                }),
              });
            } catch (webhookError) {
              console.error('Failed to send drift webhook:', webhookError);
            }
          }
        }
      } catch (collectionError) {
        console.error(`Failed to process collection ${collection.id}:`, collectionError);
        results.push({
          collectionId: collection.id,
          collectionName: collection.name,
          success: false,
          alertsGenerated: 0,
          error: collectionError instanceof Error ? collectionError.message : 'Unknown error',
        });
      }
    }

    // Summary stats
    const successCount = results.filter(r => r.success && !r.error?.includes('Skipped')).length;
    const alertCount = results.reduce((sum, r) => sum + r.alertsGenerated, 0);

    return NextResponse.json({
      success: true,
      message: `Drift analysis completed for ${successCount} collections`,
      collectionsProcessed: successCount,
      totalAlerts: alertCount,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error('Drift analysis cron job failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Drift analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request);
}
