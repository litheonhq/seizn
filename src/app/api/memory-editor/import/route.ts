import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { resolveMemoryBudgetOrganizationId } from '@/lib/memory/budget';
import {
  commitMemoryEditorImport,
  previewMemoryEditorImport,
} from '@/lib/memory-editor/server';
import { logServerError } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 300;

function parseFormat(value: unknown): 'csv' | 'json' {
  return value === 'json' ? 'json' : 'csv';
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
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const content = typeof body.content === 'string' ? body.content : '';
    if (!content.trim()) {
      return NextResponse.json(
        { success: false, error: { code: 'empty_import', message: 'Import content is required' } },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const organizationId = await resolveMemoryBudgetOrganizationId(supabase, {
      userId: session.user.id,
      keyId: null,
    });
    const ctx = { supabase, userId: session.user.id, organizationId };
    const options = {
      format: parseFormat(body.format),
      content,
      npcId: typeof body.npcId === 'string' && body.npcId.trim() ? body.npcId.trim() : null,
    };

    if (body.commit === true) {
      const result = await commitMemoryEditorImport(ctx, options);
      return NextResponse.json(
        { success: result.diff.summary.blocked === 0, data: result },
        { status: result.diff.summary.blocked > 0 ? 422 : 200 }
      );
    }

    const diff = await previewMemoryEditorImport(ctx, options);
    return NextResponse.json({ success: true, data: { diff } });
  } catch (error) {
    logServerError('[api/memory-editor/import] failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'memory_editor_import_failed', message: 'Failed to import memory edits' } },
      { status: 500 }
    );
  }
}
