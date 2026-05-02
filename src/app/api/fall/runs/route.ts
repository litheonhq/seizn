/**
 * FALL Runs API
 *
 * POST /api/fall/runs - Create a new run
 * GET /api/fall/runs - List runs for organization
 */

import { NextRequest, NextResponse } from 'next/server';
import { hasApiScope, validateApiKey } from '@/lib/auth/api-key';
import { createServerClient } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }
    if (!hasApiScope(auth.scopes, 'fall:write')) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Requires fall:write scope' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      trace_id,
      initial_input,
      agent_config,
      model_id,
      system_prompt,
      name,
      description,
    } = body;

    if (!trace_id || !initial_input) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'trace_id and initial_input are required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('fall_runs')
      .insert({
        organization_id: auth.organizationId,
        trace_id,
        initial_input,
        agent_config: agent_config || {},
        model_id,
        system_prompt,
        name,
        description,
        created_by: auth.userId,
        status: 'running',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Database Error', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ run: data }, { status: 201 });
  } catch (error) {
    console.error('[FallRuns] POST error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }
    if (!hasApiScope(auth.scopes, 'fall:read')) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Requires fall:read scope' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabase = createServerClient();

    let query = supabase
      .from('fall_runs')
      .select('*', { count: 'exact' })
      .eq('organization_id', auth.organizationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Database Error', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      runs: data,
      pagination: {
        total: count,
        limit,
        offset,
        has_more: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error('[FallRuns] GET error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
