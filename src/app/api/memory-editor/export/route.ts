import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { resolveMemoryBudgetOrganizationId } from '@/lib/memory/budget';
import { memoryRowsToCsv } from '@/lib/memory-editor/diff';
import { loadMemoryEditorRows } from '@/lib/memory-editor/server';
import { logServerError } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';

function fileName(format: 'csv' | 'json', npcId: string | null) {
  const suffix = npcId ? `-${npcId.replace(/[^a-zA-Z0-9_-]/g, '-')}` : '';
  return `seizn-memory-editor${suffix}.${format}`;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: { code: 'unauthorized', message: 'Login required' } },
      { status: 401 }
    );
  }

  try {
    const url = new URL(request.url);
    const format = url.searchParams.get('format') === 'json' ? 'json' : 'csv';
    const npcId = url.searchParams.get('npc_id')?.trim() || null;
    const supabase = createServerClient();
    const organizationId = await resolveMemoryBudgetOrganizationId(supabase, {
      userId: session.user.id,
      keyId: null,
    });
    const memories = await loadMemoryEditorRows(
      { supabase, userId: session.user.id, organizationId },
      { npcId, limit: 5000 }
    );

    if (format === 'json') {
      return new NextResponse(JSON.stringify({ rows: memories }, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileName(format, npcId)}"`,
        },
      });
    }

    return new NextResponse(memoryRowsToCsv(memories), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName(format, npcId)}"`,
      },
    });
  } catch (error) {
    logServerError('[api/memory-editor/export] failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'memory_editor_export_failed', message: 'Failed to export memories' } },
      { status: 500 }
    );
  }
}
