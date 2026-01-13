import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import {
  getHealthRecord,
  quickHealthCheck,
  scanCollection,
  saveHealthRecord,
} from '@/lib/self-healing';

/**
 * GET /api/healing/health - Get index health for a collection
 *
 * Query params:
 * - collectionId: UUID of the collection
 * - forceRefresh: boolean (optional) - Force a new scan
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    const collectionId = searchParams.get('collectionId');
    const forceRefresh = searchParams.get('forceRefresh') === 'true';

    if (!collectionId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/healing/health', method: 'GET', startTime },
        400
      );
      return NextResponse.json(
        { error: 'collectionId is required' },
        { status: 400 }
      );
    }

    // If force refresh, run a new scan
    if (forceRefresh) {
      const scanResult = await scanCollection(collectionId, userId);
      const health = await saveHealthRecord(collectionId, userId, scanResult);

      await logRequest(
        { userId, keyId, endpoint: '/api/healing/health', method: 'GET', startTime },
        200
      );

      return NextResponse.json({
        success: true,
        health,
        scanResult: {
          duration: scanResult.duration,
          issuesFound: scanResult.issues.length,
          recommendations: scanResult.recommendations.length,
        },
      });
    }

    // Otherwise, get cached health record
    const health = await getHealthRecord(collectionId, userId);

    if (!health) {
      // No health record exists, do a quick check
      const quickCheck = await quickHealthCheck(collectionId, userId);

      await logRequest(
        { userId, keyId, endpoint: '/api/healing/health', method: 'GET', startTime },
        200
      );

      return NextResponse.json({
        success: true,
        health: null,
        quickCheck,
        message: 'No health record found. Run a scan to generate health metrics.',
      });
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/healing/health', method: 'GET', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      health,
    });
  } catch (err) {
    console.error('Healing health GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/healing/health - Update health configuration
 *
 * Body:
 * - collectionId: UUID of the collection
 * - config: HealingConfig updates
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body = await request.json();

    const collectionId = body?.collectionId;

    if (!collectionId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/healing/health', method: 'POST', startTime },
        400
      );
      return NextResponse.json(
        { error: 'collectionId is required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Upsert healing config
    const configUpdates = {
      user_id: userId,
      collection_id: collectionId,
      auto_healing_enabled: body.autoHealingEnabled,
      auto_scan_enabled: body.autoScanEnabled,
      scan_interval_hours: body.scanIntervalHours,
      stale_threshold_days: body.staleThresholdDays,
      health_alert_threshold: body.healthAlertThreshold,
      critical_alert_threshold: body.criticalAlertThreshold,
      max_concurrent_jobs: body.maxConcurrentJobs,
      max_chunks_per_scan: body.maxChunksPerScan,
      batch_size: body.batchSize,
      email_alerts: body.emailAlerts,
      webhook_alerts: body.webhookAlerts,
      webhook_url: body.webhookUrl,
      reembed_rate_limit: body.reembedRateLimit,
      delete_requires_approval: body.deleteRequiresApproval,
    };

    // Remove undefined values
    const cleanUpdates = Object.fromEntries(
      Object.entries(configUpdates).filter(([, v]) => v !== undefined)
    );

    const { data: config, error } = await supabase
      .from('healing_config')
      .upsert(cleanUpdates, {
        onConflict: 'user_id,collection_id',
      })
      .select('*')
      .single();

    if (error) {
      await logRequest(
        { userId, keyId, endpoint: '/api/healing/health', method: 'POST', startTime },
        500
      );
      return NextResponse.json(
        { error: 'Failed to update configuration' },
        { status: 500 }
      );
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/healing/health', method: 'POST', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      config,
    });
  } catch (err) {
    console.error('Healing health POST error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
