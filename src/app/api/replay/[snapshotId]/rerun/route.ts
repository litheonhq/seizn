import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getEffectivePlan, hasFeature } from '@/lib/plan-limits';
import { resolveReplayOrganizationId } from '@/lib/replay/snapshot';
import {
  diffReplays,
  loadReplaySnapshotRecord,
  persistReplayDiff,
  replayResultFromSnapshot,
  replaySnapshot,
} from '@/lib/replay/runner';
import { logServerError } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ snapshotId: string }>;
}

interface ReplayRateLimitEntry {
  count: number;
  resetAt: number;
}

const REPLAY_RERUN_LIMIT = 10;
const REPLAY_RERUN_WINDOW_MS = 60 * 1000;
const replayRerunRateStore = new Map<string, ReplayRateLimitEntry>();

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse('unauthorized', 'Authentication required.', 401);
    }

    const { snapshotId } = await params;
    const organizationId = await resolveReplayOrganizationId(session.user.id, null);
    if (!organizationId) {
      return errorResponse('replay_organization_required', 'Replay organization not found.', 403);
    }

    const snapshot = await loadReplaySnapshotRecord(snapshotId, organizationId);
    if (!snapshot) {
      return errorResponse('not_found', 'Replay snapshot not found.', 404);
    }

    const plan = await loadEffectiveUserPlan(session.user.id);
    if (!hasFeature(plan, 'replayRerun')) {
      return errorResponse(
        'plan_required',
        'Replay rerun requires a Pro or Enterprise plan.',
        403
      );
    }

    const rateLimit = checkReplayRerunRateLimit(organizationId);
    if (!rateLimit.allowed) {
      return withHeaders(
        errorResponse('rate_limit_exceeded', 'Replay rerun rate limit exceeded.', 429),
        rateLimit.headers
      );
    }

    const original = replayResultFromSnapshot(snapshot);
    const replayed = await replaySnapshot(snapshotId, {
      organizationId,
      userId: session.user.id,
    });
    const diff = diffReplays(original, replayed);

    await persistReplayDiff({ snapshotId, organizationId, diff });

    return withHeaders(
      NextResponse.json({
        success: true,
        data: {
          snapshotId,
          original,
          replayed,
          diff,
        },
      }),
      rateLimit.headers
    );
  } catch (error) {
    logServerError('Replay rerun failed', error);
    return errorResponse('replay_rerun_failed', 'Failed to rerun replay snapshot.', 500);
  }
}

async function loadEffectiveUserPlan(userId: string): Promise<string> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('plan, subscription_ends_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;

  return getEffectivePlan({
    plan: typeof data?.plan === 'string' ? data.plan : 'free',
    subscription_ends_at:
      typeof data?.subscription_ends_at === 'string' ? data.subscription_ends_at : null,
  });
}

function checkReplayRerunRateLimit(organizationId: string): {
  allowed: boolean;
  headers: Record<string, string>;
} {
  const now = Date.now();
  const existing = replayRerunRateStore.get(organizationId);
  const entry =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + REPLAY_RERUN_WINDOW_MS };

  entry.count += 1;
  replayRerunRateStore.set(organizationId, entry);

  const remaining = Math.max(0, REPLAY_RERUN_LIMIT - entry.count);
  const resetSeconds = Math.ceil(entry.resetAt / 1000);
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(REPLAY_RERUN_LIMIT),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(resetSeconds),
  };

  if (entry.count > REPLAY_RERUN_LIMIT) {
    headers['Retry-After'] = String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000)));
    return { allowed: false, headers };
  }

  return { allowed: true, headers };
}

function errorResponse(code: string, message: string, status: number): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: { code, message },
    },
    { status }
  );
}

function withHeaders(response: NextResponse, headers: Record<string, string>): NextResponse {
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}
