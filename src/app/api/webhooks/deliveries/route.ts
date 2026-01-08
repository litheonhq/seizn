import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';

// GET /api/webhooks/deliveries - Get webhook delivery history
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    const webhookId = searchParams.get('webhook_id');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status'); // pending, success, failed

    const supabase = createServerClient();

    // Build query - join with webhooks to verify ownership
    let query = supabase
      .from('webhook_deliveries')
      .select(`
        id,
        webhook_id,
        event_type,
        payload,
        status,
        status_code,
        error_message,
        attempt_count,
        max_attempts,
        created_at,
        delivered_at,
        webhooks!inner (
          id,
          user_id,
          name
        )
      `)
      .eq('webhooks.user_id', userId)
      .order('created_at', { ascending: false })
      .limit(Math.min(limit, 100));

    if (webhookId) {
      query = query.eq('webhook_id', webhookId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: deliveries, error } = await query;

    if (error) {
      console.error('Deliveries fetch error:', error);
      await logRequest(
        { userId, keyId, endpoint: '/api/webhooks/deliveries', method: 'GET', startTime },
        500
      );
      return NextResponse.json({ error: 'Failed to fetch deliveries' }, { status: 500 });
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/webhooks/deliveries', method: 'GET', startTime },
      200
    );

    // Format response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedDeliveries = (deliveries || []).map((d: any) => ({
      id: d.id,
      webhook_id: d.webhook_id,
      webhook_name: d.webhooks?.name,
      event_type: d.event_type,
      status: d.status,
      status_code: d.status_code,
      error_message: d.error_message,
      attempt_count: d.attempt_count,
      max_attempts: d.max_attempts,
      created_at: d.created_at,
      delivered_at: d.delivered_at,
      // Only include payload summary to reduce response size
      payload_preview: d.payload?.event || null,
    }));

    return NextResponse.json({
      success: true,
      deliveries: formattedDeliveries,
      count: formattedDeliveries.length,
    });
  } catch (error) {
    console.error('Deliveries GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
