import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { NotFoundErrors, ServerErrors } from '@/lib/api-error';

interface RouteParams {
  params: Promise<{ shareId: string }>;
}

/**
 * GET /api/traces/[shareId] - Get a shared trace (public, no auth required)
 *
 * Returns the trace snapshot if the share link is valid and not expired
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { shareId } = await params;

    if (!shareId || shareId.length < 6) {
      return NotFoundErrors.resource('trace');
    }

    const supabase = createServerClient();

    // Get shared trace
    const { data: share, error } = await supabase
      .from('shared_traces')
      .select('share_id, trace_snapshot, expires_at, view_count, created_at')
      .eq('share_id', shareId)
      .single();

    if (error || !share) {
      return NotFoundErrors.resource('shared trace');
    }

    // Check if expired
    if (new Date(share.expires_at) < new Date()) {
      return NextResponse.json(
        {
          error: {
            code: 'TRACE_EXPIRED',
            message: 'This shared trace link has expired',
            expired_at: share.expires_at,
          },
        },
        { status: 410 }
      );
    }

    // Increment view count (fire and forget)
    void supabase
      .from('shared_traces')
      .update({ view_count: (share.view_count || 0) + 1 })
      .eq('share_id', shareId);

    return NextResponse.json({
      success: true,
      share_id: share.share_id,
      trace: share.trace_snapshot,
      shared_at: share.created_at,
      expires_at: share.expires_at,
      view_count: (share.view_count || 0) + 1,
    });
  } catch (error) {
    console.error('Get shared trace error:', error);
    return ServerErrors.internal('get_shared_trace');
  }
}
