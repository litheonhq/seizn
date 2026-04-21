import { NextRequest, NextResponse } from 'next/server';
import { importNpcSaveFile } from '@/lib/save-file/bundle';
import { resolveSaveFileContext } from '@/lib/save-file/auth';
import { logServerError } from '@/lib/server/logger';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const context = await resolveSaveFileContext(request);
    if ('error' in context) return context.error;

    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'empty_save_file', message: 'Save-file payload is empty' } },
        { status: 400 }
      );
    }

    const result = await importNpcSaveFile({
      userId: context.userId,
      organizationId: context.organizationId,
    }, bytes);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logServerError('[save-file/import] failed', error);
    const message = error instanceof Error ? error.message : 'save_file_import_failed';
    const status = message.includes('signature') || message.includes('magic') || message.includes('length') ? 400 : 500;
    return NextResponse.json(
      { success: false, error: { code: 'save_file_import_failed', message } },
      { status }
    );
  }
}
