import { NextRequest, NextResponse } from 'next/server';
import { exportNpcSaveFile } from '@/lib/save-file/bundle';
import { resolveSaveFileContext } from '@/lib/save-file/auth';
import { logServerError } from '@/lib/server/logger';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ npcId: string }>;
}

function filename(npcId: string) {
  const safeNpc = npcId.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'npc';
  return `seizn-${safeNpc}.szs`;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await resolveSaveFileContext(request);
    if ('error' in context) return context.error;

    const { npcId } = await params;
    const result = await exportNpcSaveFile({
      userId: context.userId,
      organizationId: context.organizationId,
      npcId,
    });

    return new NextResponse(result.file, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.seizn.savefile',
        'Content-Disposition': `attachment; filename="${filename(npcId)}"`,
        'X-Seizn-Save-SHA256': result.sha256,
        'X-Seizn-Memory-Count': String(result.payload.meta.memoryCount),
        'X-Seizn-Belief-Count': String(result.payload.meta.beliefCount),
        'X-Seizn-Canon-Lock-Count': String(result.payload.meta.canonLockCount),
      },
    });
  } catch (error) {
    logServerError('[save-file/export] failed', error);
    const message = error instanceof Error ? error.message : 'save_file_export_failed';
    return NextResponse.json(
      { success: false, error: { code: 'save_file_export_failed', message } },
      { status: 500 }
    );
  }
}
