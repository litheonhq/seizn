/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';

// GET /api/fall/experiments
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('fall_experiments')
      .select(
        `
        id,
        name,
        description,
        status,
        allocation_strategy,
        unit,
        created_at,
        updated_at,
        arms:fall_experiment_arms (
          id,
          name,
          weight,
          config_override,
          created_at
        )
      `
      )
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, experiments: data ?? [] }, { status: 200 });
  } catch (err) {
    console.error('Fall experiments GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/fall/experiments
// Body:
// {
//   "name": "string",
//   "description"?: "string",
//   "status"?: "draft|running|stopped",
//   "allocation_strategy"?: "ab|bandit",
//   "unit"?: "user|api_key|session",
//   "arms": [{ "name": "...", "weight"?: 0.5, "config_override"?: {...} }]
// }
export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const body = await request.json();

    const name = body?.name;
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name (string) is required' }, { status: 400 });
    }

    const arms = Array.isArray(body?.arms) ? body.arms : [];
    if (arms.length < 2) {
      return NextResponse.json({ error: 'arms must contain at least 2 variants' }, { status: 400 });
    }

    const supabase = createServerClient();

    const { data: exp, error: expErr } = await supabase
      .from('fall_experiments')
      .insert({
        user_id: userId,
        name,
        description: body?.description ?? null,
        status: body?.status ?? 'draft',
        allocation_strategy: body?.allocation_strategy ?? 'ab',
        unit: body?.unit ?? 'user',
      })
      .select('id')
      .single();

    if (expErr) throw expErr;

    const experimentId = exp.id as string;

    const armRows = arms.map((a: any) => ({
      experiment_id: experimentId,
      name: String(a?.name ?? ''),
      weight: typeof a?.weight === 'number' ? a.weight : 0.5,
      config_override: a?.config_override ?? {},
    }));

    const { error: armsErr } = await supabase.from('fall_experiment_arms').insert(armRows);
    if (armsErr) throw armsErr;

    return NextResponse.json({ success: true, experiment_id: experimentId }, { status: 201 });
  } catch (err) {
    console.error('Fall experiments POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
