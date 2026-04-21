import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { resolveMemoryBudgetOrganizationId } from '@/lib/memory/budget';
import { generatePostMortemReport } from '@/lib/post-mortem/report';
import { logServerError } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 300;

function parseDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function defaultWindow(days: unknown) {
  const parsed = typeof days === 'number' ? days : Number(days);
  const safeDays = Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), 1), 180) : 30;
  const end = new Date();
  const start = new Date(end.getTime() - safeDays * 24 * 60 * 60 * 1000);
  return { start, end };
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: { code: 'unauthorized', message: 'Login required' } },
      { status: 401 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const supabase = createServerClient();
    const organizationId = await resolveMemoryBudgetOrganizationId(supabase, {
      userId: session.user.id,
      keyId: null,
    });

    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: { code: 'organization_required', message: 'No organization is available' } },
        { status: 400 }
      );
    }

    const fallback = defaultWindow((body as Record<string, unknown>).days);
    const windowStart = parseDate((body as Record<string, unknown>).windowStart) || fallback.start;
    const windowEnd = parseDate((body as Record<string, unknown>).windowEnd) || fallback.end;

    if (windowStart >= windowEnd) {
      return NextResponse.json(
        { success: false, error: { code: 'invalid_window', message: 'windowStart must be before windowEnd' } },
        { status: 400 }
      );
    }

    const result = await generatePostMortemReport({
      studioId: organizationId,
      userId: session.user.id,
      title: typeof (body as Record<string, unknown>).title === 'string'
        ? String((body as Record<string, unknown>).title)
        : null,
      notifyEmail: typeof session.user.email === 'string' ? session.user.email : null,
      windowStart,
      windowEnd,
      supabase,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logServerError('[api/post-mortem/generate] failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'post_mortem_generate_failed', message: 'Failed to generate post-mortem' } },
      { status: 500 }
    );
  }
}
