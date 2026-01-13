import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, ServerErrors } from '@/lib/api-error';

/**
 * GET /api/fall/eval/runs - List evaluation runs
 *
 * Returns list of evaluation runs for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await validateApiKey(request);
    if (!authResult.success) {
      return AuthErrors.invalidKey();
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const status = searchParams.get('status');

    const supabase = createServerClient();

    let query = supabase
      .from('eval_runs')
      .select('*')
      .eq('user_id', authResult.userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: runs, error } = await query;

    if (error) {
      console.error('Eval runs list error:', error);
      // Return empty array if table doesn't exist yet
      return NextResponse.json({
        success: true,
        runs: [],
      });
    }

    return NextResponse.json({
      success: true,
      runs: runs || [],
    });
  } catch (error) {
    console.error('Eval runs list error:', error);
    return ServerErrors.internal('eval_runs_list');
  }
}

/**
 * POST /api/fall/eval/runs - Create a new evaluation run
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await validateApiKey(request);
    if (!authResult.success) {
      return AuthErrors.invalidKey();
    }

    const body = await request.json();
    const { name, dataset, config } = body;

    if (!name || !dataset) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'name and dataset are required' } },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const evalRun = {
      id: crypto.randomUUID(),
      user_id: authResult.userId,
      org_id: authResult.orgId,
      name,
      dataset,
      config: config || {},
      status: 'pending',
      metrics: {},
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('eval_runs').insert(evalRun);

    if (error) {
      console.error('Eval run creation error:', error);
      return ServerErrors.internal('eval_run_create');
    }

    return NextResponse.json({
      success: true,
      run: evalRun,
    });
  } catch (error) {
    console.error('Eval run creation error:', error);
    return ServerErrors.internal('eval_run_create');
  }
}
