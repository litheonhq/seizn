import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';

// GET /api/fall/traces?limit=20
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 100);

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('fall_retrieval_traces')
      .select('id, request_id, plan, collection_id, query_hash, autopilot_reason, effective_config, timings_ms, results_count, error, sampled, created_at, experiment_id, arm_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json({ success: true, traces: data ?? [] }, { status: 200 });
  } catch (err) {
    console.error('Fall traces error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
