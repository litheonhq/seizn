import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, authErrorResponse, isAuthError } from '@/lib/api-auth';
import { auth } from '@/lib/auth';
import { resolveMemoryBudgetOrganizationId } from '@/lib/memory/budget';
import { loadNpcTimeline } from '@/lib/npc-graph/server';
import { renderTimelineSvg } from '@/lib/npc-graph/svg';
import { logServerError } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function resolveContext(request: NextRequest) {
  const authResult = await authenticateRequest(request, { skipUsageCheck: true });
  let userId: string | null = null;
  let keyId: string | null = null;

  if (!isAuthError(authResult)) {
    userId = authResult.userId;
    keyId = authResult.keyId;
  } else {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: authErrorResponse(authResult.authError) };
    }
    userId = session.user.id;
  }

  const supabase = createServerClient();
  const organizationId = await resolveMemoryBudgetOrganizationId(supabase, { userId, keyId });
  return { supabase, userId, organizationId };
}

function parseLimit(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), 1), 1000) : 500;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await resolveContext(request);
    if ('error' in context) return context.error;

    const { id } = await params;
    const url = new URL(request.url);
    const timeline = await loadNpcTimeline(context, decodeURIComponent(id), {
      limit: parseLimit(url.searchParams.get('limit')),
    });

    if (url.searchParams.get('format') === 'svg') {
      return new NextResponse(renderTimelineSvg(timeline), {
        headers: {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Content-Disposition': `attachment; filename="${timeline.npcId}-timeline.svg"`,
        },
      });
    }

    return NextResponse.json({ success: true, data: { timeline } });
  } catch (error) {
    logServerError('[api/npcs/:id/timeline] GET failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'npc_timeline_unavailable', message: 'Failed to load NPC timeline' } },
      { status: 500 }
    );
  }
}
