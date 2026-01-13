import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, ServerErrors } from '@/lib/api-error';

/**
 * GET /api/traces - List user's traces
 *
 * Returns paginated list of traces for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    // Validate API key or session
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    const collection = searchParams.get('collection');

    const supabase = createServerClient();

    let query = supabase
      .from('traces')
      .select('id, query, collection, config, latency, cost_usd, created_at, replay_of')
      .eq('user_id', authResult.userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (collection) {
      query = query.eq('collection', collection);
    }

    const { data: traces, error, count } = await query;

    if (error) {
      console.error('Traces list error:', error);
      return ServerErrors.internal('traces_list');
    }

    return NextResponse.json({
      success: true,
      traces: traces || [],
      pagination: {
        limit,
        offset,
        total: count || traces?.length || 0,
      },
    });
  } catch (error) {
    console.error('Traces list error:', error);
    return ServerErrors.internal('traces_list');
  }
}
