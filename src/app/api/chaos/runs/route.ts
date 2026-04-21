import { NextRequest, NextResponse } from 'next/server';
import { resolveChaosContext } from '@/lib/chaos/auth';
import { createChaosRun, listChaosRuns } from '@/lib/chaos/runner';
import { logServerError } from '@/lib/server/logger';

export const runtime = 'nodejs';

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePromptCount(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value || 100);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(Math.floor(parsed), 1), 5000);
}

export async function GET(request: NextRequest) {
  try {
    const context = await resolveChaosContext(request);
    if ('error' in context) return context.error;

    const runs = await listChaosRuns(context.organizationId);
    return NextResponse.json({ success: true, data: { runs } });
  } catch (error) {
    logServerError('[api/chaos/runs] GET failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'chaos_runs_unavailable', message: 'Failed to list chaos runs' } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await resolveChaosContext(request);
    if ('error' in context) return context.error;

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const npcId = normalizeOptionalString(body.npcId ?? body.npc_id);
    if (!npcId) {
      return NextResponse.json(
        { success: false, error: { code: 'npc_id_required', message: 'npcId is required' } },
        { status: 400 }
      );
    }

    const run = await createChaosRun({
      studioId: context.organizationId,
      userId: context.userId,
      npcId,
      suite: normalizeOptionalString(body.suite) || 'basic',
      promptCount: normalizePromptCount(body.promptCount ?? body.prompt_count),
      targetEndpoint: normalizeOptionalString(body.targetEndpoint ?? body.target_endpoint),
    });

    return NextResponse.json({ success: true, data: { run } }, { status: 201 });
  } catch (error) {
    logServerError('[api/chaos/runs] POST failed', error);
    const message = error instanceof Error ? error.message : 'chaos_run_create_failed';
    if (message.includes('chaos_target_endpoint')) {
      return NextResponse.json(
        { success: false, error: { code: 'invalid_target_endpoint', message } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'chaos_run_create_failed', message: 'Failed to create chaos run' } },
      { status: 500 }
    );
  }
}
