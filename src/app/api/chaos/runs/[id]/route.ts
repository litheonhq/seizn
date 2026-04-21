import { NextRequest, NextResponse } from 'next/server';
import { resolveChaosContext } from '@/lib/chaos/auth';
import { getChaosRun, runChaosRun } from '@/lib/chaos/runner';
import { logServerError } from '@/lib/server/logger';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await resolveChaosContext(request);
    if ('error' in context) return context.error;

    const { id } = await params;
    const result = await getChaosRun(context.organizationId, id);
    if (!result) {
      return NextResponse.json(
        { success: false, error: { code: 'chaos_run_not_found', message: 'Chaos run not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logServerError('[api/chaos/runs/id] GET failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'chaos_run_unavailable', message: 'Failed to load chaos run' } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await resolveChaosContext(request);
    if ('error' in context) return context.error;

    const { id } = await params;
    const current = await getChaosRun(context.organizationId, id);
    if (!current) {
      return NextResponse.json(
        { success: false, error: { code: 'chaos_run_not_found', message: 'Chaos run not found' } },
        { status: 404 }
      );
    }

    const result = await runChaosRun(id);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logServerError('[api/chaos/runs/id] POST failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'chaos_run_execute_failed', message: 'Failed to execute chaos run' } },
      { status: 500 }
    );
  }
}
