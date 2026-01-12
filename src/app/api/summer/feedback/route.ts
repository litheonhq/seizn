import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse, logRequest } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';

// POST /api/summer/feedback
// Body:
// {
//   "request_id": "uuid",
//   "event_type": "click|accept|thumb_up|thumb_down|...",
//   "chunk_id"?: "uuid",
//   "value"?: number,
//   "metadata"?: object
// }
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, plan } = authResult;
    const body = await request.json();

    const requestId = body?.request_id;
    const eventType = body?.event_type;
    const chunkId = body?.chunk_id ?? null;
    const value = typeof body?.value === 'number' ? body.value : 1;
    const metadata = body?.metadata ?? {};

    if (!requestId || typeof requestId !== 'string') {
      await logRequest({ userId, keyId, endpoint: '/api/summer/feedback', method: 'POST', startTime }, 400);
      return NextResponse.json({ error: 'request_id (string) is required' }, { status: 400 });
    }

    if (!eventType || typeof eventType !== 'string') {
      await logRequest({ userId, keyId, endpoint: '/api/summer/feedback', method: 'POST', startTime }, 400);
      return NextResponse.json({ error: 'event_type (string) is required' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Store raw feedback event
    const { error: fbErr } = await supabase.from('fall_retrieval_feedback').insert({
      user_id: userId,
      request_id: requestId,
      event_type: eventType,
      chunk_id: chunkId,
      value,
      metadata: {
        ...metadata,
        plan,
      },
    });

    if (fbErr) throw fbErr;

    // If we can map this request to an experiment arm, also store as outcome
    const { data: trace } = await supabase
      .from('fall_retrieval_traces')
      .select('experiment_id, arm_id')
      .eq('user_id', userId)
      .eq('request_id', requestId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (trace?.experiment_id && trace?.arm_id) {
      await supabase.from('fall_outcomes').insert({
        experiment_id: trace.experiment_id,
        arm_id: trace.arm_id,
        user_id: userId,
        request_id: requestId,
        event_type: eventType,
        value,
        metadata,
      });
    }

    await logRequest({ userId, keyId, endpoint: '/api/summer/feedback', method: 'POST', startTime }, 200);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('Summer feedback error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
